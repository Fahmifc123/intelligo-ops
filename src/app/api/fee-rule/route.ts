import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { feeRule } from "@/db/schema";

export async function GET() {
  const rows = await db.select().from(feeRule);
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const skema = body.skema ?? "flat";

  if (!body.kelasId) {
    return NextResponse.json({ error: "kelasId wajib diisi" }, { status: 400 });
  }
  if (skema !== "flat" && skema !== "paket") {
    return NextResponse.json(
      { error: "skema harus 'flat' atau 'paket'" },
      { status: 400 }
    );
  }

  // Skema paket: harga kelas dikunci di totalPaket, rate per sesi dihitung
  // ulang tiap kali dibaca (lihat src/lib/fee.ts). ratePerSesi di sini cuma
  // perkiraan hasil bagi rata biar query lama tetap dapat angka.
  if (skema === "paket") {
    const total = Number(body.totalPaket);
    const target = Number(body.targetSesi);
    if (!Number.isFinite(total) || total <= 0) {
      return NextResponse.json(
        { error: "totalPaket harus angka lebih dari 0" },
        { status: 400 }
      );
    }
    if (!Number.isFinite(target) || target <= 0) {
      return NextResponse.json(
        { error: "targetSesi harus angka lebih dari 0" },
        { status: 400 }
      );
    }
    const [row] = await db
      .insert(feeRule)
      .values({
        kelasId: body.kelasId,
        ratePerSesi: Math.round(total / target),
        skema: "paket",
        totalPaket: total,
        targetSesi: target,
      })
      .returning();
    return NextResponse.json(row, { status: 201 });
  }

  if (body.ratePerSesi === undefined) {
    return NextResponse.json(
      { error: "ratePerSesi wajib diisi buat skema flat" },
      { status: 400 }
    );
  }
  const [row] = await db
    .insert(feeRule)
    .values({
      kelasId: body.kelasId,
      ratePerSesi: body.ratePerSesi,
      skema: "flat",
    })
    .returning();
  return NextResponse.json(row, { status: 201 });
}
