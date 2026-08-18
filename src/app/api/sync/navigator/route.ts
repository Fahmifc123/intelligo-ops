import { NextRequest, NextResponse } from "next/server";
import { syncAllKelas, syncKelasFromNavigator } from "@/lib/navigatorSync";

// POST /api/sync/navigator            -> sync semua kelas yang punya navigatorSheetId
// POST /api/sync/navigator?kelasId=xx -> sync 1 kelas aja
//
// Kalau SYNC_SECRET diset di env, request harus bawa header
// Authorization: Bearer <SYNC_SECRET> - biar endpoint ini gak bisa dipanggil sembarang
// orang (penting kalau nanti di-hit otomatis dari cron job eksternal).
export async function POST(req: NextRequest) {
  const secret = process.env.SYNC_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  const kelasId = req.nextUrl.searchParams.get("kelasId");

  try {
    if (kelasId) {
      const result = await syncKelasFromNavigator(kelasId);
      return NextResponse.json(result);
    }
    const results = await syncAllKelas();
    return NextResponse.json(results);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
