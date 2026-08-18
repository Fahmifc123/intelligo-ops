import { parse } from "csv-parse/sync";
import { db } from "@/db";
import { sesi, trainer, kelas } from "@/db/schema";
import { and, eq } from "drizzle-orm";

/**
 * Baca sheet Navigator langsung dari URL export CSV publik Google Sheets -
 * GAK BUTUH service account / kredensial apapun. Syaratnya cuma satu:
 * sheet-nya harus di-share "Anyone with the link can view" (bukan private).
 *
 * Kolom di sheet di-deteksi otomatis dari header row, bukan index tetap -
 * jadi urutan kolom boleh beda-beda antar sheet. WAJIB ada kolom
 * "Pertemuan" dan "Trainer" (case-insensitive).
 */
const HEADER_ALIASES: Record<string, string[]> = {
  pertemuan: ["pertemuan"],
  trainer: ["trainer"],
  tanggal: ["date", "tanggal"],
  materi: ["judul materi", "materi", "topik"],
  record: ["record", "link record"],
};

const DEFAULT_TAB_NAME = "Sheet1";

export function extractSheetId(input: string): string {
  const trimmed = input.trim();
  const match = trimmed.match(/\/d\/([a-zA-Z0-9-_]+)/);
  if (match) return match[1];
  return trimmed; // udah berupa ID mentah
}

function csvExportUrl(sheetId: string, tabName: string) {
  return `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(
    tabName
  )}`;
}

async function fetchSheetRows(sheetId: string, tabName = DEFAULT_TAB_NAME): Promise<string[][]> {
  const url = csvExportUrl(sheetId, tabName);
  const res = await fetch(url);

  if (!res.ok) {
    throw new Error(
      `Gagal ambil sheet (status ${res.status}). Pastikan link sheet-nya bener dan sheet udah di-share "Anyone with the link can view".`
    );
  }

  const text = await res.text();

  // Kalau sheet private/gak ke-share publik, Google balikin halaman HTML
  // login, bukan CSV - deteksi dan kasih pesan jelas.
  if (text.trim().startsWith("<")) {
    throw new Error(
      `Sheet belum bisa diakses publik. Buka sheet-nya > Share > ganti jadi "Anyone with the link" > Viewer, baru coba lagi.`
    );
  }

  const rows = parse(text, {
    relax_quotes: true,
    skip_empty_lines: false,
    relax_column_count: true,
  }) as string[][];

  return rows;
}

function detectColumns(headerRow: string[]): Record<string, number> {
  const normalized = headerRow.map((h) => (h || "").toString().trim().toLowerCase());
  const map: Record<string, number> = {};

  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
    const idx = normalized.findIndex((h) => aliases.includes(h));
    if (idx !== -1) map[field] = idx;
  }

  if (map.pertemuan === undefined || map.trainer === undefined) {
    throw new Error(
      `Sheet ini gak punya kolom "Pertemuan" dan/atau "Trainer" di header row. Ditemukan: ${headerRow.join(", ")}`
    );
  }

  return map;
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

export async function previewNavigatorSheet(sheetIdOrUrl: string) {
  const sheetId = extractSheetId(sheetIdOrUrl);
  const rows = await fetchSheetRows(sheetId);
  if (rows.length === 0) {
    throw new Error("Sheet kosong atau gak kebaca.");
  }
  const headerRow = rows[0];
  const detected = detectColumns(headerRow); // throws kalau Pertemuan/Trainer gak ada
  return { sheetId, headerRow, detected };
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

  const [t] = await db.select().from(trainer).where(eq(trainer.id, k.trainerId));

  const allRows = await fetchSheetRows(k.navigatorSheetId);
  if (allRows.length === 0) {
    throw new Error(`Sheet Navigator kelas ${k.nama} kosong`);
  }

  const headerRow = allRows[0];
  const cols = detectColumns(headerRow);
  const rows = allRows.slice(1);

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
    const trainerNamaSheet = (row[cols.trainer] || "").trim();

    const pertemuanKe = parseInt(String(pertemuanRaw), 10);
    if (!pertemuanRaw || isNaN(pertemuanKe)) {
      // Baris kosong/pemisah section di sheet, bukan baris sesi.
      result.skipped++;
      continue;
    }

    // Status "selesai" = kolom Trainer di baris ini keisi & namanya cocok
    // sama trainer terdaftar buat kelas ini. Ini penanda "trainer ini udah
    // ngajar pertemuan ini", BUKAN dari tanggal terisi - tanggal cuma info
    // jadwal/riwayat, bisa keisi buat sesi yang belum kejadian juga.
    const trainerCocok = !!trainerNamaSheet && (!t || trainerNamaSheet === t.nama.trim());
    const status = trainerCocok ? "selesai" : "belum";

    if (trainerNamaSheet && t && trainerNamaSheet !== t.nama.trim()) {
      result.errors.push(
        `Pertemuan ${pertemuanRaw}: nama trainer di sheet ("${trainerNamaSheet}") beda dari trainer terdaftar ("${t.nama}")`
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
