/**
 * Jalanin semua migrasi di folder drizzle/ ke database yang aktif.
 *
 *   npm run db:migrate
 *
 * Baca koneksi dari .env.local (kalau ada) -> Turso. Kalau gak ada, kena
 * guard dan berhenti dengan pesan jelas, bukan diam-diam nulis ke data.db.
 *
 * Statement yang gagal karena "udah ada" dianggap sukses, jadi script ini
 * aman dijalanin berulang kali.
 */
import { createClient } from "@libsql/client";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const drizzleDir = path.join(root, "drizzle");

// Node gak auto-load .env.local, jadi dibaca manual.
const envPath = path.join(root, ".env.local");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

const url = process.env.TURSO_DATABASE_URL;
if (!url) {
  console.error(
    "TURSO_DATABASE_URL gak ketemu.\n" +
      "Isi di .env.local (lihat .env.example) sebelum jalanin migrasi."
  );
  process.exit(1);
}

const client = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN });

const files = readdirSync(drizzleDir).filter((f) => f.endsWith(".sql")).sort();
console.log(`Menjalankan ${files.length} migrasi ke ${url.replace(/\/\/.*@/, "//")}\n`);

for (const file of files) {
  const raw = readFileSync(path.join(drizzleDir, file), "utf8");
  const parts = raw.includes("statement-breakpoint")
    ? raw.split("--> statement-breakpoint")
    : raw.split(";");

  let jalan = 0;
  let lewat = 0;

  for (let stmt of parts) {
    stmt = stmt
      .split("\n")
      .filter((l) => !l.trim().startsWith("--"))
      .join("\n")
      .trim()
      .replace(/;$/, "");
    if (!stmt) continue;

    try {
      await client.execute(stmt);
      jalan++;
    } catch (e) {
      const msg = String(e.message || e);
      // "udah ada" = migrasi ini pernah jalan sebelumnya, bukan error.
      if (/already exists|duplicate column/i.test(msg)) {
        lewat++;
      } else {
        console.error(`\nGAGAL di ${file}:\n  ${msg}`);
        console.error(`  SQL: ${stmt.slice(0, 140).replace(/\s+/g, " ")}`);
        process.exit(1);
      }
    }
  }

  const status = jalan > 0 ? `${jalan} dijalankan` : "sudah up-to-date";
  console.log(`  ${file.padEnd(34)} ${status}${lewat ? `, ${lewat} dilewati` : ""}`);
}

console.log("\nSelesai.");
