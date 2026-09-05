import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { trainer, kelas, sesi, payslip, feeRule } from "@/db/schema";
import { eq } from "drizzle-orm";

// PATCH /api/trainer/[id]
// Field yang gak dikirim = gak diubah. Dipakai buat isi email & data
// rekening (bank/nomor rekening/nama pemilik) yang dibutuhin export payslip
// ke format n8n - dua-duanya belum bisa diisi lewat form manapun sebelumnya.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();

  const [existing] = await db.select().from(trainer).where(eq(trainer.id, id));
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

  if (body.nama !== undefined && !String(body.nama).trim()) {
    return NextResponse.json({ error: "nama gak boleh kosong" }, { status: 400 });
  }
  if (body.posisi !== undefined && existing.tipe === "karyawan" && !String(body.posisi).trim()) {
    return NextResponse.json({ error: "posisi gak boleh kosong" }, { status: 400 });
  }

  const [row] = await db
    .update(trainer)
    .set({
      ...(body.nama !== undefined && { nama: String(body.nama).trim() }),
      ...(body.posisi !== undefined && { posisi: body.posisi || null }),
      ...(body.email !== undefined && { email: body.email || null }),
      ...(body.bankName !== undefined && { bankName: body.bankName || null }),
      ...(body.bankAccountNumber !== undefined && {
        bankAccountNumber: body.bankAccountNumber || null,
      }),
      ...(body.bankAccountName !== undefined && {
        bankAccountName: body.bankAccountName || null,
      }),
    })
    .where(eq(trainer.id, id))
    .returning();

  return NextResponse.json(row);
}

// DELETE /api/trainer/[id]
// Ditolak kalau trainer masih jadi trainer utama kelas manapun, masih
// ditugasin ke sesi manapun (trainer tambahan), punya fee_rule sendiri,
// atau punya payslip - trainer yang udah kepakai gak boleh ilang diam-diam
// karena bakal ninggalin data yatim (kelas/sesi/payslip nunjuk ke ID yang
// gak ada).
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const [existing] = await db.select().from(trainer).where(eq(trainer.id, id));
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

  const [kelasUtama, sesiTerkait, payslipTerkait, feeRuleTerkait] = await Promise.all([
    db.select({ id: kelas.id }).from(kelas).where(eq(kelas.trainerId, id)),
    db.select({ id: sesi.id }).from(sesi).where(eq(sesi.trainerId, id)),
    db.select({ id: payslip.id }).from(payslip).where(eq(payslip.trainerId, id)),
    db.select({ id: feeRule.id }).from(feeRule).where(eq(feeRule.trainerId, id)),
  ]);

  const alasan: string[] = [];
  if (kelasUtama.length > 0) alasan.push(`trainer utama di ${kelasUtama.length} kelas`);
  if (sesiTerkait.length > 0) alasan.push(`ditugaskan ke ${sesiTerkait.length} sesi`);
  if (payslipTerkait.length > 0) alasan.push(`punya ${payslipTerkait.length} payslip`);
  if (feeRuleTerkait.length > 0) alasan.push(`punya ${feeRuleTerkait.length} aturan fee`);

  if (alasan.length > 0) {
    return NextResponse.json(
      { error: `Data ini masih ${alasan.join(", ")}. Pindahkan atau hapus dulu sebelum bisa dihapus.` },
      { status: 409 }
    );
  }

  await db.delete(trainer).where(eq(trainer.id, id));
  return NextResponse.json({ ok: true });
}
