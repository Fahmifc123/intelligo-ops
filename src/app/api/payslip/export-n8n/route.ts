import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { payslip, payslipItem, sesi, kelas, trainer } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import { BULAN_LABEL } from "@/lib/ui";

// GET /api/payslip/export-n8n?ids=id1,id2,...
// Balikin data satu ATAU BEBERAPA payslip dijadiin SATU baris siap tempel
// ke Google Sheet trigger n8n - kolomnya persis: periode, jadwal_pembayaran,
// nama, email, bank, nomor_rekening, nama_pemilik_rekening, items_json.
// Semua id yang dikirim wajib punya trainerId yang SAMA (trainer/karyawan-nya
// satu orang) - kalau beda, ditolak. Dipakai buat export satu payslip (ids
// cuma 1, alur biasa) maupun gabungan beberapa payslip sekaligus (mis. dua
// payslip beda periode buat trainer yang sama, digabung jadi satu transfer).
//
// items_json (tipe "trainer"): 1 elemen per KELAS (bukan per sesi) -
// digabung lintas SEMUA payslip yang dipilih. program = nama kelas,
// jumlah_sesi & fee_per_sesi dihitung dari sesi yg beneran ada di
// payslip-payslip ini. fee_per_sesi RATA-RATA (totalFee kelas dibagi
// jumlah sesi) kalau rate-nya gak seragam.
//
// items_json (tipe "karyawan"): 1 elemen per PAYSLIP (bukan digabung) -
// fee bulanan tetap ditampilin per periode biar rekapnya jelas per bulan.
export async function GET(req: NextRequest) {
  const idsParam = req.nextUrl.searchParams.get("ids");
  const ids = idsParam ? idsParam.split(",").filter(Boolean) : [];
  if (ids.length === 0) {
    return NextResponse.json({ error: "ids wajib diisi" }, { status: 400 });
  }

  const rows = await db
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
    .where(inArray(payslip.id, ids));

  if (rows.length !== ids.length) {
    return NextResponse.json({ error: "Ada payslip yang gak ditemukan" }, { status: 404 });
  }

  const trainerIds = new Set(rows.map((r) => r.trainerId));
  if (trainerIds.size > 1) {
    return NextResponse.json(
      { error: "Semua payslip yang digabung harus punya trainer/karyawan yang sama" },
      { status: 400 }
    );
  }

  const draftRows = rows.filter((r) => r.status === "draft");
  if (draftRows.length > 0) {
    return NextResponse.json(
      {
        error: `${draftRows.length} payslip yang dipilih masih draft. Finalisasi dulu (tandai "Belum Dibayar") sebelum export.`,
      },
      { status: 409 }
    );
  }

  const p0 = rows[0];
  const periodeGabungan = joinPeriode(rows.map((r) => r.periode));

  // Karyawan non-trainer gak wajib punya email (kolomnya sama kayak
  // trainer, cuma jarang keisi buat karyawan) - kolom "nama" tetap wajib
  // di sheet n8n, sisanya sama.
  if (p0.tipe === "karyawan") {
    const kurang: string[] = [];
    if (!p0.bankName) kurang.push("nama bank");
    if (!p0.bankAccountNumber) kurang.push("nomor rekening");
    if (!p0.bankAccountName) kurang.push("nama pemilik rekening");
    const tanpaJadwal = rows.filter((r) => !r.jadwalPembayaran);
    if (tanpaJadwal.length > 0) kurang.push("jadwal pembayaran");
    if (kurang.length > 0) {
      return NextResponse.json(
        {
          error: `Data belum lengkap buat export: ${kurang.join(", ")}. Lengkapi dulu di halaman Trainer${
            tanpaJadwal.length ? " atau isi jadwal pembayaran di payslip ini" : ""
          }.`,
        },
        { status: 400 }
      );
    }

    const itemsJson = rows.map((r) => ({
      program: r.posisi,
      detail: periodeLabel(r.periode),
      jumlah_sesi: 1,
      fee_per_sesi: Math.round(r.nominal ?? 0),
    }));

    return NextResponse.json({
      periode: periodeGabungan,
      jadwal_pembayaran: formatTanggalIndo(latestJadwal(rows)),
      nama: p0.trainerNama,
      email: p0.trainerEmail ?? "",
      bank: p0.bankName,
      nomor_rekening: p0.bankAccountNumber,
      nama_pemilik_rekening: p0.bankAccountName,
      items_json: JSON.stringify(itemsJson),
    });
  }

  // Field yang wajib ada di sheet n8n tapi belum tentu keisi di sistem -
  // dilaporin eksplisit biar admin tau apa yang harus dibenerin dulu,
  // bukan export jalan dengan kolom kosong yang bikin PDF-nya cacat.
  const kurang: string[] = [];
  if (!p0.trainerEmail) kurang.push("email trainer");
  if (!p0.bankName) kurang.push("nama bank");
  if (!p0.bankAccountNumber) kurang.push("nomor rekening");
  if (!p0.bankAccountName) kurang.push("nama pemilik rekening");
  const tanpaJadwal = rows.filter((r) => !r.jadwalPembayaran);
  if (tanpaJadwal.length > 0) kurang.push("jadwal pembayaran");
  if (kurang.length > 0) {
    return NextResponse.json(
      {
        error: `Data belum lengkap buat export: ${kurang.join(", ")}. Lengkapi dulu di halaman Trainer${
          tanpaJadwal.length ? " atau isi jadwal pembayaran di payslip ini" : ""
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
    .where(inArray(payslipItem.payslipId, ids));

  if (items.length === 0) {
    return NextResponse.json({ error: "Payslip yang dipilih gak punya sesi." }, { status: 400 });
  }

  // Kelompokin per kelas -> 1 baris items_json per kelas, digabung lintas
  // semua payslip yang dipilih.
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
    // "detail" digenerate otomatis dari periode - "4 sesi, Agustus 2026",
    // atau "4 sesi, Agustus 2026, September 2026" kalau digabung lintas
    // periode. Gak ada input manual (disepakati: full otomatis).
    detail: `${row.jumlahSesi} sesi, ${periodeGabungan}`,
    jumlah_sesi: row.jumlahSesi,
    fee_per_sesi: Math.round(row.totalFee / row.jumlahSesi),
  }));

  return NextResponse.json({
    periode: periodeGabungan,
    jadwal_pembayaran: formatTanggalIndo(latestJadwal(rows)),
    nama: p0.trainerNama,
    email: p0.trainerEmail,
    bank: p0.bankName,
    nomor_rekening: p0.bankAccountNumber,
    nama_pemilik_rekening: p0.bankAccountName,
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

/** Gabungin label periode unik, diurutin - "Agustus 2026" atau "Agustus 2026, September 2026". */
function joinPeriode(periodes: string[]): string {
  const unik = Array.from(new Set(periodes)).sort();
  return unik.map(periodeLabel).join(", ");
}

/**
 * Jadwal pembayaran gabungan - semua row di sini udah dipastikan punya
 * jadwalPembayaran (dicek lewat `tanpaJadwal` di atas). Kalau beda-beda
 * antar payslip yang digabung, pakai yang paling akhir.
 */
function latestJadwal(rows: { jadwalPembayaran: string | null }[]): string {
  return rows.map((r) => r.jadwalPembayaran as string).sort().slice(-1)[0];
}

/** "2026-09-08" -> "08 September 2026" */
function formatTanggalIndo(tanggalIso: string): string {
  const [tahun, bulan, hari] = tanggalIso.split("-");
  return `${hari} ${BULAN_LABEL[bulan] ?? bulan} ${tahun}`;
}
