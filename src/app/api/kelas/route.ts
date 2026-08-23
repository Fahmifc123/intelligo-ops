import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { kelas, trainer, sesi, feeRule, payslip, payslipItem } from "@/db/schema";
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
      polaPembayaran: kelas.polaPembayaran,
      navigatorSheetId: kelas.navigatorSheetId,
      navigatorTabName: kelas.navigatorTabName,
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
        tanpaFee: sesi.tanpaFee,
        // Status payslip yang nampung sesi ini (null = belum masuk payslip
        // manapun). Dipakai buat nentuin fee kelas udah lunas atau belum.
        payslipStatus: payslip.status,
      })
      .from(sesi)
      .leftJoin(payslipItem, eq(payslipItem.sesiId, sesi.id))
      .leftJoin(payslip, eq(payslip.id, payslipItem.payslipId)),
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
    feeLunas: number;
  };

  const perKelas: Record<string, Record<string, Ringkas>> = {};
  // Jumlah sesi "Video Course" dkk per kelas - dikeluarkan total dari
  // analytics per-trainer (gak dihitung sebagai sesi siapapun), tapi
  // tetap dicatat di sini biar keliatan di UI, bukan hilang gitu aja.
  const sesiTanpaFeePerKelas: Record<string, number> = {};

  for (const s of semuaSesi) {
    const k = kelasById[s.kelasId];
    if (!k) continue;

    if (s.tanpaFee) {
      sesiTanpaFeePerKelas[s.kelasId] = (sesiTanpaFeePerKelas[s.kelasId] ?? 0) + 1;
      continue;
    }

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
        feeLunas: 0,
      };
    }

    const acc = grup[tid];
    acc.jumlahSesi += 1;
    // Fee cuma dihitung dari sesi yang udah "selesai" - konsisten sama
    // /api/fee, biar angka di dua halaman gak beda.
    if (s.status === "selesai") {
      acc.sesiSelesai += 1;
      const fee = rateMap[s.id] ?? 0;
      acc.totalFee += fee;
      if (s.payslipStatus === "lunas") acc.feeLunas += fee;
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
        feeLunas: 0,
      };
    }

    const trainers = Object.values(grup).sort(
      (a, b) => Number(b.utama) - Number(a.utama) || b.jumlahSesi - a.jumlahSesi
    );

    const totalFeeKelas = trainers.reduce((a, t) => a + t.totalFee, 0);
    const feeLunasKelas = trainers.reduce((a, t) => a + t.feeLunas, 0);

    const totalSesi = trainers.reduce((a, t) => a + t.jumlahSesi, 0);
    const sesiSelesai = trainers.reduce((a, t) => a + t.sesiSelesai, 0);

    // Status kelas:
    //   persiapan - belum ada sesi sama sekali
    //   aktif     - masih ada sesi yang belum diajar
    //   selesai   - semua sesi udah diajar, tapi fee belum lunas semua
    //   lunas     - semua sesi diajar DAN semua fee-nya udah dibayar
    //
    // Kelas tanpa aturan fee (totalFeeKelas 0) yang sesinya udah kelar
    // dianggap lunas - gak ada yang perlu dibayar, jadi nahan dia di
    // "selesai" selamanya cuma bikin bingung.
    let status: "persiapan" | "aktif" | "selesai" | "lunas";
    if (totalSesi === 0) status = "persiapan";
    else if (sesiSelesai < totalSesi) status = "aktif";
    else if (totalFeeKelas > 0 && feeLunasKelas < totalFeeKelas) status = "selesai";
    else status = "lunas";

    return {
      ...k,
      trainers,
      totalFeeKelas,
      feeLunasKelas,
      status,
      // Sesi "Video Course" dkk - gak masuk hitungan sesi/fee trainer
      // manapun di atas, ditampilin terpisah biar keliatan di UI.
      sesiTanpaFee: sesiTanpaFeePerKelas[k.id] ?? 0,
    };
  });

  return NextResponse.json(hasil);
}

const VALID_POLA_PEMBAYARAN = ["akhir", "bulanan"];

export async function POST(req: NextRequest) {
  const body = await req.json();
  if (!body.nama || !body.tipe || !body.trainerId) {
    return NextResponse.json(
      { error: "nama, tipe, trainerId wajib diisi" },
      { status: 400 }
    );
  }
  if (body.polaPembayaran !== undefined && !VALID_POLA_PEMBAYARAN.includes(body.polaPembayaran)) {
    return NextResponse.json(
      { error: `polaPembayaran harus salah satu dari: ${VALID_POLA_PEMBAYARAN.join(", ")}` },
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
      // Murni catatan buat admin, bukan dipakai buat ngitung fee. Default
      // "akhir" (dibayar sekali pas kelas kelar) kalau gak dipilih.
      polaPembayaran: body.polaPembayaran ?? "akhir",
      navigatorSheetId: body.navigatorSheetId ? extractSheetId(body.navigatorSheetId) : null,
      // Nama tab yang dibaca sync - null = coba "Sheet1". Wajib diisi
      // manual buat sheet dengan banyak tab (lihat navigatorSync.ts).
      navigatorTabName: body.navigatorTabName?.trim() || null,
      // Mapping kolom manual disimpan sebagai JSON string; null = pakai auto-detect.
      navigatorColumnMap: body.navigatorColumnMap
        ? JSON.stringify(body.navigatorColumnMap)
        : null,
    })
    .returning();
  return NextResponse.json(row, { status: 201 });
}
