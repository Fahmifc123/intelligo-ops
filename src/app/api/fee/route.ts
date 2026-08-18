import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { sesi, kelas, trainer, feeRule } from "@/db/schema";
import { eq, and, gte, lte } from "drizzle-orm";

// GET /api/fee?periode=2026-08  (periode = YYYY-MM, filter by sesi.tanggal)
// Menghitung total fee per trainer: jumlah sesi status "selesai" x rate_per_sesi kelas terkait
export async function GET(req: NextRequest) {
  const periode = req.nextUrl.searchParams.get("periode");

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
    })
    .from(sesi)
    .leftJoin(kelas, eq(sesi.kelasId, kelas.id))
    .leftJoin(trainer, eq(kelas.trainerId, trainer.id))
    .leftJoin(feeRule, eq(feeRule.kelasId, kelas.id))
    .where(eq(sesi.status, "selesai"));

  if (periode) {
    rows = rows.filter((r) => r.tanggal?.startsWith(periode));
  }

  const rekap: Record<
    string,
    { trainerId: string; trainerNama: string; jumlahSesi: number; totalFee: number }
  > = {};

  for (const r of rows) {
    if (!r.trainerId) continue;
    const rate = r.ratePerSesi ?? 0;
    if (!rekap[r.trainerId]) {
      rekap[r.trainerId] = {
        trainerId: r.trainerId,
        trainerNama: r.trainerNama ?? "-",
        jumlahSesi: 0,
        totalFee: 0,
      };
    }
    rekap[r.trainerId].jumlahSesi += 1;
    rekap[r.trainerId].totalFee += rate;
  }

  return NextResponse.json(Object.values(rekap));
}
