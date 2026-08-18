import { drizzle as drizzleLibsql } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
import { drizzle as drizzleSqlite } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import * as schema from "./schema";

/**
 * Koneksi database dipilih otomatis dari env:
 *
 * - Kalau TURSO_DATABASE_URL ada  -> pakai Turso (libSQL). Ini yang dipakai
 *   di Vercel, DAN di lokal kalau .env.local diisi - dua-duanya nunjuk DB
 *   yang sama, jadi data langsung sinkron.
 * - Kalau gak ada                 -> fallback ke file SQLite lokal (data.db),
 *   biar tetap bisa jalan offline tanpa setup apa-apa.
 *
 * PENTING: file SQLite (better-sqlite3) GAK BISA dipakai di Vercel -
 * filesystem serverless-nya read-only dan ephemeral, jadi semua operasi
 * tulis bakal gagal. Di production wajib pakai Turso.
 */

// Dua driver (libsql & better-sqlite3) punya tipe yang beda walau API
// query-nya sama persis. Tanpa ini, union type-nya bikin TypeScript
// kehilangan tipe query builder di semua route.
type Db = ReturnType<typeof drizzleSqlite<typeof schema>>;

function createDb(): Db {
  const url = process.env.TURSO_DATABASE_URL;

  if (url) {
    return drizzleLibsql(
      createClient({
        url,
        authToken: process.env.TURSO_AUTH_TOKEN,
      }),
      { schema }
    ) as unknown as Db;
  }

  // Guard: kalau jalan di serverless tanpa Turso, gagal dengan pesan jelas -
  // lebih baik daripada error "readonly database" yang bikin bingung.
  if (process.env.VERCEL) {
    throw new Error(
      "TURSO_DATABASE_URL belum di-set. SQLite file gak bisa dipakai di Vercel " +
        "(filesystem-nya read-only). Set TURSO_DATABASE_URL & TURSO_AUTH_TOKEN " +
        "di Environment Variables project Vercel."
    );
  }

  const sqlite = new Database(process.env.DATABASE_PATH || "data.db");
  sqlite.pragma("journal_mode = WAL");
  return drizzleSqlite(sqlite, { schema });
}

/**
 * Koneksi dibikin LAZY (baru pas query pertama), bukan pas modul di-import.
 *
 * Alasannya: `next build` nge-import tiap route buat collect config-nya.
 * Kalau koneksi dibikin di top-level, error "TURSO_DATABASE_URL belum di-set"
 * kelempar pas BUILD - padahal build sama sekali gak butuh akses DB.
 * Dengan lazy, build selalu lolos dan errornya baru muncul pas ada request
 * beneran yang butuh DB (di situ pesannya emang relevan).
 *
 * Proxy dipakai biar semua `import { db }` yang udah ada gak perlu diubah.
 */
let dbInstance: Db | null = null;

function getDb(): Db {
  if (!dbInstance) dbInstance = createDb();
  return dbInstance;
}

export const db = new Proxy({} as Db, {
  get(_target, prop) {
    const real = getDb();
    const value = Reflect.get(real, prop) as unknown;
    // Method di-bind ke instance aslinya - kalau nggak, `this` di dalam
    // drizzle nunjuk ke Proxy dan internal state-nya jadi gak kebaca.
    return typeof value === "function" ? value.bind(real) : value;
  },
});
