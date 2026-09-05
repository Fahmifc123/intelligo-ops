import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { karyawan } from "@/db/schema";

export async function GET() {
  const rows = await db.select().from(karyawan);
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  if (!body.nama || !body.posisi) {
    return NextResponse.json({ error: "nama dan posisi wajib diisi" }, { status: 400 });
  }
  const [row] = await db
    .insert(karyawan)
    .values({
      nama: body.nama,
      posisi: body.posisi,
      bankName: body.bankName ?? null,
      bankAccountNumber: body.bankAccountNumber ?? null,
      bankAccountName: body.bankAccountName ?? null,
    })
    .returning();
  return NextResponse.json(row, { status: 201 });
}
