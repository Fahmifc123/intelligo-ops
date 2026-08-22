import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { kelas, trainer, sesi, feeRule } from "@/db/schema";
import { eq } from "drizzle-orm";
import { extractSheetId } from "@/lib/navigatorSync";
import { hitungRatePerSesi, trainerEfektif } from "@/lib/feeQuery";

// GET /api/kelas
// Daftar kelas + rincian per trainer yang ngajar di tiap kelas (jumlah
// sesi, rate, total fee) buat panel analytics di halaman Kelas.
export async function GET() {
  const rows = await db
    .select({
      id: kelas.id,
      nama: kelas.nama,
      tipe: kelas.tipe,
      tanggalMulai: kelas.tanggalMulai,
      trainerId: kelas.trainerId,
      trainerNama: trainer.nama,
      navigatorSheetId: kelas.navigatorSheetId,
      navigatorLastSyncedAt: kelas.navigatorLastSyncedAt,
    })
    .from(kelas)
    .leftJoin(trainer, eq(kelas.trainerId, trainer.id));

  // Rate per sesi udah mempertimbangkan skema paket & pembagian per
  // trainer - dihitung sekali di sini, dipakai buat semua kelas.
  const [rateMap, semuaSesi, rules, semuaTrainer] = await Promise.all([
    hitungRatePerSesi(),
    db
      .select({
        id: sesi.id,
        kelasId: sesi.kelasId,
        status: sesi.status,
        trainerId: sesi.trainerId,
      })
      .from(sesi),
    db.select().from(feeRule),
    db.select({ id: trainer.id, nama: trainer.nama }).from(trainer),
  ]);

  const namaTrainer = Object.fromEntries(semuaTrainer.map((t) => [t.id, t.nama]));
  const kelasById = Object.fromEntries(rows.map((k) => [k.id, k]));

  type Ringkas = {
    trainerId: string;
    trainerNama: string;
    utama: boolean;
    skema: string;
    ratePerSesi: number | null;
    totalPaket: number | null;
    jumlahSesi: number;
    sesiSelesai: number;
    totalFee: number;
  };

  const perKelas: Record<string, Record<string, Ringkas>> = {};

  for (const s of semuaSesi) {
    const k = kelasById[s.kelasId];
    if (!k) continue;
    const tid = trainerEfektif(s.trainerId, k.trainerId);
    if (!tid) continue;

    const grup = (perKelas[s.kelasId] ??= {});
    if (!grup[tid]) {
      const rule =
        rules.find((r) => r.kelasId === s.kelasId && r.trainerId === tid) ??
        rules.find((r) => r.kelasId === s.kelasId && r.trainerId === null) ??
        null;
      grup[tid] = {
        trainerId: tid,
        trainerNama: namaTrainer[tid] ?? "-",
        utama: tid === k.trainerId,
        skema: rule?.skema ?? "flat",
        ratePerSesi: rule?.ratePerSesi ?? null,
        totalPaket: rule?.totalPaket ?? null,
        jumlahSesi: 0,
        sesiSelesai: 0,
        totalFee: 0,
      };
    }

    const acc = grup[tid];
    acc.jumlahSesi += 1;
    // Fee cuma dihitung dari sesi yang udah "selesai" - konsisten sama
    // /api/fee, biar angka di dua halaman gak beda.
    if (s.status === "selesai") {
      acc.sesiSelesai += 1;
      acc.totalFee += rateMap[s.id] ?? 0;
    }
  }

  const hasil = rows.map((k) => {
    const grup = perKelas[k.id] ?? {};
    // Trainer utama selalu muncul walau belum punya sesi, biar kelas baru
    // tetap kelihatan siapa penanggung jawabnya.
    if (!grup[k.trainerId]) {
      const rule =
        rules.find((r) => r.kelasId === k.id && r.trainerId === k.trainerId) ??
        rules.find((r) => r.kelasId === k.id && r.trainerId === null) ??
        null;
      grup[k.trainerId] = {
        trainerId: k.trainerId,
        trainerNama: k.trainerNama ?? "-",
        utama: true,
        skema: rule?.skema ?? "flat",
        ratePerSesi: rule?.ratePerSesi ?? null,
        totalPaket: rule?.totalPaket ?? null,
        jumlahSesi: 0,
        sesiSelesai: 0,
        totalFee: 0,
      };
    }

    const trainers = Object.values(grup).sort(
      (a, b) => Number(b.utama) - Number(a.utama) || b.jumlahSesi - a.jumlahSesi
    );

    return {
      ...k,
      trainers,
      totalFeeKelas: trainers.reduce((a, t) => a + t.totalFee, 0),
    };
  });

  return NextResponse.json(hasil);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  if (!body.nama || !body.tipe || !body.trainerId) {
    return NextResponse.json(
      { error: "nama, tipe, trainerId wajib diisi" },
      { status: 400 }
    );
  }
  const [row] = await db
    .insert(kelas)
    .values({
      nama: body.nama,
      tipe: body.tipe,
      trainerId: body.trainerId,
      tanggalMulai: body.tanggalMulai ?? null,
      navigatorSheetId: body.navigatorSheetId ? extractSheetId(body.navigatorSheetId) : null,
      // Mapping kolom manual disimpan sebagai JSON string; null = pakai auto-detect.
      navigatorColumnMap: body.navigatorColumnMap
        ? JSON.stringify(body.navigatorColumnMap)
        : null,
    })
    .returning();
  return NextResponse.json(row, { status: 201 });
}
