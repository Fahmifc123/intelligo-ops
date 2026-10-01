import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { payslip, payslipPengiriman } from "@/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { n8nAuthorized } from "@/lib/n8n";

// POST /api/n8n/payslip-callback  { pengirimanId, status: "sukses" | "gagal", error? }
// Dipanggil node HTTP Request di ujung workflow n8n (setelah email terkirim).
// Auth: Authorization: Bearer <N8N_SECRET>. Idempotent - n8n boleh retry.
//
// sukses -> riwayat jadi "sukses", payslip.dikirimAt keisi, dan payslip yang
//           masih "belum_dibayar" naik ke "terkirim" (menunggu transfer).
export async function POST(req: NextRequest) {
  if (!n8nAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const { pengirimanId, status, error } = body ?? {};
  if (!pengirimanId || (status !== "sukses" && status !== "gagal")) {
    return NextResponse.json(
      { error: 'pengirimanId & status ("sukses" | "gagal") wajib diisi' },
      { status: 400 }
    );
  }

  const [row] = await db
    .select()
    .from(payslipPengiriman)
    .where(eq(payslipPengiriman.id, pengirimanId));
  if (!row) return NextResponse.json({ error: "pengiriman tidak ditemukan" }, { status: 404 });

  const now = new Date().toISOString();
  await db
    .update(payslipPengiriman)
    .set({
      status,
      error: status === "gagal" ? String(error ?? "Gagal (tanpa keterangan dari n8n)") : null,
      completedAt: now,
    })
    .where(eq(payslipPengiriman.id, pengirimanId));

  if (status === "sukses") {
    const ids: string[] = JSON.parse(row.payslipIds);
    await db.update(payslip).set({ dikirimAt: now }).where(inArray(payslip.id, ids));
    await db
      .update(payslip)
      .set({ status: "terkirim" })
      .where(and(inArray(payslip.id, ids), eq(payslip.status, "belum_dibayar")));
  }

  return NextResponse.json({ ok: true });
}
