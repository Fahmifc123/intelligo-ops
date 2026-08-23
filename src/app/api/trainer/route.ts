import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { trainer } from "@/db/schema";

export async function GET() {
  const rows = await db.select().from(trainer);
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  if (!body.nama) {
    return NextResponse.json({ error: "nama wajib diisi" }, { status: 400 });
  }
  const [row] = await db
    .insert(trainer)
    .values({
      nama: body.nama,
      email: body.email ?? null,
      bankName: body.bankName ?? null,
      bankAccountNumber: body.bankAccountNumber ?? null,
      bankAccountName: body.bankAccountName ?? null,
    })
    .returning();
  return NextResponse.json(row, { status: 201 });
}
