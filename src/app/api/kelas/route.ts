import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { kelas, trainer } from "@/db/schema";
import { eq } from "drizzle-orm";
import { extractSheetId } from "@/lib/navigatorSync";

export async function GET() {
  const rows = await db
    .select({
      id: kelas.id,
      nama: kelas.nama,
      tipe: kelas.tipe,
      tanggalMulai: kelas.tanggalMulai,
      trainerId: kelas.trainerId,
      trainerNama: trainer.nama,
      navigatorSheetId: kelas.navigatorSheetId,
      navigatorLastSyncedAt: kelas.navigatorLastSyncedAt,
    })
    .from(kelas)
    .leftJoin(trainer, eq(kelas.trainerId, trainer.id));
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  if (!body.nama || !body.tipe || !body.trainerId) {
    return NextResponse.json(
      { error: "nama, tipe, trainerId wajib diisi" },
      { status: 400 }
    );
  }
  const [row] = await db
    .insert(kelas)
    .values({
      nama: body.nama,
      tipe: body.tipe,
      trainerId: body.trainerId,
      tanggalMulai: body.tanggalMulai ?? null,
      navigatorSheetId: body.navigatorSheetId ? extractSheetId(body.navigatorSheetId) : null,
      // Mapping kolom manual disimpan sebagai JSON string; null = pakai auto-detect.
      navigatorColumnMap: body.navigatorColumnMap
        ? JSON.stringify(body.navigatorColumnMap)
        : null,
    })
    .returning();
  return NextResponse.json(row, { status: 201 });
}
