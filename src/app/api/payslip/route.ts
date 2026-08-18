import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { payslip, payslipItem, sesi, kelas, trainer, feeRule } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";

// GET /api/payslip?trainerId=...&periode=2026-08 (keduanya opsional filter)
// Balikin payslip beserta ringkasan jumlah sesi & total fee-nya.
export async function GET(req: NextRequest) {
  const trainerId = req.nextUrl.searchParams.get("trainerId");
  const periode = req.nextUrl.searchParams.get("periode");

  let rows = await db
    .select({
      id: payslip.id,
      trainerId: payslip.trainerId,
      trainerNama: trainer.nama,
      periode: payslip.periode,
      status: payslip.status,
      catatan: payslip.catatan,
      createdAt: payslip.createdAt,
      finalizedAt: payslip.finalizedAt,
    })
    .from(payslip)
    .leftJoin(trainer, eq(payslip.trainerId, trainer.id));

  if (trainerId) rows = rows.filter((r) => r.trainerId === trainerId);
  if (periode) rows = rows.filter((r) => r.periode === periode);

  const items = await db
    .select({
      payslipId: payslipItem.payslipId,
      sesiId: payslipItem.sesiId,
      ratePerSesi: payslipItem.ratePerSesi,
      pertemuanKe: sesi.pertemuanKe,
      kelasId: kelas.id,
      kelasNama: kelas.nama,
    })
    .from(payslipItem)
    .leftJoin(sesi, eq(payslipItem.sesiId, sesi.id))
    .leftJoin(kelas, eq(sesi.kelasId, kelas.id));

  const result = rows.map((r) => {
    const rowItems = items.filter((i) => i.payslipId === r.id);
    return {
      ...r,
      jumlahSesi: rowItems.length,
      totalFee: rowItems.reduce((sum, i) => sum + i.ratePerSesi, 0),
      sesi: rowItems.map((i) => ({
        sesiId: i.sesiId,
        pertemuanKe: i.pertemuanKe,
        kelasId: i.kelasId,
        kelasNama: i.kelasNama,
        ratePerSesi: i.ratePerSesi,
      })),
    };
  });

  return NextResponse.json(result);
}

// POST /api/payslip { trainerId, periode: "YYYY-MM", sesiIds: string[] }
// Bikin payslip draft dari sesi-sesi yang dicentang di wizard halaman Payslip
// (alur: pilih trainer -> pilih kelas -> centang sesi -> pilih periode).
// Rate per sesi di-snapshot dari feeRule kelas masing-masing sesi saat ini -
// kalau rate kelas berubah belakangan, payslip yang udah dibuat nggak ikut berubah.
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { trainerId, periode, sesiIds } = body;

  if (!trainerId || !periode || !Array.isArray(sesiIds) || sesiIds.length === 0) {
    return NextResponse.json(
      { error: "trainerId, periode, dan sesiIds (minimal 1) wajib diisi" },
      { status: 400 }
    );
  }
  if (!/^\d{4}-\d{2}$/.test(periode)) {
    return NextResponse.json(
      { error: "periode harus format YYYY-MM, mis. 2026-08" },
      { status: 400 }
    );
  }

  // Pastiin semua sesi yang dicentang itu: (a) beneran ada, (b) status
  // "selesai", (c) belum nempel di payslip lain (dijaga juga oleh unique
  // index di DB, tapi dicek di sini dulu biar pesan errornya jelas).
  const sesiRows = await db
    .select({
      id: sesi.id,
      status: sesi.status,
      kelasId: sesi.kelasId,
      ratePerSesi: feeRule.ratePerSesi,
    })
    .from(sesi)
    .leftJoin(feeRule, eq(feeRule.kelasId, sesi.kelasId))
    .where(inArray(sesi.id, sesiIds));

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

  const existingItems = await db
    .select({ sesiId: payslipItem.sesiId })
    .from(payslipItem)
    .where(inArray(payslipItem.sesiId, sesiIds));
  if (existingItems.length > 0) {
    return NextResponse.json(
      {
        error: `${existingItems.length} sesi yang dipilih udah masuk payslip lain. Batalin payslip lama dulu kalau mau pindahin.`,
      },
      { status: 409 }
    );
  }

  const [row] = await db
    .insert(payslip)
    .values({ trainerId, periode, catatan: body.catatan ?? null })
    .returning();

  await db.insert(payslipItem).values(
    sesiRows.map((s) => ({
      payslipId: row.id,
      sesiId: s.id,
      ratePerSesi: s.ratePerSesi ?? 0,
    }))
  );

  return NextResponse.json(row, { status: 201 });
}
