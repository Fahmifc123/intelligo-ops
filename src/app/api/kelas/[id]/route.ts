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
  return NextResponse.json({
    ...row,
    skema: rule?.skema ?? "flat",
    ratePerSesi: rule?.ratePerSesi ?? null,
    totalPaket: rule?.totalPaket ?? null,
    targetSesi: rule?.targetSesi ?? null,
  });
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

  // Fee disimpan di tabel terpisah. Wajib UPDATE baris yang udah ada,
  // bukan insert baris baru: /api/fee join ke feeRule tanpa filter, jadi
  // dua baris buat satu kelas bikin tiap sesi kehitung dobel.
  // Payslip yang udah jadi gak ikut berubah - rate-nya udah di-snapshot
  // di payslip_item pas payslip dibuat.
  const ubahFee =
    body.skema !== undefined ||
    body.ratePerSesi !== undefined ||
    body.totalPaket !== undefined ||
    body.targetSesi !== undefined;

  if (ubahFee) {
    const [rule] = await db.select().from(feeRule).where(eq(feeRule.kelasId, id));
    const skema = body.skema ?? rule?.skema ?? "flat";

    if (skema !== "flat" && skema !== "paket") {
      return NextResponse.json(
        { error: "skema harus 'flat' atau 'paket'" },
        { status: 400 }
      );
    }

    const kosong = (v: unknown) => v === null || v === "" || v === undefined;

    if (skema === "paket") {
      const total = Number(body.totalPaket ?? rule?.totalPaket);
      const target = Number(body.targetSesi ?? rule?.targetSesi);

      if (!Number.isFinite(total) || total <= 0) {
        return NextResponse.json(
          { error: "totalPaket harus angka lebih dari 0" },
          { status: 400 }
        );
      }
      if (!Number.isFinite(target) || target <= 0) {
        return NextResponse.json(
          { error: "targetSesi harus angka lebih dari 0" },
          { status: 400 }
        );
      }

      // ratePerSesi diisi hasil bagi rata sebagai perkiraan. Angka yang
      // dipakai buat duit beneran selalu dihitung ulang dari totalPaket
      // (lihat src/lib/fee.ts) - kolom ini cuma biar query lama gak pecah.
      const perkiraan = Math.round(total / target);
      const nilai = {
        ratePerSesi: perkiraan,
        skema: "paket",
        totalPaket: total,
        targetSesi: target,
      };

      if (rule) await db.update(feeRule).set(nilai).where(eq(feeRule.kelasId, id));
      else await db.insert(feeRule).values({ kelasId: id, ...nilai });
    } else {
      // Skema flat. Rate dikosongin = hapus aturan fee kelas ini.
      if (body.ratePerSesi !== undefined && kosong(body.ratePerSesi)) {
        if (rule) await db.delete(feeRule).where(eq(feeRule.kelasId, id));
      } else {
        const rate = Number(body.ratePerSesi ?? rule?.ratePerSesi);
        if (!Number.isFinite(rate) || rate < 0) {
          return NextResponse.json(
            { error: "ratePerSesi harus angka >= 0" },
            { status: 400 }
          );
        }
        // Pindah dari paket ke flat: kolom paket dibersihin biar gak ada
        // sisa data yang bikin bingung pas dibaca lagi.
        const nilai = {
          ratePerSesi: rate,
          skema: "flat",
          totalPaket: null,
          targetSesi: null,
        };
        if (rule) await db.update(feeRule).set(nilai).where(eq(feeRule.kelasId, id));
        else await db.insert(feeRule).values({ kelasId: id, ...nilai });
      }
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
