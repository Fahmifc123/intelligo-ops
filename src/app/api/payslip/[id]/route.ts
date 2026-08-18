import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { payslip, payslipItem } from "@/db/schema";
import { eq } from "drizzle-orm";

const VALID_STATUS = ["draft", "belum_dibayar", "lunas"] as const;
type Status = (typeof VALID_STATUS)[number];

// Transisi yang diizinkan. Alurnya linear (draft -> belum_dibayar -> lunas),
// tapi "belum_dibayar" boleh balik ke "draft" buat koreksi sesi sebelum
// beneran dibayar. Begitu "lunas", udah final - gak ada jalan balik dari sini
// lewat endpoint ini (biar histori penggajian gak berubah-ubah).
const ALLOWED_TRANSITIONS: Record<Status, Status[]> = {
  draft: ["belum_dibayar"],
  belum_dibayar: ["draft", "lunas"],
  lunas: [],
};

// PATCH /api/payslip/[id] { status: "belum_dibayar" | "lunas" | "draft" }
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();

  if (!VALID_STATUS.includes(body.status)) {
    return NextResponse.json(
      { error: `status harus salah satu dari: ${VALID_STATUS.join(", ")}` },
      { status: 400 }
    );
  }

  const [existing] = await db.select().from(payslip).where(eq(payslip.id, id));
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

  const from = existing.status as Status;
  const to = body.status as Status;
  if (from !== to && !ALLOWED_TRANSITIONS[from].includes(to)) {
    return NextResponse.json(
      { error: `Payslip status "${from}" nggak bisa langsung diubah ke "${to}"` },
      { status: 409 }
    );
  }

  const [row] = await db
    .update(payslip)
    .set({
      status: to,
      finalizedAt: to === "belum_dibayar" ? new Date().toISOString() : existing.finalizedAt,
      paidAt: to === "lunas" ? new Date().toISOString() : to === "draft" ? null : existing.paidAt,
    })
    .where(eq(payslip.id, id))
    .returning();

  return NextResponse.json(row);
}

// DELETE /api/payslip/[id]
// Batalin payslip - cuma boleh selagi masih "draft". Sesi-sesi di dalamnya
// otomatis "lepas" (item ikut kehapus) dan bisa dicentang lagi ke payslip
// lain setelah ini.
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const [existing] = await db.select().from(payslip).where(eq(payslip.id, id));
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

  if (existing.status !== "draft") {
    return NextResponse.json(
      {
        error:
          "Payslip udah difinalisasi, nggak bisa dihapus langsung. Balikin ke draft dulu (kalau masih 'belum_dibayar') baru bisa dibatalin.",
      },
      { status: 409 }
    );
  }

  await db.delete(payslipItem).where(eq(payslipItem.payslipId, id));
  await db.delete(payslip).where(eq(payslip.id, id));

  return NextResponse.json({ ok: true });
}
