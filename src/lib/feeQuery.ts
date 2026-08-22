import { eq } from "drizzle-orm";
import { db } from "@/db";
import { sesi, feeRule, kelas } from "@/db/schema";
import { petaRateSesi, kunciFee, type FeeRuleInput, type BarisSesi } from "./fee";

/**
 * Trainer efektif sebuah sesi: yang tercatat di sesi itu sendiri, atau
 * kalau kosong, trainer utama kelasnya.
 *
 * Sesi lama (sebelum fitur multi-trainer) trainerId-nya null, jadi otomatis
 * jatuh ke trainer kelas - persis kayak perilaku sebelumnya.
 */
export function trainerEfektif(
  sesiTrainerId: string | null,
  kelasTrainerId: string | null
): string | null {
  return sesiTrainerId ?? kelasTrainerId ?? null;
}

/**
 * Peta { sesiId -> rate } buat SEMUA sesi di database.
 *
 * Dipisah dari src/lib/fee.ts (yang murni hitungan, gampang dites) karena
 * yang ini nyentuh DB. Dipakai bareng-bareng sama /api/fee, /api/fee/detail,
 * dan pembuatan payslip supaya angkanya konsisten di ketiganya.
 *
 * Sengaja narik SEMUA sesi, bukan yang lagi difilter: rate skema paket
 * pembaginya jumlah sesi penuh per (kelas, trainer). Pemanggil nyaring
 * hasilnya sendiri.
 */
export async function hitungRatePerSesi(): Promise<Record<string, number>> {
  const [rows, rules] = await Promise.all([
    db
      .select({
        id: sesi.id,
        kelasId: sesi.kelasId,
        pertemuanKe: sesi.pertemuanKe,
        sesiTrainerId: sesi.trainerId,
        kelasTrainerId: kelas.trainerId,
      })
      .from(sesi)
      .leftJoin(kelas, eq(sesi.kelasId, kelas.id)),
    db.select().from(feeRule),
  ]);

  const semuaSesi: BarisSesi[] = rows.map((r) => ({
    id: r.id,
    kelasId: r.kelasId,
    pertemuanKe: r.pertemuanKe,
    trainerId: trainerEfektif(r.sesiTrainerId, r.kelasTrainerId),
  }));

  // Baris fee di-index pakai kunci (kelas, trainer). Baris lama yang
  // trainerId-nya null tetap masuk sebagai fallback se-kelas.
  const index: Record<string, FeeRuleInput> = {};
  for (const r of rules) {
    index[kunciFee(r.kelasId, r.trainerId)] = r;
  }

  return petaRateSesi(semuaSesi, index);
}
