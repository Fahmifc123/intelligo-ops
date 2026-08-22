import { NextRequest, NextResponse } from "next/server";
import { decryptSessionToken, SESSION_COOKIE_NAME } from "@/lib/session";

/**
 * Gerbang login buat SELURUH aplikasi - beda dari contoh di docs Next.js
 * yang cuma proteksi satu route (mis. /dashboard). Di sini semua halaman
 * & API PRIVATE by default; yang publik cuma /login dan endpoint login-nya
 * sendiri.
 *
 * Ini "optimistic check" (cuma baca & verifikasi cookie, gak query DB) -
 * proxy jalan di tiap request termasuk yang di-prefetch, jadi harus ringan.
 * Route API tetap boleh nambahin pengecekan getSession() sendiri kalau
 * butuh data user yang lebih detail.
 */

const PUBLIC_PATHS = ["/login", "/api/auth/login"];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p);
}

export default async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = await decryptSessionToken(token);

  if (!session) {
    // API route: 401 JSON, bukan redirect - fetch() di client gak ngikutin
    // redirect ke halaman HTML dengan baik, dan pemanggilnya butuh status
    // code buat tau harus ngapain (mis. lempar ke /login).
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Belum login" }, { status: 401 });
    }

    const loginUrl = new URL("/login", req.url);
    if (pathname !== "/") loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  // Semua path KECUALI file statis Next.js sendiri (_next/*, favicon,
  // manifest, dst) - itu harus tetap kebuka biar halaman login-nya sendiri
  // bisa ke-render (CSS, font, ikon).
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon-.*\\.png|apple-touch-icon.png|manifest.json).*)",
  ],
};
