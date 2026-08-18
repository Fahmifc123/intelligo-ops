import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { feeRule } from "@/db/schema";

export async function GET() {
  const rows = await db.select().from(feeRule);
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  if (!body.kelasId || body.ratePerSesi === undefined) {
    return NextResponse.json(
      { error: "kelasId, ratePerSesi wajib diisi" },
      { status: 400 }
    );
  }
  const [row] = await db
    .insert(feeRule)
    .values({
      kelasId: body.kelasId,
      ratePerSesi: body.ratePerSesi,
      skema: body.skema ?? "flat",
    })
    .returning();
  return NextResponse.json(row, { status: 201 });
}
