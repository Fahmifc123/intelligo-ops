import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { payslip, payslipPengiriman, trainer } from "@/db/schema";
import { eq } from "drizzle-orm";
import { periodeLabel } from "@/lib/payslipExport";

// POST /api/payslip/[id]/konfirmasi-manual  { dibayar?: boolean }
// Admin konfirmasi payslip ini SUDAH DIKIRIM ke trainer secara manual (di
// luar n8n, mis. lewat WA/email biasa). Dicatat di riwayat pengiriman
// (metode "manual") dan payslip.dikirimAt keisi, sama kayak pengiriman n8n.
//   dibayar: false (default) -> status jadi "terkirim" (menunggu transfer)
//   dibayar: true            -> sekalian "lunas" (udah dikirim DAN udah dibayar)
// Cuma boleh dari status "belum_dibayar" - draft belum final, dan
// "terkirim"/"lunas" udah lewat tahap ini.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const dibayar = body?.dibayar === true;

  const [row] = await db
    .select({
      id: payslip.id,
      status: payslip.status,
      periode: payslip.periode,
      trainerId: payslip.trainerId,
      trainerNama: trainer.nama,
      email: trainer.email,
    })
    .from(payslip)
    .leftJoin(trainer, eq(payslip.trainerId, trainer.id))
    .where(eq(payslip.id, id));
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });

  if (row.status !== "belum_dibayar") {
    return NextResponse.json(
      { error: `Konfirmasi manual cuma bisa dari status "Belum Dibayar" (sekarang: ${row.status})` },
      { status: 409 }
    );
  }

  const now = new Date().toISOString();
  await db.insert(payslipPengiriman).values({
    trainerId: row.trainerId,
    trainerNama: row.trainerNama ?? "-",
    email: row.email,
    periode: periodeLabel(row.periode),
    payslipIds: JSON.stringify([id]),
    status: "sukses",
    metode: "manual",
    completedAt: now,
  });

  const [updated] = await db
    .update(payslip)
    .set({
      dikirimAt: now,
      status: dibayar ? "lunas" : "terkirim",
      ...(dibayar && { paidAt: now }),
    })
    .where(eq(payslip.id, id))
    .returning();

  return NextResponse.json(updated);
}
