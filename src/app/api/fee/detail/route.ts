import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { sesi, kelas, trainer, feeRule, payslipItem, payslip } from "@/db/schema";
import { eq } from "drizzle-orm";

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

  const rows = await db
    .select({
      sesiId: sesi.id,
      status: sesi.status,
      kelasId: sesi.kelasId,
      kelasNama: kelas.nama,
      pertemuanKe: sesi.pertemuanKe,
      tanggal: sesi.tanggal,
      materi: sesi.materi,
      ratePerSesi: feeRule.ratePerSesi,
      payslipId: payslipItem.payslipId,
      payslipPeriode: payslip.periode,
      payslipStatus: payslip.status,
    })
    .from(sesi)
    .innerJoin(kelas, eq(sesi.kelasId, kelas.id))
    .leftJoin(feeRule, eq(feeRule.kelasId, kelas.id))
    .leftJoin(payslipItem, eq(payslipItem.sesiId, sesi.id))
    .leftJoin(payslip, eq(payslip.id, payslipItem.payslipId))
    .where(eq(kelas.trainerId, trainerId));

  const detail = rows
    .filter((r) => r.status === "selesai")
    .map((r) => ({
      sesiId: r.sesiId,
      kelasId: r.kelasId,
      kelasNama: r.kelasNama,
      pertemuanKe: r.pertemuanKe,
      tanggal: r.tanggal,
      materi: r.materi,
      ratePerSesi: r.ratePerSesi ?? 0,
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
