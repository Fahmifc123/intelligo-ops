import { NextRequest, NextResponse } from "next/server";
import { selesaikanPengiriman } from "@/lib/payslipPengiriman";
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

  const ok = await selesaikanPengiriman(
    pengirimanId,
    status,
    error === undefined ? undefined : String(error)
  );
  if (!ok) return NextResponse.json({ error: "pengiriman tidak ditemukan" }, { status: 404 });

  return NextResponse.json({ ok: true });
}
