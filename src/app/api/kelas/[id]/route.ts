import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { kelas, feeRule, sesi, trainer } from "@/db/schema";
import { eq } from "drizzle-orm";
import { extractSheetId } from "@/lib/navigatorSync";

const VALID_TIPE = ["bootcamp", "private", "mbc", "corporate"];

// GET /api/kelas/[id] - satu kelas + rate-nya, buat ngisi form edit.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const [row] = await db
    .select({
      id: kelas.id,
      nama: kelas.nama,
      tipe: kelas.tipe,
      trainerId: kelas.trainerId,
      trainerNama: trainer.nama,
      tanggalMulai: kelas.tanggalMulai,
      navigatorSheetId: kelas.navigatorSheetId,
      navigatorColumnMap: kelas.navigatorColumnMap,
      navigatorLastSyncedAt: kelas.navigatorLastSyncedAt,
    })
    .from(kelas)
    .leftJoin(trainer, eq(kelas.trainerId, trainer.id))
    .where(eq(kelas.id, id));

  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });

  const [rule] = await db.select().from(feeRule).where(eq(feeRule.kelasId, id));
  return NextResponse.json({ ...row, ratePerSesi: rule?.ratePerSesi ?? null });
}

// PATCH /api/kelas/[id]
// Field yang gak dikirim = gak diubah, jadi form bisa ngirim sebagian aja.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();

  const [existing] = await db.select().from(kelas).where(eq(kelas.id, id));
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

  if (body.nama !== undefined && !String(body.nama).trim()) {
    return NextResponse.json({ error: "nama gak boleh kosong" }, { status: 400 });
  }
  if (body.tipe !== undefined && !VALID_TIPE.includes(body.tipe)) {
    return NextResponse.json(
      { error: `tipe harus salah satu dari: ${VALID_TIPE.join(", ")}` },
      { status: 400 }
    );
  }
  // Trainer dicek beneran ada - kalau nggak, insert-nya bakal kena
  // FOREIGN KEY constraint dengan pesan yang gak kebaca sama user.
  if (body.trainerId !== undefined) {
    const [t] = await db.select().from(trainer).where(eq(trainer.id, body.trainerId));
    if (!t) return NextResponse.json({ error: "trainer gak ditemukan" }, { status: 400 });
  }

  const [row] = await db
    .update(kelas)
    .set({
      ...(body.nama !== undefined && { nama: String(body.nama).trim() }),
      ...(body.tipe !== undefined && { tipe: body.tipe }),
      ...(body.trainerId !== undefined && { trainerId: body.trainerId }),
      ...(body.tanggalMulai !== undefined && { tanggalMulai: body.tanggalMulai || null }),
      // String kosong = user ngosongin field-nya, artinya lepas sheet-nya.
      ...(body.navigatorSheetId !== undefined && {
        navigatorSheetId: body.navigatorSheetId
          ? extractSheetId(body.navigatorSheetId)
          : null,
      }),
      ...(body.navigatorColumnMap !== undefined && {
        navigatorColumnMap: body.navigatorColumnMap
          ? JSON.stringify(body.navigatorColumnMap)
          : null,
      }),
    })
    .where(eq(kelas.id, id))
    .returning();

  // Rate disimpan di tabel terpisah. Wajib UPDATE baris yang udah ada,
  // bukan insert baris baru: /api/fee join ke feeRule tanpa filter, jadi
  // dua baris buat satu kelas bikin tiap sesi kehitung dobel.
  // Payslip yang udah jadi gak ikut berubah - rate-nya udah di-snapshot
  // di payslip_item pas payslip dibuat.
  if (body.ratePerSesi !== undefined) {
    const rate = Number(body.ratePerSesi);
    const [rule] = await db.select().from(feeRule).where(eq(feeRule.kelasId, id));

    if (body.ratePerSesi === null || body.ratePerSesi === "") {
      if (rule) await db.delete(feeRule).where(eq(feeRule.kelasId, id));
    } else if (!Number.isFinite(rate) || rate < 0) {
      return NextResponse.json(
        { error: "ratePerSesi harus angka >= 0" },
        { status: 400 }
      );
    } else if (rule) {
      await db.update(feeRule).set({ ratePerSesi: rate }).where(eq(feeRule.kelasId, id));
    } else {
      await db.insert(feeRule).values({ kelasId: id, ratePerSesi: rate, skema: "flat" });
    }
  }

  return NextResponse.json(row);
}

// DELETE /api/kelas/[id]
// Ditolak kalau masih ada sesi - sesi nyimpen histori ngajar & bisa
// nyangkut di payslip, jadi mending user hapus sesinya dulu secara sadar
// daripada kita ikut hapus diam-diam.
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const [existing] = await db.select().from(kelas).where(eq(kelas.id, id));
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

  const sesiRows = await db.select({ id: sesi.id }).from(sesi).where(eq(sesi.kelasId, id));
  if (sesiRows.length > 0) {
    return NextResponse.json(
      {
        error: `Kelas ini masih punya ${sesiRows.length} sesi. Hapus sesinya dulu sebelum hapus kelas.`,
      },
      { status: 409 }
    );
  }

  await db.delete(feeRule).where(eq(feeRule.kelasId, id));
  await db.delete(kelas).where(eq(kelas.id, id));

  return NextResponse.json({ ok: true });
}
