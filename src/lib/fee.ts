/**
 * Perhitungan fee per sesi.
 *
 * Ada dua skema (lihat komentar di feeRule, src/db/schema.ts):
 *
 *   flat  - rate per sesi tetap. Sesi nambah, fee ikut nambah.
 *   paket - total kelas dikunci (mis. 10jt). Rate per sesi = total dibagi
 *           jumlah sesi yang beneran ada, jadi total dibayar selalu sama
 *           berapapun sesinya.
 *
 * Kenapa gak simpen aja hasil bagi di DB sekali? Karena jumlah sesi bisa
 * berubah (ditambah/dibatalin), dan kalau rate-nya statis, total bayaran
 * bakal meleset dari harga yang udah disepakati.
 */

export type SkemaFee = "flat" | "paket";

export type FeeRuleInput = {
  skema: string | null;
  ratePerSesi: number | null;
  totalPaket: number | null;
  targetSesi: number | null;
};

/**
 * Bagi `total` ke `n` sesi dalam rupiah bulat, dengan sisa pembagian
 * diserap di sesi TERAKHIR supaya jumlahnya persis sama dengan `total`.
 *
 * Contoh: 10.000.000 dibagi 15 ->
 *   sesi 1-14 : 666.667  (14 x 666.667 = 9.333.338)
 *   sesi 15   : 666.662  <- nyerap sisa
 *   jumlah    : 10.000.000  pas
 *
 * Dibulatin ke rupiah utuh karena transfer bank gak kenal pecahan sen,
 * dan angka di payslip harus sama persis sama yang ditransfer.
 */
export function bagiRata(total: number, n: number): number[] {
  if (n <= 0) return [];

  const dasar = Math.round(total / n);
  const hasil = Array<number>(n).fill(dasar);
  // Selisih akibat pembulatan ditaruh di sesi terakhir. Bisa plus atau
  // minus tergantung arah pembulatannya.
  hasil[n - 1] = total - dasar * (n - 1);
  return hasil;
}

/**
 * Rate untuk SATU sesi tertentu.
 *
 * @param rule        baris fee_rule kelas terkait
 * @param urutanSesi  index sesi ini (0-based) di antara semua sesi kelasnya
 * @param totalSesi   jumlah seluruh sesi kelas itu
 *
 * Untuk skema flat, dua argumen terakhir gak dipakai.
 */
export function rateSesi(
  rule: FeeRuleInput | null | undefined,
  urutanSesi: number,
  totalSesi: number
): number {
  if (!rule) return 0;

  if (rule.skema !== "paket" || rule.totalPaket === null) {
    return rule.ratePerSesi ?? 0;
  }

  // Belum ada sesi sama sekali - gak ada yang bisa dibagi.
  if (totalSesi <= 0) return 0;

  const porsi = bagiRata(rule.totalPaket, totalSesi);
  return porsi[urutanSesi] ?? 0;
}

/**
 * Rate rata-rata per sesi, buat ditampilin di UI ("Rp 666.667 / sesi").
 * Bukan angka yang dipakai buat ngitung duit - itu selalu lewat rateSesi().
 */
export function rateRataRata(
  rule: FeeRuleInput | null | undefined,
  totalSesi: number
): number {
  if (!rule) return 0;
  if (rule.skema !== "paket" || rule.totalPaket === null) {
    return rule.ratePerSesi ?? 0;
  }
  // Sebelum ada sesi, pakai target sebagai perkiraan biar admin tetap
  // lihat angka pas bikin kelas.
  const pembagi = totalSesi > 0 ? totalSesi : (rule.targetSesi ?? 0);
  if (pembagi <= 0) return 0;
  return Math.round(rule.totalPaket / pembagi);
}

/**
 * Petakan daftar sesi (urut) jadi rate masing-masing. Dipakai di endpoint
 * yang ngolah banyak sesi sekaligus - fee rekap & pembuatan payslip.
 *
 * Urutan sesi menentukan siapa yang kena penyesuaian pembulatan, jadi
 * pemanggil harus ngasih urutan yang stabil (di sini: pertemuanKe, lalu id).
 */
export function rateSemuaSesi(
  rule: FeeRuleInput | null | undefined,
  sesiIdsTerurut: string[]
): Record<string, number> {
  const out: Record<string, number> = {};
  const n = sesiIdsTerurut.length;
  for (let i = 0; i < n; i++) {
    out[sesiIdsTerurut[i]] = rateSesi(rule, i, n);
  }
  return out;
}

export type BarisSesi = {
  id: string;
  kelasId: string;
  pertemuanKe: number;
  /** Trainer yang ngajar sesi ini (sesi.trainerId ?? kelas.trainerId). */
  trainerId: string | null;
};

/** Kunci gabungan buat cari aturan fee satu trainer di satu kelas. */
export function kunciFee(kelasId: string, trainerId: string | null): string {
  return `${kelasId}::${trainerId ?? ""}`;
}

/**
 * Cari aturan fee yang berlaku buat satu trainer di satu kelas.
 *
 * Yang spesifik menang: kalau ada baris khusus trainer ini, itu yang dipakai.
 * Kalau nggak ada, jatuh ke baris lama yang trainerId-nya null (aturan
 * se-kelas dari sebelum fitur multi-trainer).
 */
export function cariRule(
  rules: Record<string, FeeRuleInput>,
  kelasId: string,
  trainerId: string | null
): FeeRuleInput | null {
  return (
    rules[kunciFee(kelasId, trainerId)] ?? rules[kunciFee(kelasId, null)] ?? null
  );
}

/**
 * Bikin peta { sesiId -> rate } untuk SEMUA sesi di database.
 *
 * Dikelompokkan per (kelas, trainer), bukan per kelas: satu kelas bisa
 * diajar beberapa trainer dengan kesepakatan beda-beda, dan buat skema
 * paket pembaginya adalah jumlah sesi YANG TRAINER ITU AJAR - bukan total
 * sesi kelasnya. Kalau digabung, jatah 5jt Budi bakal ikut kebagi ke sesi
 * yang diajar Andi.
 *
 * Sengaja gak nerima filter periode/trainer: pembagi skema paket harus
 * dihitung dari populasi penuh. Kalau pembaginya cuma sesi bulan ini,
 * tiap sesi kebagian jatah kegedean dan total bayaran ngelewatin
 * kesepakatan. Pemanggil nyaring hasilnya belakangan.
 */
export function petaRateSesi(
  semuaSesi: BarisSesi[],
  rules: Record<string, FeeRuleInput>
): Record<string, number> {
  const grup: Record<string, BarisSesi[]> = {};
  for (const s of semuaSesi) {
    (grup[kunciFee(s.kelasId, s.trainerId)] ??= []).push(s);
  }

  const out: Record<string, number> = {};
  for (const list of Object.values(grup)) {
    // Urutan nentuin sesi mana yang nyerap sisa pembulatan, jadi harus
    // stabil & sama di semua endpoint - pertemuanKe dulu, id buat tie-break.
    list.sort((a, b) => a.pertemuanKe - b.pertemuanKe || a.id.localeCompare(b.id));
    const rule = cariRule(rules, list[0].kelasId, list[0].trainerId);
    Object.assign(out, rateSemuaSesi(rule, list.map((s) => s.id)));
  }
  return out;
}
