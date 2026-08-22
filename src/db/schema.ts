import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const trainer = sqliteTable("trainer", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  nama: text("nama").notNull(),
  email: text("email"),
  bankAccount: text("bank_account"),
  createdAt: text("created_at").default(sql`(current_timestamp)`),
});

export const kelas = sqliteTable("kelas", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  nama: text("nama").notNull(),
  tipe: text("tipe").notNull(), // bootcamp | private | mbc | corporate
  trainerId: text("trainer_id").notNull().references(() => trainer.id),
  tanggalMulai: text("tanggal_mulai"),
  // ID Google Sheet Navigator kelas ini (dari URL sheet: /d/{INI_ID}/edit).
  // Kalau diisi, sesi kelas ini di-sync otomatis dari sheet, bukan input manual.
  navigatorSheetId: text("navigator_sheet_id"),
  navigatorLastSyncedAt: text("navigator_last_synced_at"),
  // Mapping kolom manual, JSON { "pertemuan": 1, "trainer": 11, ... } -
  // nilainya index kolom di header row sheet. Cuma diisi kalau nama kolom
  // di sheet gak ketebak auto-detect; kalau null, deteksi otomatis dipakai.
  navigatorColumnMap: text("navigator_column_map"),
  createdAt: text("created_at").default(sql`(current_timestamp)`),
});

export const sesi = sqliteTable("sesi", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  kelasId: text("kelas_id").notNull().references(() => kelas.id),
  pertemuanKe: integer("pertemuan_ke").notNull(),
  tanggal: text("tanggal"),
  materi: text("materi"),
  status: text("status").notNull().default("belum"), // belum | selesai | batal
  linkRecord: text("link_record"),
  source: text("source").notNull().default("manual"), // manual | navigator_sync
  createdAt: text("created_at").default(sql`(current_timestamp)`),
});

export const feeRule = sqliteTable("fee_rule", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  kelasId: text("kelas_id").notNull().references(() => kelas.id),
  ratePerSesi: real("rate_per_sesi").notNull(),
  skema: text("skema").notNull().default("flat"), // flat | tier
  createdAt: text("created_at").default(sql`(current_timestamp)`),
});

export const payment = sqliteTable("payment", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  trainerId: text("trainer_id").notNull().references(() => trainer.id),
  periode: text("periode").notNull(), // e.g. "2026-08"
  jumlahSesi: integer("jumlah_sesi").notNull().default(0),
  totalFee: real("total_fee").notNull().default(0),
  status: text("status").notNull().default("pending"), // pending | paid
  tanggalEstimasi: text("tanggal_estimasi"),
  createdAt: text("created_at").default(sql`(current_timestamp)`),
});

// Payslip: kumpulan sesi selesai yang direkap jadi tagihan fee 1 trainer
// buat 1 periode (bulan). Header di sini, item-nya (sesi mana aja yang
// masuk) ada di payslipItem.
export const payslip = sqliteTable("payslip", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  trainerId: text("trainer_id").notNull().references(() => trainer.id),
  periode: text("periode").notNull(), // "YYYY-MM" - periode payroll, BUKAN tanggal sesi
  // Alur linear: draft (masih bisa ubah sesi) -> belum_dibayar (udah
  // dikunci, siap dibayar) -> lunas (duit udah keluar).
  status: text("status").notNull().default("draft"), // draft | belum_dibayar | lunas
  catatan: text("catatan"),
  createdAt: text("created_at").default(sql`(current_timestamp)`),
  finalizedAt: text("finalized_at"),
  paidAt: text("paid_at"),
});

// Baris penghubung payslip <-> sesi. `ratePerSesi` di-snapshot di sini
// (bukan join ke feeRule tiap kali baca) biar kalau rate kelas diubah
// belakangan, payslip yang udah dibuat nggak ikut berubah angkanya -
// payslip itu catatan tagihan pada saat dibuat, bukan hasil query live.
// Satu sesi cuma boleh nempel ke satu payslip aktif (unique index di migrasi).
export const payslipItem = sqliteTable("payslip_item", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  payslipId: text("payslip_id").notNull().references(() => payslip.id),
  sesiId: text("sesi_id").notNull().references(() => sesi.id),
  ratePerSesi: real("rate_per_sesi").notNull(),
  createdAt: text("created_at").default(sql`(current_timestamp)`),
});
