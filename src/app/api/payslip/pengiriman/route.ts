import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { payslipPengiriman } from "@/db/schema";
import { desc, eq } from "drizzle-orm";

// GET /api/payslip/pengiriman?trainerId=...  (opsional)
// Riwayat pengiriman payslip lewat n8n, terbaru dulu.
export async function GET(req: NextRequest) {
  const trainerId = req.nextUrl.searchParams.get("trainerId");
  const q = db.select().from(payslipPengiriman);
  const rows = await (trainerId ? q.where(eq(payslipPengiriman.trainerId, trainerId)) : q)
    .orderBy(desc(payslipPengiriman.createdAt))
    .limit(200);
  return NextResponse.json(rows.map((r) => ({ ...r, payslipIds: JSON.parse(r.payslipIds) })));
}
