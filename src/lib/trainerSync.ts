/**
 * Sync data rekening bank trainer dari Google Form pendaftaran trainer.
 * Beda dari navigatorSync.ts (yang sync SESI dari sheet Navigator per
 * kelas) - ini sync data REKENING trainer dari satu sheet form global,
 * dipakai buat ngisi kolom bank_name/bank_account_number/bank_account_name
 * yang dibutuhin export payslip ke format n8n.
 *
 * Dicocokin by EMAIL (bukan nama) - trainer.email di sistem harus persis
 * sama sama kolom "Email Aktif" di form (case-insensitive, di-trim).
 * Trainer yang email-nya belum diisi di sistem gak akan pernah ke-match -
 * itu konsekuensi yang disengaja dari matching by email.
 */
import { db } from "@/db";
import { trainer } from "@/db/schema";
import { eq } from "drizzle-orm";
import { extractSheetId, fetchSheetRows } from "./googleSheetCsv";

// Alias header, sama pola kayak HEADER_ALIASES di navigatorSync.ts - biar
// toleran ke variasi kecil nama kolom form (spasi trailing dari Google
// Forms, dst). Dicocokin exact dulu, baru fallback ke prefix/contains.
const HEADER_ALIASES: Record<string, string[]> = {
  email: ["email aktif", "email"],
  namaBank: ["nama bank"],
  nomorRekening: ["nomor rekening"],
  namaPemilikRekening: ["nama pemilik rekening"],
};

function detectColumns(headerRow: string[]): Record<string, number> {
  const normalized = headerRow.map((h) => (h || "").toString().trim().toLowerCase());
  const map: Record<string, number> = {};
  const used = new Set<number>();

  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
    let idx = normalized.findIndex((h, i) => !used.has(i) && aliases.includes(h));
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

  const kurang = ["email", "namaBank", "nomorRekening", "namaPemilikRekening"].filter(
    (f) => map[f] === undefined
  );
  if (kurang.length > 0) {
    throw new Error(
      `Kolom ${kurang.join(", ")} gak ketemu di sheet ini. Kolom yang ada: ${headerRow
        .filter(Boolean)
        .join(", ")}.`
    );
  }

  return map;
}

export type TrainerSyncResult = {
  rowsRead: number;
  updated: number;
  skipped: number;
  unmatchedEmails: string[];
};

/**
 * Sync data rekening dari sheet Google Form ke tabel trainer, cocokin by
 * email. Baris yang emailnya gak ketemu di trainer manapun dilaporin di
 * unmatchedEmails - gak dibikinin trainer baru (trainer dibikin manual
 * lewat halaman Trainer, sync ini cuma ngisi info rekening).
 */
export async function syncTrainerBankInfo(sheetIdOrUrl: string): Promise<TrainerSyncResult> {
  const sheetId = extractSheetId(sheetIdOrUrl);
  const allRows = await fetchSheetRows(sheetId);
  if (allRows.length === 0) {
    throw new Error("Sheet kosong atau gak kebaca.");
  }

  const cols = detectColumns(allRows[0]);
  const rows = allRows.slice(1);

  const semuaTrainer = await db.select().from(trainer);
  const trainerByEmail = new Map(
    semuaTrainer
      .filter((t) => t.email)
      .map((t) => [(t.email as string).trim().toLowerCase(), t])
  );

  const result: TrainerSyncResult = {
    rowsRead: 0,
    updated: 0,
    skipped: 0,
    unmatchedEmails: [],
  };

  for (const row of rows) {
    const email = (row[cols.email] || "").trim();
    if (!email) {
      result.skipped++;
      continue;
    }
    result.rowsRead++;

    const match = trainerByEmail.get(email.toLowerCase());
    if (!match) {
      result.unmatchedEmails.push(email);
      continue;
    }

    const namaBank = (row[cols.namaBank] || "").trim() || null;
    const nomorRekening = (row[cols.nomorRekening] || "").trim() || null;
    const namaPemilikRekening = (row[cols.namaPemilikRekening] || "").trim() || null;

    await db
      .update(trainer)
      .set({
        bankName: namaBank,
        bankAccountNumber: nomorRekening,
        bankAccountName: namaPemilikRekening,
      })
      .where(eq(trainer.id, match.id));
    result.updated++;
  }

  return result;
}
