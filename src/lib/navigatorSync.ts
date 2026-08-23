import { db } from "@/db";
import { sesi, trainer, kelas } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import {
  extractSheetId,
  fetchSheetRows as fetchSheetRowsBase,
} from "./googleSheetCsv";

export { extractSheetId };

/**
 * Baca sheet Navigator langsung dari URL export CSV publik Google Sheets -
 * GAK BUTUH service account / kredensial apapun. Syaratnya cuma satu:
 * sheet-nya harus di-share "Anyone with the link can view" (bukan private).
 *
 * Kolom di sheet di-deteksi otomatis dari header row, bukan index tetap -
 * jadi urutan kolom boleh beda-beda antar sheet. WAJIB ada kolom
 * "Pertemuan" (case-insensitive).
 *
 * Kolom "Trainer" OPSIONAL: banyak sheet private course cuma dipakai satu
 * trainer doang, jadi gak semua sheet nyantumin kolom itu. Kalau gak
 * ketemu, sesi dianggap semuanya diajar trainer utama kelas (kelas.trainerId),
 * dan status "selesai" ditentuin dari kolom Record keisi - bukan dari
 * Trainer, karena kolomnya emang gak ada. Lihat syncKelasFromNavigator().
 */
const HEADER_ALIASES: Record<string, string[]> = {
  pertemuan: ["pertemuan"],
  trainer: ["trainer"],
  tanggal: ["date", "tanggal"],
  materi: ["judul materi", "materi", "topik"],
  record: ["record", "link record"],
};

const DEFAULT_TAB_NAME = "Sheet1";

/**
 * Nilai khusus di kolom Trainer yang BUKAN nama trainer - penanda sesi
 * materi rekaman/pre-recorded, bukan sesi live yang diajar seseorang.
 * Dicocokin case-insensitive & di-trim, biar "video course", "Video Course "
 * dst semua ketangkep.
 *
 * Sesi kayak gini ditandai selesai (materinya emang udah tersedia), tapi
 * dikeluarkan total dari perhitungan fee - lihat komentar di
 * schema.ts (sesi.tanpaFee) buat alasan lengkapnya.
 */
const TRAINER_TANPA_FEE = new Set(["video course"]);

function isTrainerTanpaFee(namaSheet: string): boolean {
  return TRAINER_TANPA_FEE.has(namaSheet.trim().toLowerCase());
}

// fetchSheetRows & extractSheetId dipakai bareng sama trainerSync.ts -
// lihat src/lib/googleSheetCsv.ts. Sheet Navigator, beda dari sheet Google
// Form trainer, bisa punya banyak tab - makanya tabName di sini defaultnya
// DEFAULT_TAB_NAME, bukan dibiarin kosong (yang berarti "tab pertama").
async function fetchSheetRows(sheetId: string, tabName = DEFAULT_TAB_NAME): Promise<string[][]> {
  return fetchSheetRowsBase(sheetId, tabName);
}

/**
 * Deteksi kolom dari header row. Dicoba 3 tahap makin longgar, biar
 * variasi penamaan antar sheet ("Pertemuan" vs "Pertemuan ke" vs
 * "Judul Materi") tetap kebaca tanpa perlu setting manual:
 *   1. exact match  - "pertemuan" === "pertemuan"
 *   2. prefix match - "pertemuan ke" diawali "pertemuan"
 *   3. contains     - "judul materi" mengandung "materi"
 * Kolom yang udah kepakai gak dipakai ulang buat field lain.
 *
 * `override` (opsional) = mapping manual dari user, formatnya
 * { pertemuan: 3, trainer: 12 }. Kalau ada, itu yang menang - dipakai
 * buat sheet yang nama kolomnya gak ketebak sama sekali.
 */
export function detectColumns(
  headerRow: string[],
  override?: Record<string, number> | null
): Record<string, number> {
  const normalized = headerRow.map((h) => (h || "").toString().trim().toLowerCase());
  const map: Record<string, number> = {};
  const used = new Set<number>();

  // Mapping manual dipasang duluan biar auto-detect gak nimpa pilihan user.
  if (override) {
    for (const [field, idx] of Object.entries(override)) {
      if (typeof idx === "number" && idx >= 0 && idx < headerRow.length) {
        map[field] = idx;
        used.add(idx);
      }
    }
  }

  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
    if (map[field] !== undefined) continue; // udah di-override manual

    let idx = normalized.findIndex((h, i) => !used.has(i) && aliases.includes(h));
    if (idx === -1) {
      idx = normalized.findIndex(
        (h, i) => !used.has(i) && h && aliases.some((a) => h.startsWith(a))
      );
    }
    if (idx === -1) {
      idx = normalized.findIndex(
        (h, i) => !used.has(i) && h && aliases.some((a) => h.includes(a))
      );
    }

    if (idx !== -1) {
      map[field] = idx;
      used.add(idx);
    }
  }

  if (map.pertemuan === undefined) {
    throw new Error(
      `Kolom "Pertemuan" gak ketemu otomatis di sheet ini. Kolom yang ada: ${headerRow
        .filter(Boolean)
        .join(", ")}. Pilih kolomnya manual lewat "Atur kolom manual".`
    );
  }

  return map;
}

/** True kalau sheet ini gak punya kolom Trainer - sync-nya bakal pakai
 * trainer tunggal dari kelas.trainerId, bukan baca per-baris dari sheet. */
export function butuhTrainerManual(cols: Record<string, number>): boolean {
  return cols.trainer === undefined;
}

/**
 * Parse tanggal dari sheet Navigator ke format ISO "YYYY-MM-DD".
 *
 * PENTING: sheet Navigator nulis tanggal format Indonesia DD/MM/YYYY
 * (mis. "2/6/2026" = 6 Februari... SALAH, itu maksudnya 2 Juni 2026).
 * `new Date(string)` bawaan JS nge-parse itu sebagai format Amerika
 * MM/DD/YYYY, jadi bulan & tanggal ketuker diem-diem tanpa error -
 * ini pernah bikin sesi ke-sync dengan tanggal yang salah 2 bulan.
 * Makanya format DD/MM/YYYY & DD-MM-YYYY di-parse manual di sini,
 * bukan diserahkan ke `Date` constructor.
 */
function excelSerialToDate(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") return null;

  const trimmed = value.trim();
  if (!trimmed) return null;

  // Format "DD/MM/YYYY" atau "DD-MM-YYYY" (boleh D/M tanpa leading zero).
  const dmy = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (dmy) {
    const day = parseInt(dmy[1], 10);
    const month = parseInt(dmy[2], 10);
    const year = parseInt(dmy[3], 10);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
    return null;
  }

  // Format ISO "YYYY-MM-DD" - udah bener, lewatin apa adanya.
  const iso = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) {
    return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
  }

  // Excel serial date number (mis. sheet nyimpen tanggal sebagai angka
  // hari sejak 1899-12-30). Cuma dipakai kalau bener-bener angka murni,
  // biar nggak salah nangkep string lain.
  if (/^\d+(\.\d+)?$/.test(trimmed)) {
    const serial = parseFloat(trimmed);
    if (serial > 20000 && serial < 80000) {
      const epoch = Date.UTC(1899, 11, 30);
      const ms = epoch + serial * 86400000;
      const d = new Date(ms);
      if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
    }
    return null;
  }

  return null;
}

/** Field yang bisa di-map, buat nampilin form mapping manual di UI. */
export const MAPPABLE_FIELDS = [
  { key: "pertemuan", label: "Pertemuan ke-", wajib: true },
  // Opsional: kelas yang sheet-nya gak punya kolom ini otomatis dianggap
  // satu trainer aja (trainer utama kelas) - lihat butuhTrainerManual().
  { key: "trainer", label: "Trainer", wajib: false },
  { key: "tanggal", label: "Tanggal", wajib: false },
  { key: "materi", label: "Judul materi", wajib: false },
  { key: "record", label: "Link record", wajib: false },
] as const;

/**
 * Cek sheet sebelum disimpan. Beda dari sync beneran: kalau auto-detect
 * gagal, ini TETAP balikin headerRow-nya (dengan detected: null + pesan
 * error) - biar UI bisa nampilin dropdown "pilih kolom manual" pakai
 * nama kolom asli dari sheet itu, bukan cuma mentok di pesan error.
 */
export async function previewNavigatorSheet(
  sheetIdOrUrl: string,
  override?: Record<string, number> | null,
  tabName?: string | null
) {
  const sheetId = extractSheetId(sheetIdOrUrl);
  const rows = await fetchSheetRows(sheetId, tabName || undefined);
  if (rows.length === 0) {
    throw new Error(
      tabName
        ? `Tab "${tabName}" kosong. (Kalau nama tab-nya salah ketik, Google Sheets diem-diem nampilin tab lain, bukan error - cek headerRow di bawah buat mastiin ini tab yang bener.)`
        : "Sheet kosong atau gak kebaca."
    );
  }
  const headerRow = rows[0];

  try {
    const detected = detectColumns(headerRow, override);
    return {
      sheetId,
      headerRow,
      detected,
      needsManualMapping: false,
      // Kolom Trainer gak ketemu -> UI perlu minta admin pilih 1 trainer
      // buat kelas ini (semua sesi bakal atas nama dia).
      needsTrainerManual: butuhTrainerManual(detected),
      error: null,
    };
  } catch (e) {
    let msg = e instanceof Error ? e.message : String(e);
    // Kolom "Pertemuan" gak ketemu DAN nama tab diisi manual - kemungkinan
    // besar nama tabnya salah ketik dan Google diem-diem nampilin tab
    // lain (lihat catatan panjang di fetchSheetRows). Ditambahin di sini,
    // bukan di detectColumns(), karena cuma di sini yang tau tabName-nya.
    if (tabName) {
      msg += ` Kolom-kolom di atas juga gak kelihatan kayak jadwal sesi - cek lagi apakah nama tab "${tabName}" udah persis sama kayak di Google Sheets (Google diem-diem nampilin tab lain kalau nama tab gak ketemu, bukan error).`;
    }
    return {
      sheetId,
      headerRow,
      detected: null,
      needsManualMapping: true,
      needsTrainerManual: false,
      error: msg,
    };
  }
}

export type SyncResult = {
  kelasId: string;
  kelasNama: string;
  rowsRead: number;
  inserted: number;
  updated: number;
  skipped: number;
  errors: string[];
};

/**
 * Sync 1 kelas dari Google Sheet Navigator-nya.
 * "Tanda trainer udah ngajar" = baris di kolom Trainer keisi nama trainer.
 */
export async function syncKelasFromNavigator(kelasId: string): Promise<SyncResult> {
  const [k] = await db.select().from(kelas).where(eq(kelas.id, kelasId));
  if (!k) throw new Error(`Kelas ${kelasId} tidak ditemukan`);
  if (!k.navigatorSheetId) {
    throw new Error(`Kelas ${k.nama} belum punya navigatorSheetId`);
  }

  // Semua trainer, buat nyocokin nama di kolom Trainer sheet. Satu kelas
  // bisa diajar gantian, jadi nama yang muncul belum tentu trainer utama.
  // Dicocokin case-insensitive biar "budi" di sheet tetap ketemu "Budi".
  const semuaTrainer = await db.select().from(trainer);
  const trainerByNama = new Map(
    semuaTrainer.map((x) => [x.nama.trim().toLowerCase(), x])
  );

  const allRows = await fetchSheetRows(k.navigatorSheetId, k.navigatorTabName || undefined);
  if (allRows.length === 0) {
    throw new Error(`Sheet Navigator kelas ${k.nama} kosong`);
  }

  const headerRow = allRows[0];
  // Mapping manual (kalau kelas ini pernah di-set) menang atas auto-detect.
  let override: Record<string, number> | null = null;
  if (k.navigatorColumnMap) {
    try {
      override = JSON.parse(k.navigatorColumnMap);
    } catch {
      // JSON rusak - abaikan, balik ke auto-detect daripada gagal total.
      override = null;
    }
  }
  const cols = detectColumns(headerRow, override);
  const rows = allRows.slice(1);

  // Sheet gak punya kolom Trainer -> gak ada per-baris buat nentuin siapa
  // yang ngajar ATAU kapan sesinya beneran udah kejadian. Dua-duanya
  // dijawab dari trainer utama kelas + kolom Record (lihat komentar di
  // detectColumns() dan butuhTrainerManual()).
  const trainerManual = butuhTrainerManual(cols);

  const result: SyncResult = {
    kelasId: k.id,
    kelasNama: k.nama,
    rowsRead: rows.length,
    inserted: 0,
    updated: 0,
    skipped: 0,
    errors: [],
  };

  for (const row of rows) {
    const pertemuanRaw = row[cols.pertemuan];

    const pertemuanKe = parseInt(String(pertemuanRaw), 10);
    if (!pertemuanRaw || isNaN(pertemuanKe)) {
      // Baris kosong/pemisah section di sheet, bukan baris sesi.
      result.skipped++;
      continue;
    }

    let status: "selesai" | "belum";
    let sesiTrainerId: string | null;
    let tanpaFee = false;
    let trainerNamaSheet = "";
    let trainerSheet: (typeof semuaTrainer)[number] | undefined;

    if (trainerManual) {
      // Gak ada kolom Trainer buat dibaca. Semua sesi diajar trainer utama
      // kelas (null = "ikut kelas.trainerId", konsisten sama sesi manual).
      // "Selesai" ditentuin dari kolom Record keisi - itu bukti sesinya
      // beneran udah kejadian, bukan cuma terjadwal.
      sesiTrainerId = null;
      status = cols.record !== undefined && (row[cols.record] || "").trim() ? "selesai" : "belum";
    } else {
      trainerNamaSheet = (row[cols.trainer] || "").trim();

      if (isTrainerTanpaFee(trainerNamaSheet)) {
        // "Video Course" dkk - materi rekaman, bukan sesi live. Selesai
        // (materinya emang udah tersedia), tapi gak ada trainer & gak
        // dihitung fee siapapun.
        status = "selesai";
        sesiTrainerId = null;
        tanpaFee = true;
      } else {
        // Status "selesai" = kolom Trainer di baris ini keisi nama trainer yang
        // KEDAFTAR (siapapun, gak harus trainer utama kelas). Ini penanda
        // "trainer ini udah ngajar pertemuan ini", BUKAN dari tanggal terisi -
        // tanggal cuma info jadwal, bisa keisi buat sesi yang belum kejadian.
        trainerSheet = trainerNamaSheet
          ? trainerByNama.get(trainerNamaSheet.toLowerCase())
          : undefined;
        status = trainerSheet ? "selesai" : "belum";

        // Sesi disimpan atas nama trainer yang ada di sheet. Kalau kosong,
        // dibiarin null -> nanti kebaca sebagai trainer utama kelas.
        sesiTrainerId = trainerSheet?.id ?? null;
      }
    }

    // Nama keisi tapi gak kedaftar = kemungkinan salah ketik, atau trainer
    // baru yang belum diinput. Sesi-nya tetap dibikin (status "belum"),
    // tapi dilaporin biar admin bisa nindaklanjutin.
    if (!trainerManual && !tanpaFee && trainerNamaSheet && !trainerSheet) {
      result.errors.push(
        `Pertemuan ${pertemuanRaw}: nama trainer di sheet ("${trainerNamaSheet}") belum terdaftar. Tambahin dulu di halaman Trainer, atau betulin ejaannya.`
      );
    }

    const tanggal = cols.tanggal !== undefined ? excelSerialToDate(row[cols.tanggal]) : null;
    const materi = cols.materi !== undefined ? row[cols.materi] || null : null;
    const record = cols.record !== undefined ? row[cols.record] || null : null;

    const existing = await db
      .select()
      .from(sesi)
      .where(and(eq(sesi.kelasId, k.id), eq(sesi.pertemuanKe, pertemuanKe)));

    if (existing.length > 0) {
      await db
        .update(sesi)
        .set({
          tanggal,
          materi,
          linkRecord: record,
          status,
          trainerId: sesiTrainerId,
          tanpaFee,
          source: "navigator_sync",
        })
        .where(eq(sesi.id, existing[0].id));
      result.updated++;
    } else {
      await db.insert(sesi).values({
        kelasId: k.id,
        pertemuanKe,
        tanggal,
        materi,
        linkRecord: record,
        status,
        trainerId: sesiTrainerId,
        tanpaFee,
        source: "navigator_sync",
      });
      result.inserted++;
    }
  }

  await db
    .update(kelas)
    .set({ navigatorLastSyncedAt: new Date().toISOString() })
    .where(eq(kelas.id, k.id));

  return result;
}

export async function syncAllKelas(): Promise<SyncResult[]> {
  const allKelas = await db.select().from(kelas);
  const withSheet = allKelas.filter((k) => !!k.navigatorSheetId);

  const results: SyncResult[] = [];
  for (const k of withSheet) {
    try {
      results.push(await syncKelasFromNavigator(k.id));
    } catch (e) {
      results.push({
        kelasId: k.id,
        kelasNama: k.nama,
        rowsRead: 0,
        inserted: 0,
        updated: 0,
        skipped: 0,
        errors: [e instanceof Error ? e.message : String(e)],
      });
    }
  }
  return results;
}
