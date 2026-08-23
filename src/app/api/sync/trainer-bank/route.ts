import { NextRequest, NextResponse } from "next/server";
import { syncTrainerBankInfo } from "@/lib/trainerSync";

// POST /api/sync/trainer-bank  body: { link: string }
// Sync data rekening (Nama Bank, Nomor Rekening, Nama Pemilik Rekening)
// dari sheet Google Form pendaftaran trainer, dicocokin by email.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body?.link) {
    return NextResponse.json({ error: "link wajib diisi" }, { status: 400 });
  }
  try {
    const result = await syncTrainerBankInfo(body.link);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 400 }
    );
  }
}
