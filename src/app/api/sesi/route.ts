import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { sesi, kelas } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function GET(req: NextRequest) {
  const kelasId = req.nextUrl.searchParams.get("kelasId");
  const query = db
    .select({
      id: sesi.id,
      kelasId: sesi.kelasId,
      kelasNama: kelas.nama,
      pertemuanKe: sesi.pertemuanKe,
      tanggal: sesi.tanggal,
      materi: sesi.materi,
      status: sesi.status,
      linkRecord: sesi.linkRecord,
      // Trainer sesi ini; null = ngikut trainer utama kelas.
      trainerId: sesi.trainerId,
      kelasTrainerId: kelas.trainerId,
    })
    .from(sesi)
    .leftJoin(kelas, eq(sesi.kelasId, kelas.id));

  const rows = kelasId ? await query.where(eq(sesi.kelasId, kelasId)) : await query;
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  if (!body.kelasId || !body.pertemuanKe) {
    return NextResponse.json(
      { error: "kelasId, pertemuanKe wajib diisi" },
      { status: 400 }
    );
  }
  const [row] = await db
    .insert(sesi)
    .values({
      kelasId: body.kelasId,
      pertemuanKe: body.pertemuanKe,
      tanggal: body.tanggal ?? null,
      materi: body.materi ?? null,
      status: body.status ?? "belum",
      linkRecord: body.linkRecord ?? null,
      // Kosong = ngikut trainer utama kelas (dipakai kelas satu trainer).
      trainerId: body.trainerId || null,
    })
    .returning();
  return NextResponse.json(row, { status: 201 });
}
