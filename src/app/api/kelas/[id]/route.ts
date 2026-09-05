import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { kelas, feeRule, sesi, trainer } from "@/db/schema";
import { eq } from "drizzle-orm";
import { extractSheetId } from "@/lib/navigatorSync";

const VALID_TIPE = ["bootcamp", "private", "mbc", "corporate"];
const VALID_POLA_PEMBAYARAN = ["akhir", "bulanan"];

type FeeInput = {
  trainerId?: string | null;
  skema?: string;
  ratePerSesi?: number | string | null;
  totalPaket?: number | string | null;
  targetSesi?: number | string | null;
};

/**
 * Simpan aturan fee satu trainer di satu kelas. Balikin pesan error kalau
 * inputnya gak valid, atau null kalau sukses.
 */
async function simpanFee(kelasId: string, f: FeeInput): Promise<string | null> {
  const tid = f.trainerId ?? null;

  // Cari baris yang persis punya trainer ini. Sengaja gak jatuh ke baris
  // trainerId null - kalau nulis buat Budi, jangan nimpa aturan se-kelas.
  const semua = await db.select().from(feeRule).where(eq(feeRule.kelasId, kelasId));
  const rule = semua.find((r) => r.trainerId === tid) ?? null;

  const skema = f.skema ?? rule?.skema ?? "flat";
  if (skema !== "flat" && skema !== "paket") {
    return "skema harus 'flat' atau 'paket'";
  }

  const kosong = (v: unknown) => v === null || v === "" || v === undefined;

  if (skema === "paket") {
    const total = Number(f.totalPaket ?? rule?.totalPaket);
    const target = Number(f.targetSesi ?? rule?.targetSesi);
    if (!Number.isFinite(total) || total <= 0) return "totalPaket harus angka lebih dari 0";
    if (!Number.isFinite(target) || target <= 0) return "targetSesi harus angka lebih dari 0";

    // ratePerSesi diisi hasil bagi rata sebagai perkiraan. Angka yang
    // dipakai buat duit beneran selalu dihitung ulang dari totalPaket
    // (lihat src/lib/fee.ts) - kolom ini cuma biar query lama gak pecah.
    const nilai = {
      ratePerSesi: Math.round(total / target),
      skema: "paket",
      totalPaket: total,
      targetSesi: target,
    };
    if (rule) await db.update(feeRule).set(nilai).where(eq(feeRule.id, rule.id));
    else await db.insert(feeRule).values({ kelasId, trainerId: tid, ...nilai });
    return null;
  }

  // Skema flat. Rate dikosongin = hapus aturan fee trainer ini.
  if (f.ratePerSesi !== undefined && kosong(f.ratePerSesi)) {
    if (rule) await db.delete(feeRule).where(eq(feeRule.id, rule.id));
    return null;
  }

  const rate = Number(f.ratePerSesi ?? rule?.ratePerSesi);
  if (!Number.isFinite(rate) || rate < 0) return "ratePerSesi harus angka >= 0";

  // Pindah dari paket ke flat: kolom paket dibersihin biar gak ada sisa
  // data yang bikin bingung pas dibaca lagi.
  const nilai = { ratePerSesi: rate, skema: "flat", totalPaket: null, targetSesi: null };
  if (rule) await db.update(feeRule).set(nilai).where(eq(feeRule.id, rule.id));
  else await db.insert(feeRule).values({ kelasId, trainerId: tid, ...nilai });
  return null;
}

// GET /api/kelas/[id]
// Detail kelas + daftar trainer yang ngajar di situ, lengkap sama aturan
// fee masing-masing. Dipakai buat ngisi form edit dan panel analytics.
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
      polaPembayaran: kelas.polaPembayaran,
      navigatorSheetId: kelas.navigatorSheetId,
      navigatorTabName: kelas.navigatorTabName,
      navigatorColumnMap: kelas.navigatorColumnMap,
      navigatorLastSyncedAt: kelas.navigatorLastSyncedAt,
    })
    .from(kelas)
    .leftJoin(trainer, eq(kelas.trainerId, trainer.id))
    .where(eq(kelas.id, id));

  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });

  const rules = await db.select().from(feeRule).where(eq(feeRule.kelasId, id));
  const ruleFor = (tid: string | null) =>
    rules.find((r) => r.trainerId === tid) ??
    // Fallback ke aturan lama se-kelas (trainerId null) buat data sebelum
    // fitur multi-trainer.
    rules.find((r) => r.trainerId === null) ??
    null;

  // Trainer yang terlibat = trainer utama + siapapun yang kepasang di sesi.
  const trainerSesi = await db
    .selectDistinct({ trainerId: sesi.trainerId })
    .from(sesi)
    .where(eq(sesi.kelasId, id));

  const idsTerlibat = Array.from(
    new Set([
      row.trainerId,
      ...trainerSesi.map((t) => t.trainerId).filter((t): t is string => !!t),
      ...rules.map((r) => r.trainerId).filter((t): t is string => !!t),
    ])
  );

  const semuaTrainer = await db.select().from(trainer);
  const namaTrainer = Object.fromEntries(semuaTrainer.map((t) => [t.id, t.nama]));

  const trainers = idsTerlibat.map((tid) => {
    const rule = ruleFor(tid);
    return {
      trainerId: tid,
      trainerNama: namaTrainer[tid] ?? "-",
      utama: tid === row.trainerId,
      skema: rule?.skema ?? "flat",
      ratePerSesi: rule?.ratePerSesi ?? null,
      totalPaket: rule?.totalPaket ?? null,
      targetSesi: rule?.targetSesi ?? null,
    };
  });

  // Field fee di level atas tetap dikirim buat kompatibilitas - isinya
  // aturan trainer utama.
  const utama = trainers.find((t) => t.utama);
  return NextResponse.json({
    ...row,
    trainers,
    skema: utama?.skema ?? "flat",
    ratePerSesi: utama?.ratePerSesi ?? null,
    totalPaket: utama?.totalPaket ?? null,
    targetSesi: utama?.targetSesi ?? null,
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
  if (
    body.polaPembayaran !== undefined &&
    !VALID_POLA_PEMBAYARAN.includes(body.polaPembayaran)
  ) {
    return NextResponse.json(
      { error: `polaPembayaran harus salah satu dari: ${VALID_POLA_PEMBAYARAN.join(", ")}` },
      { status: 400 }
    );
  }
  // Trainer dicek beneran ada - kalau nggak, insert-nya bakal kena
  // FOREIGN KEY constraint dengan pesan yang gak kebaca sama user.
  if (body.trainerId !== undefined) {
    const [t] = await db.select().from(trainer).where(eq(trainer.id, body.trainerId));
    if (!t) return NextResponse.json({ error: "trainer gak ditemukan" }, { status: 400 });
  }

  const patchKelas = {
    ...(body.nama !== undefined && { nama: String(body.nama).trim() }),
    ...(body.tipe !== undefined && { tipe: body.tipe }),
    ...(body.trainerId !== undefined && { trainerId: body.trainerId }),
    ...(body.tanggalMulai !== undefined && { tanggalMulai: body.tanggalMulai || null }),
    ...(body.polaPembayaran !== undefined && { polaPembayaran: body.polaPembayaran }),
    // String kosong = user ngosongin field-nya, artinya lepas sheet-nya.
    ...(body.navigatorSheetId !== undefined && {
      navigatorSheetId: body.navigatorSheetId
        ? extractSheetId(body.navigatorSheetId)
        : null,
    }),
    ...(body.navigatorTabName !== undefined && {
      navigatorTabName: body.navigatorTabName?.trim() || null,
    }),
    ...(body.navigatorColumnMap !== undefined && {
      navigatorColumnMap: body.navigatorColumnMap
        ? JSON.stringify(body.navigatorColumnMap)
        : null,
    }),
  };

  // Body yang cuma ngirim `trainers` gak nyentuh kolom kelas sama sekali -
  // drizzle nolak .set({}) dengan "No values to set", jadi update-nya
  // dilewatin dan kita pakai baris yang udah ada.
  const row = Object.keys(patchKelas).length
    ? (await db.update(kelas).set(patchKelas).where(eq(kelas.id, id)).returning())[0]
    : existing;

  // Fee disimpan di tabel terpisah, satu baris per (kelas, trainer).
  // Wajib UPDATE baris yang udah ada, bukan nambah baris baru: dua baris
  // buat pasangan yang sama bikin sesi kehitung dobel.
  // Payslip yang udah jadi gak ikut berubah - rate-nya udah di-snapshot
  // di payslip_item pas payslip dibuat.
  //
  // Body bisa dua bentuk:
  //   { trainers: [{ trainerId, skema, ratePerSesi | totalPaket+targetSesi }] }
  //   { skema, ratePerSesi, ... }  <- bentuk lama, berlaku buat trainer utama
  const daftarFee: FeeInput[] = Array.isArray(body.trainers)
    ? body.trainers
    : body.skema !== undefined ||
        body.ratePerSesi !== undefined ||
        body.totalPaket !== undefined ||
        body.targetSesi !== undefined
      ? [{ trainerId: row.trainerId, ...body }]
      : [];

  for (const f of daftarFee) {
    const err = await simpanFee(id, f);
    if (err) return NextResponse.json({ error: err }, { status: 400 });
  }

  // Kelas tanpa navigator sheet gak punya sumber otomatis buat sesi-nya.
  // Kalau trainer utama dikasih skema "paket" (udah tau total fee & target
  // sesinya dari awal) DAN kelas ini masih belum punya sesi sama sekali,
  // auto-generate sesinya sekali jalan - LANGSUNG ditandai "selesai" (bukan
  // "belum"), karena kelas manual kayak gini dipakai buat nyatet kelas yang
  // emang udah kelar diajar (gak ada tracking progress kayak kelas navigator
  // yang sesinya nyata sinkron dari sheet). Fee paket-nya kehitung penuh
  // begitu kelas ini dibuat, gak nunggu ditandai selesai satu-satu. Cuma
  // jalan sekali pas kelas masih kosong; kalau target diubah belakangan
  // atau kelas udah punya sesi (manual atau hasil sync navigator), gak
  // diotak-atik lagi biar gak dobel/ilangin histori.
  if (!row.navigatorSheetId) {
    const sesiSudahAda = await db.select({ id: sesi.id }).from(sesi).where(eq(sesi.kelasId, id));
    if (sesiSudahAda.length === 0) {
      const feeUtama = daftarFee.find((f) => (f.trainerId ?? null) === row.trainerId);
      const target = feeUtama?.skema === "paket" ? Number(feeUtama.targetSesi) : NaN;
      if (Number.isFinite(target) && target > 0) {
        await db.insert(sesi).values(
          Array.from({ length: target }, (_, i) => ({
            kelasId: id,
            pertemuanKe: i + 1,
            status: "selesai" as const,
          }))
        );
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
