import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { sesi, kelas, trainer, payslipItem, payslip } from "@/db/schema";
import { eq } from "drizzle-orm";
import { hitungRatePerSesi, trainerEfektif } from "@/lib/feeQuery";

// GET /api/fee?periode=2026-08&trainerId=...&kelasId=...  (semua opsional)
// Rekap fee per trainer dari sesi status "selesai" x rate_per_sesi kelas
// terkait, DIPECAH per status pembayaran (lewat payslip yang nempel ke
// tiap sesi, kalau ada):
//   - lunas: sesi ada di payslip berstatus "lunas"
//   - belumDibayar: sesi ada di payslip berstatus "draft" atau "belum_dibayar"
//   - belumDiPayslip: sesi selesai tapi belum masuk payslip manapun
// jumlahSesi/totalFee tetap ada sebagai grand total ketiganya, buat
// kompatibel sama pemanggil lama yang cuma butuh angka total.
// Filter trainerId/kelasId diterapkan SEBELUM agregasi, biar summary per
// trainer yang dibalikin udah scoped ke kelas/trainer yang dipilih.
export async function GET(req: NextRequest) {
  const periode = req.nextUrl.searchParams.get("periode");
  const trainerIdFilter = req.nextUrl.searchParams.get("trainerId");
  const kelasIdFilter = req.nextUrl.searchParams.get("kelasId");

  let rows = await db
    .select({
      sesiId: sesi.id,
      tanggal: sesi.tanggal,
      status: sesi.status,
      kelasId: kelas.id,
      kelasNama: kelas.nama,
      // Trainer yang beneran ngajar sesi ini - bisa beda dari trainer
      // utama kelas kalau kelasnya diajar gantian.
      sesiTrainerId: sesi.trainerId,
      kelasTrainerId: kelas.trainerId,
      payslipStatus: payslip.status,
    })
    .from(sesi)
    .leftJoin(kelas, eq(sesi.kelasId, kelas.id))
    .leftJoin(payslipItem, eq(payslipItem.sesiId, sesi.id))
    .leftJoin(payslip, eq(payslip.id, payslipItem.payslipId))
    .where(eq(sesi.status, "selesai"));

  // Nama trainer diambil terpisah - join langsung bakal ngikut trainer
  // kelas, padahal yang kita mau trainer per sesi.
  const namaTrainer = Object.fromEntries(
    (await db.select({ id: trainer.id, nama: trainer.nama }).from(trainer)).map(
      (t) => [t.id, t.nama]
    )
  );

  // Rate skema paket = totalPaket / SELURUH sesi kelasnya, jadi harus
  // dihitung sebelum filter periode/trainer/kelas dipasang. Kalau dihitung
  // setelah filter, rekap bulanan bakal ngebagi total paket cuma ke sesi
  // bulan itu aja - angkanya jadi kegedean.
  const rateMap = await hitungRatePerSesi();

  if (periode) {
    rows = rows.filter((r) => r.tanggal?.startsWith(periode));
  }
  if (trainerIdFilter) {
    rows = rows.filter(
      (r) => trainerEfektif(r.sesiTrainerId, r.kelasTrainerId) === trainerIdFilter
    );
  }
  if (kelasIdFilter) {
    rows = rows.filter((r) => r.kelasId === kelasIdFilter);
  }

  type Rekap = {
    trainerId: string;
    trainerNama: string;
    jumlahSesi: number;
    totalFee: number;
    sesiLunas: number;
    feeLunas: number;
    sesiBelumDibayar: number;
    feeBelumDibayar: number;
    sesiBelumDiPayslip: number;
    feeBelumDiPayslip: number;
    kelasIds: Set<string>;
  };

  const rekap: Record<string, Rekap> = {};

  for (const r of rows) {
    const tid = trainerEfektif(r.sesiTrainerId, r.kelasTrainerId);
    if (!tid) continue;
    // Dari peta yang dihitung di atas - udah bener buat flat maupun paket.
    const rate = rateMap[r.sesiId] ?? 0;
    if (!rekap[tid]) {
      rekap[tid] = {
        trainerId: tid,
        trainerNama: namaTrainer[tid] ?? "-",
        jumlahSesi: 0,
        totalFee: 0,
        sesiLunas: 0,
        feeLunas: 0,
        sesiBelumDibayar: 0,
        feeBelumDibayar: 0,
        sesiBelumDiPayslip: 0,
        feeBelumDiPayslip: 0,
        kelasIds: new Set(),
      };
    }
    const acc = rekap[tid];
    acc.jumlahSesi += 1;
    acc.totalFee += rate;
    if (r.kelasId) acc.kelasIds.add(r.kelasId);

    if (r.payslipStatus === "lunas") {
      acc.sesiLunas += 1;
      acc.feeLunas += rate;
    } else if (r.payslipStatus === "draft" || r.payslipStatus === "belum_dibayar") {
      acc.sesiBelumDibayar += 1;
      acc.feeBelumDibayar += rate;
    } else {
      acc.sesiBelumDiPayslip += 1;
      acc.feeBelumDiPayslip += rate;
    }
  }

  const result = Object.values(rekap).map((r) => ({
    ...r,
    kelasIds: Array.from(r.kelasIds),
  }));

  return NextResponse.json(result);
}
