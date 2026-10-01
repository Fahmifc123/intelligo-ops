import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { payslip, payslipPengiriman } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import { buildExportPayload } from "@/lib/payslipExport";
import { selesaikanPengiriman } from "@/lib/payslipPengiriman";

// Mode sinkron nunggu workflow n8n selesai - kasih ruang lebih dari default.
export const maxDuration = 60;

// POST /api/payslip/send-n8n  { ids: string[], jadwalPembayaran?: "YYYY-MM-DD" }
// Kirim satu/beberapa payslip (trainer yang sama) ke webhook n8n, dan catat
// di riwayat pengiriman dengan status "menunggu". n8n yang ngabarin hasil
// akhirnya lewat POST /api/n8n/payslip-callback - status payslip baru naik
// ke "terkirim" setelah callback sukses, bukan pas webhook dipanggil.
//
// Mode sederhana (N8N_SECRET kosong): gak perlu callback. Set node Webhook
// n8n ke "Respond: When Last Node Finishes" - balasan 2xx dianggap workflow
// selesai (email terkirim), dan non-2xx/timeout dianggap gagal.
export async function POST(req: NextRequest) {
  const webhookUrl = process.env.N8N_WEBHOOK_URL;
  if (!webhookUrl) {
    return NextResponse.json({ error: "N8N_WEBHOOK_URL belum diset di env" }, { status: 500 });
  }

  const body = await req.json().catch(() => null);
  const ids: string[] = Array.isArray(body?.ids) ? body.ids.filter(Boolean) : [];
  if (ids.length === 0) {
    return NextResponse.json({ error: "ids wajib diisi" }, { status: 400 });
  }

  if (body.jadwalPembayaran) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(body.jadwalPembayaran)) {
      return NextResponse.json({ error: "jadwalPembayaran harus YYYY-MM-DD" }, { status: 400 });
    }
    await db
      .update(payslip)
      .set({ jadwalPembayaran: body.jadwalPembayaran })
      .where(inArray(payslip.id, ids));
  }

  const built = await buildExportPayload(ids);
  if (!built.ok) return NextResponse.json({ error: built.error }, { status: built.status });
  const { data } = built;

  const [pengiriman] = await db
    .insert(payslipPengiriman)
    .values({
      trainerId: built.trainerId,
      trainerNama: data.nama ?? "-",
      email: data.email || null,
      periode: data.periode,
      payslipIds: JSON.stringify(ids),
    })
    .returning();

  const modeCallback = Boolean(process.env.N8N_SECRET);
  const base = process.env.APP_URL?.replace(/\/$/, "") ?? req.nextUrl.origin;

  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(process.env.N8N_SECRET && { Authorization: `Bearer ${process.env.N8N_SECRET}` }),
      },
      body: JSON.stringify({
        ...data,
        // items_json tetap string (workflow lama: node Parse items_json),
        // items versi array disediain buat workflow baru.
        items: JSON.parse(data.items_json),
        pengiriman_id: pengiriman.id,
        payslip_ids: ids,
        callback_url: `${base}/api/n8n/payslip-callback`,
      }),
      signal: AbortSignal.timeout(modeCallback ? 15_000 : 55_000),
    });
    if (!res.ok) throw new Error(`Webhook n8n balas ${res.status}`);
    if (!modeCallback) {
      await selesaikanPengiriman(pengiriman.id, "sukses");
      return NextResponse.json({ ...pengiriman, status: "sukses" });
    }
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    await db
      .update(payslipPengiriman)
      .set({ status: "gagal", error, completedAt: new Date().toISOString() })
      .where(eq(payslipPengiriman.id, pengiriman.id));
    return NextResponse.json({ error: `Gagal memanggil n8n: ${error}` }, { status: 502 });
  }

  return NextResponse.json(pengiriman);
}
