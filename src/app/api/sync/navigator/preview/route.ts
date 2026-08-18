import { NextRequest, NextResponse } from "next/server";
import { previewNavigatorSheet, extractSheetId } from "@/lib/navigatorSync";

// POST /api/sync/navigator/preview  body: { link: string, columnMap?: {...} }
// Dipakai admin buat cek link sheet valid & kolom Pertemuan/Trainer kedetect,
// sebelum kelas-nya beneran disimpan. `columnMap` opsional = mapping kolom
// manual buat sheet yang nama kolomnya gak ketebak auto-detect.
export async function POST(req: NextRequest) {
  const body = await req.json();
  if (!body.link) {
    return NextResponse.json({ error: "link wajib diisi" }, { status: 400 });
  }
  try {
    const result = await previewNavigatorSheet(body.link, body.columnMap ?? null);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      {
        error: e instanceof Error ? e.message : String(e),
        sheetId: extractSheetId(body.link),
      },
      { status: 400 }
    );
  }
}
