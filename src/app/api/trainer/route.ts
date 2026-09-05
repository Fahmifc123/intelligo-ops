import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { trainer } from "@/db/schema";
import { eq } from "drizzle-orm";

// GET /api/trainer?tipe=trainer|karyawan (opsional, default "trainer")
// Satu tabel buat trainer & karyawan non-trainer - default cuma balikin
// trainer beneran biar dropdown assign-trainer di Kelas/Sesi/Trainer
// Management gak kecampur karyawan non-trainer. Pakai ?tipe=karyawan buat
// halaman Karyawan, atau ?tipe=all buat kebutuhan lain yang butuh dua-duanya.
export async function GET(req: NextRequest) {
  const tipe = req.nextUrl.searchParams.get("tipe") ?? "trainer";
  if (tipe === "all") {
    const rows = await db.select().from(trainer);
    return NextResponse.json(rows);
  }
  const rows = await db.select().from(trainer).where(eq(trainer.tipe, tipe));
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  if (!body.nama) {
    return NextResponse.json({ error: "nama wajib diisi" }, { status: 400 });
  }
  const tipe = body.tipe === "karyawan" ? "karyawan" : "trainer";
  if (tipe === "karyawan" && !body.posisi) {
    return NextResponse.json({ error: "posisi wajib diisi buat karyawan" }, { status: 400 });
  }
  const [row] = await db
    .insert(trainer)
    .values({
      nama: body.nama,
      tipe,
      posisi: tipe === "karyawan" ? body.posisi : null,
      email: body.email ?? null,
      bankName: body.bankName ?? null,
      bankAccountNumber: body.bankAccountNumber ?? null,
      bankAccountName: body.bankAccountName ?? null,
    })
    .returning();
  return NextResponse.json(row, { status: 201 });
}
