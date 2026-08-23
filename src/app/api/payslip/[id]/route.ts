import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { payslip, payslipItem, sesi } from "@/db/schema";
import { eq, inArray, ne, and } from "drizzle-orm";
import { hitungRatePerSesi } from "@/lib/feeQuery";

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

// PATCH /api/payslip/[id]
// { status?: "belum_dibayar" | "lunas" | "draft", jadwalPembayaran?: "YYYY-MM-DD" | null }
// Dua-duanya opsional & independen - body boleh cuma isi jadwalPembayaran
// tanpa nyentuh status (mis. dari form "isi jadwal buat export n8n").
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();

  if (body.status === undefined && body.jadwalPembayaran === undefined) {
    return NextResponse.json(
      { error: "isi minimal salah satu: status atau jadwalPembayaran" },
      { status: 400 }
    );
  }
  if (body.status !== undefined && !VALID_STATUS.includes(body.status)) {
    return NextResponse.json(
      { error: `status harus salah satu dari: ${VALID_STATUS.join(", ")}` },
      { status: 400 }
    );
  }
  if (
    body.jadwalPembayaran !== undefined &&
    body.jadwalPembayaran !== null &&
    !/^\d{4}-\d{2}-\d{2}$/.test(body.jadwalPembayaran)
  ) {
    return NextResponse.json(
      { error: "jadwalPembayaran harus format YYYY-MM-DD, mis. 2026-09-08" },
      { status: 400 }
    );
  }

  const [existing] = await db.select().from(payslip).where(eq(payslip.id, id));
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

  const patch: Record<string, unknown> = {};

  if (body.status !== undefined) {
    const from = existing.status as Status;
    const to = body.status as Status;
    if (from !== to && !ALLOWED_TRANSITIONS[from].includes(to)) {
      return NextResponse.json(
        { error: `Payslip status "${from}" nggak bisa langsung diubah ke "${to}"` },
        { status: 409 }
      );
    }
    patch.status = to;
    patch.finalizedAt = to === "belum_dibayar" ? new Date().toISOString() : existing.finalizedAt;
    patch.paidAt = to === "lunas" ? new Date().toISOString() : to === "draft" ? null : existing.paidAt;
  }

  if (body.jadwalPembayaran !== undefined) {
    patch.jadwalPembayaran = body.jadwalPembayaran;
  }

  const [row] = await db.update(payslip).set(patch).where(eq(payslip.id, id)).returning();

  return NextResponse.json(row);
}

// PUT /api/payslip/[id] { sesiIds: string[], periode?: "YYYY-MM" }
// Ganti seluruh set sesi payslip yang masih draft (buat tombol "Edit"
// sebelum Finalisasi diklik). Cuma boleh selagi draft - begitu udah
// difinalisasi, harus dibalikin ke draft dulu (PATCH status) baru bisa diedit.
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();
  const { sesiIds } = body;

  if (!Array.isArray(sesiIds) || sesiIds.length === 0) {
    return NextResponse.json({ error: "sesiIds (minimal 1) wajib diisi" }, { status: 400 });
  }
  if (body.periode !== undefined && !/^\d{4}-\d{2}$/.test(body.periode)) {
    return NextResponse.json(
      { error: "periode harus format YYYY-MM, mis. 2026-08" },
      { status: 400 }
    );
  }

  const [existing] = await db.select().from(payslip).where(eq(payslip.id, id));
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (existing.status !== "draft") {
    return NextResponse.json(
      { error: "Payslip cuma bisa diedit selagi masih draft. Balikin ke draft dulu." },
      { status: 409 }
    );
  }

  // Validasi sama kayak POST: sesi harus ada & "selesai", dan belum
  // nempel di payslip LAIN (nempel di payslip ini sendiri itu wajar,
  // karena kita lagi nge-replace isi payslip ini).
  const sesiRows = await db
    .select({
      id: sesi.id,
      status: sesi.status,
      tanpaFee: sesi.tanpaFee,
    })
    .from(sesi)
    .where(inArray(sesi.id, sesiIds));

  // Sama kayak POST: rate paket butuh jumlah sesi penuh kelasnya.
  const rateMap = await hitungRatePerSesi();

  if (sesiRows.length !== sesiIds.length) {
    return NextResponse.json({ error: "Ada sesiId yang gak ditemukan" }, { status: 400 });
  }
  const belumSelesai = sesiRows.filter((s) => s.status !== "selesai");
  if (belumSelesai.length > 0) {
    return NextResponse.json(
      { error: `${belumSelesai.length} sesi yang dipilih belum berstatus selesai` },
      { status: 400 }
    );
  }
  const tanpaFeeCount = sesiRows.filter((s) => s.tanpaFee).length;
  if (tanpaFeeCount > 0) {
    return NextResponse.json(
      {
        error: `${tanpaFeeCount} sesi yang dipilih adalah materi Video Course - gak ada fee-nya, gak bisa dimasukin payslip.`,
      },
      { status: 400 }
    );
  }

  const existingItems = await db
    .select({ sesiId: payslipItem.sesiId })
    .from(payslipItem)
    .where(and(inArray(payslipItem.sesiId, sesiIds), ne(payslipItem.payslipId, id)));
  if (existingItems.length > 0) {
    return NextResponse.json(
      {
        error: `${existingItems.length} sesi yang dipilih udah masuk payslip lain. Batalin payslip lama dulu kalau mau pindahin.`,
      },
      { status: 409 }
    );
  }

  await db.delete(payslipItem).where(eq(payslipItem.payslipId, id));
  await db.insert(payslipItem).values(
    sesiRows.map((s) => ({
      payslipId: id,
      sesiId: s.id,
      ratePerSesi: rateMap[s.id] ?? 0,
    }))
  );

  let row = existing;
  if (body.periode !== undefined && body.periode !== existing.periode) {
    [row] = await db
      .update(payslip)
      .set({ periode: body.periode })
      .where(eq(payslip.id, id))
      .returning();
  }

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
