import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import * as schema from "./schema";

// LOCAL DEV: file SQLite biasa di root project (data.db)
// PRODUCTION: ganti ke drizzle-orm/libsql + @libsql/client waktu pindah ke Turso
// (lihat README.md bagian "Deploy ke Turso" buat caranya)
const sqlite = new Database(process.env.DATABASE_PATH || "data.db");
sqlite.pragma("journal_mode = WAL");

export const db = drizzle(sqlite, { schema });
