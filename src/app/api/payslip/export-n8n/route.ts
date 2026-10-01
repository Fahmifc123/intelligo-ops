import { NextRequest, NextResponse } from "next/server";
import { buildExportPayload } from "@/lib/payslipExport";

// GET /api/payslip/export-n8n?ids=id1,id2,...
// Preview payload yang dikirim ke n8n (lihat buildExportPayload buat
// aturan lengkapnya). Pengiriman beneran lewat POST /api/payslip/send-n8n.
export async function GET(req: NextRequest) {
  const idsParam = req.nextUrl.searchParams.get("ids");
  const ids = idsParam ? idsParam.split(",").filter(Boolean) : [];
  const r = await buildExportPayload(ids);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json(r.data);
}
