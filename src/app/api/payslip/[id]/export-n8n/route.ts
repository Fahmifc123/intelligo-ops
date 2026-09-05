import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { payslip, payslipItem, sesi, kelas, trainer } from "@/db/schema";
import { eq } from "drizzle-orm";
import { BULAN_LABEL } from "@/lib/ui";

// GET /api/payslip/[id]/export-n8n
// Balikin data payslip dalam bentuk yang siap ditempel ke Google Sheet
// trigger n8n - kolomnya persis: periode, jadwal_pembayaran, nama, email,
// bank, nomor_rekening, nama_pemilik_rekening, items_json.
//
// items_json: 1 elemen per KELAS (bukan per sesi) - program = nama kelas,
// jumlah_sesi & fee_per_sesi dihitung dari sesi yg beneran ada di payslip
// ini. Kalau kelasnya rate-nya beda per sesi (mis. abis diedit di tengah
// payslip), fee_per_sesi yang ditampilin itu RATA-RATA (totalFee kelas
// dibagi jumlah sesi kelas) - subtotal tetap akurat, cuma "fee_per_sesi"
// jadi angka representatif kalau rate-nya gak seragam.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const [p] = await db
    .select({
      id: payslip.id,
      tipe: payslip.tipe,
      trainerId: payslip.trainerId,
      nominal: payslip.nominal,
      periode: payslip.periode,
      status: payslip.status,
      jadwalPembayaran: payslip.jadwalPembayaran,
      trainerNama: trainer.nama,
      posisi: trainer.posisi,
      trainerEmail: trainer.email,
      bankName: trainer.bankName,
      bankAccountNumber: trainer.bankAccountNumber,
      bankAccountName: trainer.bankAccountName,
    })
    .from(payslip)
    .leftJoin(trainer, eq(payslip.trainerId, trainer.id))
    .where(eq(payslip.id, id));

  if (!p) return NextResponse.json({ error: "not found" }, { status: 404 });

  if (p.status === "draft") {
    return NextResponse.json(
      { error: "Payslip masih draft. Finalisasi dulu (tandai \"Belum Dibayar\") sebelum export." },
      { status: 409 }
    );
  }

  // Karyawan non-trainer gak wajib punya email (kolomnya sama kayak
  // trainer, cuma jarang keisi buat karyawan) - kolom "nama" tetap wajib
  // di sheet n8n, sisanya sama.
  if (p.tipe === "karyawan") {
    const kurangKaryawan: string[] = [];
    if (!p.bankName) kurangKaryawan.push("nama bank");
    if (!p.bankAccountNumber) kurangKaryawan.push("nomor rekening");
    if (!p.bankAccountName) kurangKaryawan.push("nama pemilik rekening");
    if (!p.jadwalPembayaran) kurangKaryawan.push("jadwal pembayaran");
    if (kurangKaryawan.length > 0) {
      return NextResponse.json(
        {
          error: `Data belum lengkap buat export: ${kurangKaryawan.join(", ")}. Lengkapi dulu di halaman Karyawan${
            !p.jadwalPembayaran ? " atau isi jadwal pembayaran di payslip ini" : ""
          }.`,
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      periode: periodeLabel(p.periode),
      jadwal_pembayaran: formatTanggalIndo(p.jadwalPembayaran as string),
      nama: p.trainerNama,
      email: p.trainerEmail ?? "",
      bank: p.bankName,
      nomor_rekening: p.bankAccountNumber,
      nama_pemilik_rekening: p.bankAccountName,
      items_json: JSON.stringify([
        {
          program: p.posisi,
          detail: periodeLabel(p.periode),
          jumlah_sesi: 1,
          fee_per_sesi: Math.round(p.nominal ?? 0),
        },
      ]),
    });
  }

  // Field yang wajib ada di sheet n8n tapi belum tentu keisi di sistem -
  // dilaporin eksplisit biar admin tau apa yang harus dibenerin dulu,
  // bukan export jalan dengan kolom kosong yang bikin PDF-nya cacat.
  const kurang: string[] = [];
  if (!p.trainerEmail) kurang.push("email trainer");
  if (!p.bankName) kurang.push("nama bank");
  if (!p.bankAccountNumber) kurang.push("nomor rekening");
  if (!p.bankAccountName) kurang.push("nama pemilik rekening");
  if (!p.jadwalPembayaran) kurang.push("jadwal pembayaran");
  if (kurang.length > 0) {
    return NextResponse.json(
      {
        error: `Data belum lengkap buat export: ${kurang.join(", ")}. Lengkapi dulu di halaman Trainer${
          !p.jadwalPembayaran ? " atau isi jadwal pembayaran di payslip ini" : ""
        }.`,
      },
      { status: 400 }
    );
  }

  const items = await db
    .select({
      ratePerSesi: payslipItem.ratePerSesi,
      kelasId: kelas.id,
      kelasNama: kelas.nama,
    })
    .from(payslipItem)
    .innerJoin(sesi, eq(payslipItem.sesiId, sesi.id))
    .innerJoin(kelas, eq(sesi.kelasId, kelas.id))
    .where(eq(payslipItem.payslipId, id));

  if (items.length === 0) {
    return NextResponse.json({ error: "Payslip ini gak punya sesi." }, { status: 400 });
  }

  // Kelompokin per kelas -> 1 baris items_json per kelas.
  const perKelas = new Map<string, { program: string; jumlahSesi: number; totalFee: number }>();
  for (const it of items) {
    const row = perKelas.get(it.kelasId) ?? {
      program: it.kelasNama,
      jumlahSesi: 0,
      totalFee: 0,
    };
    row.jumlahSesi += 1;
    row.totalFee += it.ratePerSesi;
    perKelas.set(it.kelasId, row);
  }

  const itemsJson = Array.from(perKelas.values()).map((row) => ({
    program: row.program,
    // "detail" digenerate otomatis dari periode - "4 sesi, Agustus 2026".
    // Gak ada input manual (disepakati: 1 baris per kelas, full otomatis).
    detail: `${row.jumlahSesi} sesi, ${periodeLabel(p.periode)}`,
    jumlah_sesi: row.jumlahSesi,
    fee_per_sesi: Math.round(row.totalFee / row.jumlahSesi),
  }));

  return NextResponse.json({
    periode: periodeLabel(p.periode),
    jadwal_pembayaran: formatTanggalIndo(p.jadwalPembayaran as string),
    nama: p.trainerNama,
    email: p.trainerEmail,
    bank: p.bankName,
    nomor_rekening: p.bankAccountNumber,
    nama_pemilik_rekening: p.bankAccountName,
    // Sengaja gak di-pretty-print (tanpa `null, 2`) - hasilnya satu baris
    // tanpa newline. items_json ini ditempel ke satu SEL Google Sheet;
    // newline di dalam JSON pretty-print bikin Sheets mecah isinya ke
    // baris-baris terpisah pas di-paste, bukan tetap satu sel. n8n cuma
    // butuh JSON.parse() ini, jadi gak perlu cantik buat manusia.
    items_json: JSON.stringify(itemsJson),
  });
}

/** "2026-08" -> "Agustus 2026" */
function periodeLabel(periode: string): string {
  const [tahun, bulan] = periode.split("-");
  return `${BULAN_LABEL[bulan] ?? bulan} ${tahun}`;
}

/** "2026-09-08" -> "08 September 2026" */
function formatTanggalIndo(tanggalIso: string): string {
  const [tahun, bulan, hari] = tanggalIso.split("-");
  return `${hari} ${BULAN_LABEL[bulan] ?? bulan} ${tahun}`;
}
