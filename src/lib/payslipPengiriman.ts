import { db } from "@/db";
import { payslip, payslipPengiriman } from "@/db/schema";
import { and, eq, inArray } from "drizzle-orm";

/**
 * Tutup satu catatan pengiriman. Dipanggil dari callback n8n, atau langsung
 * dari send-n8n kalau n8n dipakai tanpa callback (mode sinkron).
 *
 * sukses -> riwayat "sukses", payslip.dikirimAt keisi, dan payslip yang
 *           masih "belum_dibayar" naik ke "terkirim" (menunggu transfer).
 * Idempotent - aman dipanggil ulang (n8n boleh retry).
 */
export async function selesaikanPengiriman(
  pengirimanId: string,
  status: "sukses" | "gagal",
  error?: string
): Promise<boolean> {
  const [row] = await db
    .select()
    .from(payslipPengiriman)
    .where(eq(payslipPengiriman.id, pengirimanId));
  if (!row) return false;

  const now = new Date().toISOString();
  await db
    .update(payslipPengiriman)
    .set({
      status,
      error: status === "gagal" ? (error ?? "Gagal (tanpa keterangan dari n8n)") : null,
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
  return true;
}
