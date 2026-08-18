import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { sesi, kelas, trainer, feeRule, payslipItem, payslip } from "@/db/schema";
import { eq } from "drizzle-orm";

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
      trainerId: trainer.id,
      trainerNama: trainer.nama,
      ratePerSesi: feeRule.ratePerSesi,
      payslipStatus: payslip.status,
    })
    .from(sesi)
    .leftJoin(kelas, eq(sesi.kelasId, kelas.id))
    .leftJoin(trainer, eq(kelas.trainerId, trainer.id))
    .leftJoin(feeRule, eq(feeRule.kelasId, kelas.id))
    .leftJoin(payslipItem, eq(payslipItem.sesiId, sesi.id))
    .leftJoin(payslip, eq(payslip.id, payslipItem.payslipId))
    .where(eq(sesi.status, "selesai"));

  if (periode) {
    rows = rows.filter((r) => r.tanggal?.startsWith(periode));
  }
  if (trainerIdFilter) {
    rows = rows.filter((r) => r.trainerId === trainerIdFilter);
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
    if (!r.trainerId) continue;
    const rate = r.ratePerSesi ?? 0;
    if (!rekap[r.trainerId]) {
      rekap[r.trainerId] = {
        trainerId: r.trainerId,
        trainerNama: r.trainerNama ?? "-",
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
    const acc = rekap[r.trainerId];
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
