import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const trainer = sqliteTable("trainer", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  nama: text("nama").notNull(),
  email: text("email"),
  // Legacy: field gabungan lama, gak dipakai di form manapun (dicek kosong
  // di semua data produksi). Dipertahankan biar kolom lama gak ilang tanpa
  // migrasi data, tapi UI baca/tulis lewat 3 kolom di bawah.
  bankAccount: text("bank_account"),
  // Buat export payslip ke format n8n (lihat /api/payslip/[id]/export-n8n).
  // Diisi manual, atau di-sync dari Google Form pendaftaran trainer -
  // lihat syncTrainerBankInfo() di src/lib/trainerSync.ts.
  bankName: text("bank_name"),
  bankAccountNumber: text("bank_account_number"),
  bankAccountName: text("bank_account_name"),
  createdAt: text("created_at").default(sql`(current_timestamp)`),
});

// Karyawan non-trainer (marketing, admin, dst) - orang yang gak ngajar
// kelas, jadi gak punya sesi/feeRule. Fee-nya diisi manual tiap kali bikin
// payslip (lihat payslip.tipe === "karyawan"), bukan dihitung dari sesi.
export const karyawan = sqliteTable("karyawan", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  nama: text("nama").notNull(),
  posisi: text("posisi").notNull(), // mis. "Marketing", "Admin", "Finance"
  bankName: text("bank_name"),
  bankAccountNumber: text("bank_account_number"),
  bankAccountName: text("bank_account_name"),
  createdAt: text("created_at").default(sql`(current_timestamp)`),
});

export const kelas = sqliteTable("kelas", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  nama: text("nama").notNull(),
  tipe: text("tipe").notNull(), // bootcamp | private | mbc | corporate
  // Trainer utama / penanggung jawab kelas. Satu kelas boleh diajar lebih
  // dari satu trainer - itu diatur per sesi lewat sesi.trainerId. Kolom ini
  // jadi default buat sesi yang trainer-nya gak diisi.
  trainerId: text("trainer_id").notNull().references(() => trainer.id),
  tanggalMulai: text("tanggal_mulai"),
  // Pola pembayaran fee trainer kelas ini - murni informasi/catatan, gak
  // dipakai buat ngitung apa-apa (perhitungan fee tetap dari feeRule +
  // status payslip seperti biasa). "akhir" = dibayar sekali pas kelas
  // kelar, "bulanan" = diakumulasi & dibayar tiap bulan berjalan.
  polaPembayaran: text("pola_pembayaran").notNull().default("akhir"), // akhir | bulanan
  // ID Google Sheet Navigator kelas ini (dari URL sheet: /d/{INI_ID}/edit).
  // Kalau diisi, sesi kelas ini di-sync otomatis dari sheet, bukan input manual.
  navigatorSheetId: text("navigator_sheet_id"),
  // Nama tab (bukan gid) yang dibaca sync, mis. "Jadwal, silabus & Rekaman".
  // Null = coba "Sheet1" dulu (DEFAULT_TAB_NAME di navigatorSync.ts) -
  // banyak sheet lama emang cuma punya satu tab dengan nama default itu.
  // Wajib diisi manual buat sheet yang tab datanya dinamain lain/ada
  // beberapa tab (Master, Jadwal, Mentoring, dst) - gid di URL sheet gak
  // bisa dipetakan ke nama tab tanpa API tambahan, jadi ini input manual.
  navigatorTabName: text("navigator_tab_name"),
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
  // Siapa yang ngajar sesi INI. null = pakai trainer utama kelasnya.
  // Diisi otomatis sama sync Navigator dari kolom "Trainer" di sheet, atau
  // manual lewat form sesi kalau kelasnya diajar gantian.
  trainerId: text("trainer_id").references(() => trainer.id),
  pertemuanKe: integer("pertemuan_ke").notNull(),
  tanggal: text("tanggal"),
  materi: text("materi"),
  status: text("status").notNull().default("belum"), // belum | selesai | batal
  // Sesi ini SENGAJA gak punya trainer & gak dihitung fee siapapun - beda
  // dari trainerId null (yang berarti "ikut trainer utama kelas"). Dipicu
  // sync Navigator pas kolom Trainer isinya "Video Course" (materi
  // rekaman, bukan sesi live). Sesi tetap ditandai selesai (materinya udah
  // tersedia), tapi dikeluarkan total dari perhitungan fee - termasuk gak
  // ikut jadi pembagi skema paket, biar trainer yang beneran ngajar live
  // gak dirugikan. Lihat trainerEfektif() & petaRateSesi().
  tanpaFee: integer("tanpa_fee", { mode: "boolean" }).notNull().default(false),
  linkRecord: text("link_record"),
  source: text("source").notNull().default("manual"), // manual | navigator_sync
  createdAt: text("created_at").default(sql`(current_timestamp)`),
});

// Aturan fee untuk SATU trainer di SATU kelas.
//
// Kenapa per (kelas, trainer) dan bukan per kelas? Karena satu kelas bisa
// diajar beberapa trainer dengan kesepakatan beda-beda - mis. di kelas yang
// sama Budi dapat paket 5jt dan Andi dapat paket 4jt. Tiap baris di sini
// mewakili satu kesepakatan.
//
// `trainerId` null = aturan lama sebelum fitur multi-trainer, berlaku buat
// semua trainer di kelas itu. Dipertahankan biar data lama tetap kebaca.
//
// Dua cara ngitung, dibedain lewat kolom `skema`:
//
//   flat  - dibayar per sesi. `ratePerSesi` yang dipakai, `totalPaket` null.
//           Sesi nambah = fee ikut nambah.
//
//   paket - borongan. Jatah trainer ini udah disepakati di `totalPaket`
//           (mis. 5jt) dan gak berubah walau jumlah sesinya meleset dari
//           `targetSesi`. Rate tiap sesi dihitung on-the-fly = totalPaket
//           dibagi jumlah sesi YANG DIA AJAR. Lihat src/lib/fee.ts - sisa
//           pembagian diserap di sesi terakhir biar jumlahnya persis.
//
// `ratePerSesi` tetap notNull buat skema paket (diisi hasil bagi rata) supaya
// query lama yang cuma baca kolom itu gak pecah, tapi angka yang dipakai
// buat duit beneran selalu lewat rateSesi() di src/lib/fee.ts.
export const feeRule = sqliteTable("fee_rule", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  kelasId: text("kelas_id").notNull().references(() => kelas.id),
  trainerId: text("trainer_id").references(() => trainer.id),
  ratePerSesi: real("rate_per_sesi").notNull(),
  skema: text("skema").notNull().default("flat"), // flat | paket
  totalPaket: real("total_paket"),
  targetSesi: integer("target_sesi"),
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

// Payslip: tagihan fee 1 periode (bulan) buat 1 orang - trainer ATAU
// karyawan non-trainer, dibedain lewat `tipe`.
//
//   tipe "trainer"  - trainerId notNull, karyawanId null. Isinya rekapan
//                     sesi selesai (lihat payslipItem), totalFee dihitung
//                     dari situ. nominal null, gak dipakai.
//   tipe "karyawan" - karyawanId notNull, trainerId null. Karyawan
//                     non-trainer (marketing, admin, dst) gak punya sesi
//                     buat direkap, jadi fee-nya diisi manual ke `nominal`
//                     tiap kali bikin payslip - gak ada payslipItem sama
//                     sekali buat tipe ini.
export const payslip = sqliteTable("payslip", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tipe: text("tipe").notNull().default("trainer"), // trainer | karyawan
  trainerId: text("trainer_id").references(() => trainer.id),
  karyawanId: text("karyawan_id").references(() => karyawan.id),
  // Nominal fee manual - cuma dipakai buat tipe "karyawan" (fee trainer
  // tetap dihitung dari payslipItem, biar snapshot rate per sesi gak ilang).
  nominal: real("nominal"),
  periode: text("periode").notNull(), // "YYYY-MM" - periode payroll, BUKAN tanggal sesi
  // Alur linear: draft (masih bisa ubah sesi) -> belum_dibayar (udah
  // dikunci, siap dibayar) -> lunas (duit udah keluar).
  status: text("status").notNull().default("draft"), // draft | belum_dibayar | lunas
  catatan: text("catatan"),
  createdAt: text("created_at").default(sql`(current_timestamp)`),
  finalizedAt: text("finalized_at"),
  paidAt: text("paid_at"),
  // Tanggal estimasi transfer, "YYYY-MM-DD" - diisi manual admin, dipakai
  // sebagai kolom "jadwal_pembayaran" pas export ke format n8n. Null
  // sampai admin isi (lihat /api/payslip/[id]/export-n8n).
  jadwalPembayaran: text("jadwal_pembayaran"),
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
