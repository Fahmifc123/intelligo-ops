import { db } from "@/db";
import { sesi, feeRule } from "@/db/schema";
import { petaRateSesi, type FeeRuleInput } from "./fee";

/**
 * Peta { sesiId -> rate } buat SEMUA sesi di database.
 *
 * Dipisah dari src/lib/fee.ts (yang murni hitungan, gampang dites) karena
 * yang ini nyentuh DB. Dipakai bareng-bareng sama /api/fee, /api/fee/detail,
 * dan pembuatan payslip supaya angkanya konsisten di ketiganya.
 *
 * Sengaja narik SEMUA sesi, bukan yang lagi difilter: rate skema paket
 * pembaginya jumlah sesi penuh per kelas. Pemanggil nyaring hasilnya sendiri.
 */
export async function hitungRatePerSesi(): Promise<Record<string, number>> {
  const [semuaSesi, rules] = await Promise.all([
    db
      .select({ id: sesi.id, kelasId: sesi.kelasId, pertemuanKe: sesi.pertemuanKe })
      .from(sesi),
    db.select().from(feeRule),
  ]);

  const rulePerKelas: Record<string, FeeRuleInput> = Object.fromEntries(
    rules.map((r) => [r.kelasId, r])
  );
  return petaRateSesi(semuaSesi, rulePerKelas);
}
