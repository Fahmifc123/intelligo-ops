# Intelligo Ops

Sistem operasional keuangan & fee trainer, gantiin spreadsheet Excel yang
tadinya narik data pakai IMPORTRANGE antar puluhan file.

## Stack
- Next.js 16 (App Router) - frontend + backend (API routes) jadi satu
- Drizzle ORM + SQLite (better-sqlite3) - lokal dev
- Tailwind CSS

## Struktur data
5 tabel inti: `trainer`, `kelas`, `sesi`, `fee_rule`, `payment`.
Lihat `src/db/schema.ts` buat detail kolomnya.

Alur: trainer punya banyak kelas -> tiap kelas punya banyak sesi -> tiap
kelas punya fee_rule (rate per sesi) -> fee dihitung otomatis dari jumlah
sesi berstatus "selesai" x rate.

## Jalanin lokal

```bash
npm install
npx drizzle-kit migrate   # bikin data.db + semua tabel
npm run dev                # buka http://localhost:3000
```

Urutan pemakaian pertama kali: tambah Trainer -> tambah Kelas (assign ke
trainer + set rate per sesi) -> input Sesi -> tandai sesi selesai -> cek
Rekap Fee.

## Sync otomatis dari Google Sheet Navigator (penting)

Trainer TETAP isi rekap sesi di Google Sheet Navigator masing-masing seperti
biasa - ini gak berubah. Yang berubah cuma: dulu Operasional.xlsx narik data
itu pakai IMPORTRANGE, sekarang aplikasi ini yang narik datanya secara
otomatis ke database - langsung dari link CSV export publik Google Sheets,
**gak butuh service account atau kredensial apapun**.

"Tanda" trainer udah ngajar = baris di kolom Trainer keisi nama dia. Itu
yang di-baca sync job dan di-cocokin ke database. Kolom lain (Pertemuan,
Trainer wajib ada; Date/Tanggal, Judul Materi, Record opsional) dideteksi
otomatis dari nama header, jadi urutan kolom boleh beda-beda antar sheet.

### Setup per kelas (gampang, gak perlu setup project Google Cloud)

1. Buka Google Sheet Navigator kelas tersebut
2. Klik **Share** > ganti akses jadi **"Anyone with the link"** > role **Viewer**
   (bukan Editor - biar gak sengaja ke-edit dari luar)
3. Copy link sheet-nya
4. Di halaman `/kelas` pas bikin/edit kelas, paste link itu ke field "Link
   Google Sheet Kelas", klik "Cek link" buat validasi (bakal nunjukin kolom
   apa aja yang kedetect), baru submit

Catatan: karena sheet-nya jadi "anyone with the link can view", siapapun
yang punya link itu bisa lihat isinya (read-only). Kalau ada data sensitif
di situ (misal ada kolom fee/gaji), pisahin ke sheet lain yang tetap
private, dan Navigator cuma isi data sesi aja.

### Jalanin sync

- **Manual:** klik tombol "Sync sekarang" di halaman `/kelas` per kelas
- **Semua kelas sekaligus:** `POST /api/sync/navigator`
- **Otomatis terjadwal (rekomendasi):** pakai GitHub Actions cron (gratis)
  yang hit endpoint ini tiap 15-30 menit. Contoh workflow:

```yaml
# .github/workflows/sync-navigator.yml
name: Sync Navigator
on:
  schedule:
    - cron: "*/30 * * * *"  # tiap 30 menit
  workflow_dispatch: {}       # bisa juga trigger manual dari tab Actions
jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - run: |
          curl -X POST https://domainmu.vercel.app/api/sync/navigator \
            -H "Authorization: Bearer ${{ secrets.SYNC_SECRET }}"
```

Set `SYNC_SECRET` juga di environment variable Vercel (biar endpoint sync
gak bisa dipanggil sembarang orang), dan simpen value yang sama di GitHub
repo Settings > Secrets > `SYNC_SECRET`.

### Kalau nama tab sheet-nya bukan "Sheet1"

Default-nya baca tab bernama "Sheet1". Kalau Navigator kamu pakai nama tab
lain, ubah `DEFAULT_TAB_NAME` di `src/lib/navigatorSync.ts`.

### Kalau format kolom Navigator kamu beda-beda antar sheet

Edit `HEADER_ALIASES` di `src/lib/navigatorSync.ts` - tambahin variasi nama
header yang mungkin dipakai (misal kalau ada yang nulis "Tanggal Sesi"
bukan "Date"). Kalau strukturnya beda banget, kasih tau biar dibikin lebih
fleksibel lagi.

## Migrasi data lama dari Excel

File Navigator lama (satu file per trainer/kelas) bisa di-import otomatis:

```bash
mkdir -p scripts/navigator_files
# copy semua file Private_Navigator_*.xlsx ke folder itu
pip install openpyxl --break-system-packages
python3 scripts/migrate_from_excel.py
```

Script ini baca kolom Pertemuan/Date/Judul Materi/Record/Trainer dari tiap
file, otomatis bikin trainer & kelas kalau belum ada, terus insert semua
sesi historisnya. Sesuaikan index kolom di `migrate_from_excel.py` kalau
format Navigator kamu beda-beda antar file.

## Deploy (gratis)

### 1. Pindah database ke Turso

SQLite file biasa gak bisa dipakai di Vercel (filesystem serverless-nya gak
persist). Turso itu SQLite-compatible tapi jalan sebagai service, jadi
kompatibel sama Vercel.

```bash
# install Turso CLI, lihat https://docs.turso.tech/quickstart
turso auth signup
turso db create intelligo-ops
turso db show intelligo-ops --url          # ini jadi TURSO_DATABASE_URL
turso db tokens create intelligo-ops        # ini jadi TURSO_AUTH_TOKEN
```

Push schema ke Turso (jalanin migration SQL yang ada di folder `drizzle/`):

```bash
turso db shell intelligo-ops < drizzle/0000_same_killer_shrike.sql
```

Kalau mau bawa data lokal yang udah ke-migrate dari Excel juga, bisa dump
`data.db` terus import ke Turso - lihat dokumentasi Turso soal `turso db
shell .dump` / import.

### 2. Update koneksi database buat production

Ganti `src/db/index.ts` supaya pakai `drizzle-orm/libsql` waktu
`TURSO_DATABASE_URL` ada (kalau gak ada, fallback ke SQLite lokal biar dev
tetep gampang):

```ts
import { drizzle as drizzleLibsql } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
import { drizzle as drizzleSqlite } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import * as schema from "./schema";

export const db = process.env.TURSO_DATABASE_URL
  ? drizzleLibsql(
      createClient({
        url: process.env.TURSO_DATABASE_URL,
        authToken: process.env.TURSO_AUTH_TOKEN,
      }),
      { schema }
    )
  : drizzleSqlite(new Database(process.env.DATABASE_PATH || "data.db"), { schema });
```

Install driver-nya: `npm install @libsql/client`

### 3. Deploy ke Vercel

```bash
git init && git add . && git commit -m "init"
# push ke repo GitHub baru
```

Di vercel.com: Import repo -> set environment variables
(`TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`) di dashboard project settings ->
deploy. Push ke branch main = auto-redeploy.

## Roadmap lanjutan
- Auth per role (trainer cuma bisa input sesi kelasnya sendiri)
- Modul cashflow & pengeluaran non-fee
- Export laporan PDF/Excel
- Payment tracking (tandai fee udah dibayar)
