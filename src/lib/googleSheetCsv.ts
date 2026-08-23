/**
 * Baca Google Sheet publik langsung dari URL export CSV - GAK BUTUH
 * service account / kredensial apapun. Syaratnya cuma satu: sheet-nya
 * harus di-share "Anyone with the link can view" (bukan private).
 *
 * Dipakai bareng oleh src/lib/navigatorSync.ts (sesi kelas) dan
 * src/lib/trainerSync.ts (data rekening trainer) - dua-duanya baca CSV
 * publik, cuma beda kolom yang dicari.
 */
import { parse } from "csv-parse/sync";

export function extractSheetId(input: string): string {
  const trimmed = input.trim();
  const match = trimmed.match(/\/d\/([a-zA-Z0-9-_]+)/);
  if (match) return match[1];
  return trimmed; // udah berupa ID mentah
}

function csvExportUrl(sheetId: string, tabName?: string) {
  const base = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv`;
  return tabName ? `${base}&sheet=${encodeURIComponent(tabName)}` : base;
}

/**
 * PENTING: endpoint gviz Google Sheets gak pernah balikin error status
 * buat nama tab yang gak ketemu - dia diem-diem jatuh ke tab PALING KIRI
 * di sheet itu, tetep status 200. Gak ada cara verifikasi nama tab itu
 * bener tanpa kredensial Google. Kalau `tabName` gak diisi, otomatis baca
 * tab pertama - itu perilaku yang diinginkan buat sheet Google Form
 * (yang cuma punya 1 tab "Form Responses 1").
 */
export async function fetchSheetRows(sheetId: string, tabName?: string): Promise<string[][]> {
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

  return parse(text, {
    relax_quotes: true,
    skip_empty_lines: false,
    relax_column_count: true,
  }) as string[][];
}
