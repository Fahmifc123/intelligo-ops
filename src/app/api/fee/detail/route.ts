import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { sesi, kelas, trainer, payslipItem, payslip } from "@/db/schema";
import { eq } from "drizzle-orm";
import { hitungRatePerSesi, trainerEfektif } from "@/lib/feeQuery";

// GET /api/fee/detail?trainerId=...
// Detail sesi "selesai" milik satu trainer (dikelompokkan per kelas lewat
// field kelasId/kelasNama), dipakai buat wizard "Buat Payslip" di halaman
// Payslip. Tiap sesi dikasih tau udah nempel payslip mana (kalau ada),
// biar checkbox-nya bisa di-disable dan dikasih label.
export async function GET(req: NextRequest) {
  const trainerId = req.nextUrl.searchParams.get("trainerId");
  if (!trainerId) {
    return NextResponse.json({ error: "trainerId wajib diisi" }, { status: 400 });
  }

  const [t] = await db.select().from(trainer).where(eq(trainer.id, trainerId));

  // Rate skema paket butuh jumlah sesi penuh per kelas, jadi dihitung dari
  // seluruh sesi - bukan cuma punya trainer ini.
  const rateMap = await hitungRatePerSesi();

  const rows = await db
    .select({
      sesiId: sesi.id,
      status: sesi.status,
      kelasId: sesi.kelasId,
      kelasNama: kelas.nama,
      pertemuanKe: sesi.pertemuanKe,
      tanggal: sesi.tanggal,
      materi: sesi.materi,
      sesiTrainerId: sesi.trainerId,
      kelasTrainerId: kelas.trainerId,
      tanpaFee: sesi.tanpaFee,
      payslipId: payslipItem.payslipId,
      payslipPeriode: payslip.periode,
      payslipStatus: payslip.status,
    })
    .from(sesi)
    .innerJoin(kelas, eq(sesi.kelasId, kelas.id))
    .leftJoin(payslipItem, eq(payslipItem.sesiId, sesi.id))
    .leftJoin(payslip, eq(payslip.id, payslipItem.payslipId));

  const detail = rows
    // Sesi milik trainer ini = yang dia ajar sendiri, ATAU sesi tanpa
    // trainer di kelas yang dia pegang. Bukan lagi "semua sesi di kelasnya" -
    // satu kelas bisa diajar beberapa trainer.
    .filter(
      (r) =>
        r.status === "selesai" &&
        !r.tanpaFee &&
        trainerEfektif(r.sesiTrainerId, r.kelasTrainerId) === trainerId
    )
    .map((r) => ({
      sesiId: r.sesiId,
      kelasId: r.kelasId,
      kelasNama: r.kelasNama,
      pertemuanKe: r.pertemuanKe,
      tanggal: r.tanggal,
      materi: r.materi,
      ratePerSesi: rateMap[r.sesiId] ?? 0,
      sudahDiPayslip: r.payslipId !== null,
      payslipId: r.payslipId,
      payslipPeriode: r.payslipPeriode,
      payslipStatus: r.payslipStatus,
    }))
    .sort((a, b) => {
      if (a.kelasNama !== b.kelasNama) return (a.kelasNama ?? "").localeCompare(b.kelasNama ?? "");
      return a.pertemuanKe - b.pertemuanKe;
    });

  return NextResponse.json({ trainerId, trainerNama: t?.nama ?? "-", sesi: detail });
}
