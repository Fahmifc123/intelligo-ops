import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { sesi } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();
  const [row] = await db
    .update(sesi)
    .set({
      ...(body.status !== undefined && { status: body.status }),
      ...(body.materi !== undefined && { materi: body.materi }),
      ...(body.tanggal !== undefined && { tanggal: body.tanggal }),
      ...(body.linkRecord !== undefined && { linkRecord: body.linkRecord }),
      // "" dari dropdown = balik ngikut trainer utama kelas.
      ...(body.trainerId !== undefined && { trainerId: body.trainerId || null }),
    })
    .where(eq(sesi.id, id))
    .returning();
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(row);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await db.delete(sesi).where(eq(sesi.id, id));
  return NextResponse.json({ ok: true });
}
