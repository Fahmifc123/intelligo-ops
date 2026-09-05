import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { karyawan, payslip } from "@/db/schema";
import { eq } from "drizzle-orm";

// PATCH /api/karyawan/[id]
// Field yang gak dikirim = gak diubah.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();

  const [existing] = await db.select().from(karyawan).where(eq(karyawan.id, id));
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

  if (body.nama !== undefined && !String(body.nama).trim()) {
    return NextResponse.json({ error: "nama gak boleh kosong" }, { status: 400 });
  }
  if (body.posisi !== undefined && !String(body.posisi).trim()) {
    return NextResponse.json({ error: "posisi gak boleh kosong" }, { status: 400 });
  }

  const [row] = await db
    .update(karyawan)
    .set({
      ...(body.nama !== undefined && { nama: String(body.nama).trim() }),
      ...(body.posisi !== undefined && { posisi: String(body.posisi).trim() }),
      ...(body.bankName !== undefined && { bankName: body.bankName || null }),
      ...(body.bankAccountNumber !== undefined && {
        bankAccountNumber: body.bankAccountNumber || null,
      }),
      ...(body.bankAccountName !== undefined && {
        bankAccountName: body.bankAccountName || null,
      }),
    })
    .where(eq(karyawan.id, id))
    .returning();

  return NextResponse.json(row);
}

// DELETE /api/karyawan/[id]
// Ditolak kalau karyawan ini masih punya payslip - biar gak ninggalin
// payslip yang nunjuk ke karyawan_id yang gak ada.
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const [existing] = await db.select().from(karyawan).where(eq(karyawan.id, id));
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

  const payslipTerkait = await db
    .select({ id: payslip.id })
    .from(payslip)
    .where(eq(payslip.karyawanId, id));

  if (payslipTerkait.length > 0) {
    return NextResponse.json(
      {
        error: `Karyawan ini masih punya ${payslipTerkait.length} payslip. Hapus payslip-nya dulu sebelum karyawan bisa dihapus.`,
      },
      { status: 409 }
    );
  }

  await db.delete(karyawan).where(eq(karyawan.id, id));
  return NextResponse.json({ ok: true });
}
