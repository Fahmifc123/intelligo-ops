import "server-only";
import { createHash } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

/**
 * Session stateless (JWT ditandatangani, disimpan di cookie) - gak ada
 * tabel session di DB. Cocok buat aplikasi single-user kayak ini: satu
 * username/password yang dicek dari env var, bukan tabel user.
 *
 * Pola ini persis rekomendasi resmi Next.js buat App Router - lihat
 * node_modules/next/dist/docs/01-app/02-guides/authentication.md,
 * bagian "Stateless Sessions".
 */

const COOKIE_NAME = "session";
const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000; // 30 hari

/**
 * Kunci buat nandatanganin JWT session. Sengaja gak butuh env var
 * terpisah (SESSION_SECRET) - diturunin dari AUTH_PASSWORD yang emang
 * udah wajib di-set, di-hash SHA-256 dulu biar:
 *   - panjangnya konsisten & cukup buat HS256 (password mentah user bisa
 *     pendek/lemah buat dipakai langsung sebagai kunci HMAC)
 *   - kalau AUTH_PASSWORD diganti, semua session lama otomatis invalid
 *     (kunci tandatangannya ikut berubah) - efek samping yang wajar.
 */
function getSecretKey() {
  const password = process.env.AUTH_PASSWORD;
  if (!password) {
    throw new Error(
      "AUTH_PASSWORD belum di-set. Isi di .env.local (lokal) atau Environment " +
        "Variables Vercel (production)."
    );
  }
  return createHash("sha256").update(password).update("intelligo-ops-session").digest();
}

type SessionPayload = {
  user: string;
  expiresAt: number;
};

async function encrypt(payload: SessionPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(Math.floor(payload.expiresAt / 1000))
    .sign(getSecretKey());
}

async function decrypt(token: string | undefined): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecretKey(), { algorithms: ["HS256"] });
    return payload as unknown as SessionPayload;
  } catch {
    // Token expired, tanda tangan gak cocok (SESSION_SECRET beda), atau
    // rusak - semua kasus ini diperlakukan sama: dianggap gak login.
    return null;
  }
}

/** Bikin session baru & simpen ke cookie. Dipanggil abis login sukses. */
export async function createSession(username: string) {
  const expiresAt = Date.now() + SESSION_DURATION_MS;
  const token = await encrypt({ user: username, expiresAt });
  const cookieStore = await cookies();

  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true, // gak kebaca dari JavaScript client - proteksi dari XSS
    secure: process.env.NODE_ENV === "production", // HTTPS only di production
    sameSite: "lax",
    expires: new Date(expiresAt),
    path: "/",
  });
}

/** Hapus session. Dipanggil pas logout. */
export async function deleteSession() {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}

/**
 * Cek session dari Server Component / Route Handler. Ini pengecekan
 * "beneran" (bukan optimistic) - dipakai di layout & API routes sebagai
 * lapisan kedua, gak cuma ngandelin proxy.ts.
 */
export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  return decrypt(cookieStore.get(COOKIE_NAME)?.value);
}

// Dipisah biar proxy.ts (jalan sebelum request nyampe route manapun) bisa
// baca cookie dari NextRequest langsung, tanpa lewat next/headers.
export async function decryptSessionToken(token: string | undefined) {
  return decrypt(token);
}

export { COOKIE_NAME as SESSION_COOKIE_NAME };
