import { NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";

/**
 * Cek header "Authorization: Bearer <N8N_SECRET>" dari n8n. Fail-closed:
 * kalau N8N_SECRET belum diset di env, semua request ditolak - endpoint
 * ini lewat dari gerbang login (lihat proxy.ts), jadi gak boleh kebuka.
 */
export function n8nAuthorized(req: NextRequest): boolean {
  const secret = process.env.N8N_SECRET;
  if (!secret) return false;
  const given = Buffer.from(req.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}
