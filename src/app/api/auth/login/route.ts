import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { createSession } from "@/lib/session";

/**
 * Bandingin dua string tanpa bocorin informasi lewat waktu eksekusi.
 * String compare biasa (`===`) berhenti di karakter pertama yang beda,
 * jadi attacker bisa nebak password karakter-per-karakter dari lamanya
 * response. timingSafeEqual butuh panjang yang sama, makanya di-pad dulu.
 */
function amanBandingkan(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    // Tetap jalanin compare (walau hasilnya pasti false) biar durasinya
    // konsisten sama kasus yang panjangnya sama - biar gak ada dua
    // "kelas waktu" yang beda buat attacker.
    timingSafeEqual(bufA, bufA);
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

export async function POST(req: NextRequest) {
  const expectedUser = process.env.AUTH_USERNAME;
  const expectedPass = process.env.AUTH_PASSWORD;

  if (!expectedUser || !expectedPass) {
    return NextResponse.json(
      { error: "Login belum dikonfigurasi. Set AUTH_USERNAME & AUTH_PASSWORD di server." },
      { status: 500 }
    );
  }

  const body = await req.json().catch(() => null);
  const username = typeof body?.username === "string" ? body.username : "";
  const password = typeof body?.password === "string" ? body.password : "";

  const userOk = amanBandingkan(username, expectedUser);
  const passOk = amanBandingkan(password, expectedPass);

  if (!userOk || !passOk) {
    // Pesan generik - jangan bocorin mana yang salah (username atau
    // password), biar gak ngasih petunjuk buat attacker.
    return NextResponse.json({ error: "Username atau password salah" }, { status: 401 });
  }

  await createSession(username);
  return NextResponse.json({ ok: true });
}
