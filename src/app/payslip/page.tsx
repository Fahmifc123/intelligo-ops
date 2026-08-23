"use client";
import { useEffect, useMemo, useState } from "react";
import { initials, avatarClass, formatRupiah, BULAN, BULAN_LABEL, currentYear } from "@/lib/ui";

type Trainer = { id: string; nama: string };
type Kelas = {
  id: string;
  nama: string;
  trainerId: string;
  // Semua trainer yang ngajar di kelas ini (bukan cuma trainer utama) -
  // dari /api/kelas. Satu kelas bisa diajar beberapa trainer sekaligus,
  // jadi wizard payslip harus nyari lewat sini, bukan cuma trainerId.
  trainers?: { trainerId: string }[];
};

type SesiDetail = {
  sesiId: string;
  kelasId: string;
  kelasNama: string | null;
  pertemuanKe: number;
  tanggal: string | null;
  materi: string | null;
  ratePerSesi: number;
  sudahDiPayslip: boolean;
  payslipId: string | null;
  payslipPeriode: string | null;
  payslipStatus: string | null;
};

type Payslip = {
  id: string;
  trainerId: string;
  trainerNama: string;
  periode: string;
  status: string;
  createdAt: string;
  finalizedAt: string | null;
  paidAt: string | null;
  // Tanggal estimasi transfer, "YYYY-MM-DD" - diisi manual, dipakai
  // sebagai kolom "jadwal_pembayaran" pas export ke format n8n.
  jadwalPembayaran: string | null;
  jumlahSesi: number;
  totalFee: number;
  sesi: {
    sesiId: string;
    pertemuanKe: number;
    kelasId: string | null;
    kelasNama: string | null;
    ratePerSesi: number;
  }[];
};

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  belum_dibayar: "Belum Dibayar",
  lunas: "Lunas",
};

const STATUS_STYLE: Record<string, string> = {
  draft: "bg-surface-container text-on-surface-variant",
  belum_dibayar: "bg-warning/10 text-warning",
  lunas: "bg-success/10 text-success",
};


export default function PayslipPage() {
  const [payslips, setPayslips] = useState<Payslip[]>([]);
  const [trainers, setTrainers] = useState<Trainer[]>([]);
  const [kelasList, setKelasList] = useState<Kelas[]>([]);
  const [statusFilter, setStatusFilter] = useState("all");
  // Filter periode buat analytics & list - "all" = semua periode.
  const [periodeFilter, setPeriodeFilter] = useState("all");
  const [loading, setLoading] = useState(true);

  const [wizardOpen, setWizardOpen] = useState(false);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [wTrainerId, setWTrainerId] = useState("");
  const [wKelasId, setWKelasId] = useState("");
  const [wSesiDetail, setWSesiDetail] = useState<SesiDetail[]>([]);
  const [wSesiLoading, setWSesiLoading] = useState(false);
  const [wChecked, setWChecked] = useState<Set<string>>(new Set());
  // Input range pemilihan sesi, mis. "1-33" atau "1-10, 15, 20-25".
  const [wRangeInput, setWRangeInput] = useState("");
  const [wRangeMsg, setWRangeMsg] = useState<string | null>(null);
  const [wBulan, setWBulan] = useState(BULAN[new Date().getMonth()]);
  const [wTahun, setWTahun] = useState(String(currentYear()));
  const [wCreating, setWCreating] = useState(false);
  const [wMsg, setWMsg] = useState<string | null>(null);
  // Kalau kepasang, wizard lagi mode edit payslip draft ini (bukan bikin baru).
  const [wEditingId, setWEditingId] = useState<string | null>(null);
  // "Sekarang" dibekukan sekali per mount (lazy init, bukan Date.now() di
  // render/useMemo) - itungan hari tunggakan gak perlu update tiap detik,
  // dan React nolak impure call langsung di badan komponen/useMemo.
  const [now] = useState(() => Date.now());

  // Modal export ke format n8n. null = tertutup.
  const [exportPayslip, setExportPayslip] = useState<Payslip | null>(null);
  const [exportJadwal, setExportJadwal] = useState("");
  const [exportSaving, setExportSaving] = useState(false);
  const [exportRows, setExportRows] = useState<Record<string, string> | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportCopied, setExportCopied] = useState(false);

  async function load() {
    setLoading(true);
    const [p, t, k] = await Promise.all([
      fetch("/api/payslip").then((r) => r.json()),
      fetch("/api/trainer").then((r) => r.json()),
      fetch("/api/kelas").then((r) => r.json()),
    ]);
    setPayslips(p);
    setTrainers(t);
    setKelasList(k);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  function openWizard() {
    setStep(1);
    setWEditingId(null);
    setWTrainerId("");
    setWKelasId("");
    setWSesiDetail([]);
    setWChecked(new Set());
    setWRangeInput("");
    setWRangeMsg(null);
    setWBulan(BULAN[new Date().getMonth()]);
    setWTahun(String(currentYear()));
    setWMsg(null);
    setWizardOpen(true);
  }

  // Buka wizard buat edit payslip draft yang udah ada - trainer, kelas,
  // periode, dan sesi yang udah dicentang di-prefill dari payslip itu.
  async function openEditWizard(p: Payslip) {
    const kelasId = p.sesi[0]?.kelasId ?? "";
    setWEditingId(p.id);
    setWTrainerId(p.trainerId);
    setWKelasId(kelasId);
    setWRangeInput("");
    setWRangeMsg(null);
    const [bulan, tahun] = [p.periode.split("-")[1], p.periode.split("-")[0]];
    setWBulan(bulan);
    setWTahun(tahun);
    setWMsg(null);
    setWSesiLoading(true);
    setStep(3);
    setWizardOpen(true);
    const data = await fetch(`/api/fee/detail?trainerId=${p.trainerId}`).then((r) => r.json());
    const sesiKelas = (data.sesi ?? []).filter((s: SesiDetail) => s.kelasId === kelasId);
    setWSesiDetail(sesiKelas);
    // Sesi yang udah nempel di payslip INI SENDIRI dianggep boleh dicentang
    // (bukan "kepakai payslip lain") - makanya di-preselect di sini.
    setWChecked(new Set(p.sesi.map((s) => s.sesiId)));
    setWSesiLoading(false);
  }

  function closeWizard() {
    setWizardOpen(false);
  }

  async function pickTrainer(trainerId: string) {
    setWTrainerId(trainerId);
    setWKelasId("");
    setWChecked(new Set());
    setStep(2);
  }

  async function pickKelas(kelasId: string) {
    setWKelasId(kelasId);
    setWChecked(new Set());
    setWRangeInput("");
    setWRangeMsg(null);
    setWSesiLoading(true);
    const data = await fetch(`/api/fee/detail?trainerId=${wTrainerId}`).then((r) => r.json());
    setWSesiDetail((data.sesi ?? []).filter((s: SesiDetail) => s.kelasId === kelasId));
    setWSesiLoading(false);
    setStep(3);
  }

  function toggleChecked(sesiId: string) {
    setWChecked((prev) => {
      const next = new Set(prev);
      if (next.has(sesiId)) next.delete(sesiId);
      else next.add(sesiId);
      return next;
    });
  }

  /**
   * Parse input range jadi daftar nomor pertemuan.
   * Format yang didukung: "1-33", "5", "1-10, 15, 20-25".
   * Balikin null kalau formatnya gak valid.
   */
  function parseRange(input: string): number[] | null {
    const trimmed = input.trim();
    if (!trimmed) return null;
    const hasil: number[] = [];

    for (const bagian of trimmed.split(",")) {
      const potongan = bagian.trim();
      if (!potongan) continue;

      const range = potongan.match(/^(\d+)\s*-\s*(\d+)$/);
      if (range) {
        let awal = parseInt(range[1], 10);
        let akhir = parseInt(range[2], 10);
        // Toleran kalau user nulis kebalik ("33-1").
        if (awal > akhir) [awal, akhir] = [akhir, awal];
        for (let i = awal; i <= akhir; i++) hasil.push(i);
        continue;
      }

      const tunggal = potongan.match(/^\d+$/);
      if (tunggal) {
        hasil.push(parseInt(potongan, 10));
        continue;
      }

      return null; // ada potongan yang gak kebaca -> anggap invalid semua
    }

    return hasil.length ? hasil : null;
  }

  /** Centang sesi sesuai range yang diketik, skip yang udah kepakai payslip lain. */
  function pilihRange() {
    const nomor = parseRange(wRangeInput);
    if (!nomor) {
      setWRangeMsg('Format gak kebaca. Contoh yang bener: "1-33" atau "1-10, 15, 20-25".');
      return;
    }

    const set = new Set(nomor);
    const cocok = wSesiDetail.filter((s) => set.has(s.pertemuanKe));
    const bisaDipilih = cocok.filter((s) => !s.sudahDiPayslip || s.payslipId === wEditingId);
    const terkunci = cocok.length - bisaDipilih.length;
    const takAda = nomor.filter((n) => !wSesiDetail.some((s) => s.pertemuanKe === n));

    setWChecked((prev) => {
      const next = new Set(prev);
      for (const s of bisaDipilih) next.add(s.sesiId);
      return next;
    });

    // Kasih tau kalau ada yang gak bisa dipilih, biar user gak bingung
    // kenapa jumlah yang kecentang beda dari yang diketik.
    const catatan: string[] = [`${bisaDipilih.length} sesi dicentang`];
    if (terkunci > 0) catatan.push(`${terkunci} dilewati (udah di payslip lain)`);
    if (takAda.length > 0) catatan.push(`${takAda.length} nomor gak ada di kelas ini`);
    setWRangeMsg(catatan.join(" · "));
  }

  function pilihSemua() {
    const bisaDipilih = wSesiDetail.filter(
      (s) => !s.sudahDiPayslip || s.payslipId === wEditingId
    );
    setWChecked(new Set(bisaDipilih.map((s) => s.sesiId)));
    setWRangeMsg(`${bisaDipilih.length} sesi dicentang`);
  }

  function bersihkanPilihan() {
    setWChecked(new Set());
    setWRangeMsg(null);
  }

  const wPeriode = `${wTahun}-${wBulan}`;
  const wCheckedTotal = wSesiDetail
    .filter((s) => wChecked.has(s.sesiId))
    .reduce((sum, s) => sum + s.ratePerSesi, 0);

  async function simpanPayslip() {
    if (wChecked.size === 0) return;
    setWCreating(true);
    setWMsg(null);

    const res = wEditingId
      ? await fetch(`/api/payslip/${wEditingId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ periode: wPeriode, sesiIds: Array.from(wChecked) }),
        })
      : await fetch("/api/payslip", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            trainerId: wTrainerId,
            periode: wPeriode,
            sesiIds: Array.from(wChecked),
          }),
        });

    const data = await res.json();
    if (!res.ok) {
      setWMsg(`Gagal: ${data.error}`);
      setWCreating(false);
      return;
    }
    setWCreating(false);
    setWizardOpen(false);
    load();
  }

  async function ubahStatus(id: string, status: string) {
    const res = await fetch(`/api/payslip/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (res.ok) load();
  }

  async function batalkan(id: string) {
    const res = await fetch(`/api/payslip/${id}`, { method: "DELETE" });
    if (res.ok) load();
  }

  /** Buka modal export n8n - isi jadwal pembayaran dari yang udah ada (kalau ada). */
  function openExport(p: Payslip) {
    setExportPayslip(p);
    setExportJadwal(p.jadwalPembayaran ?? "");
    setExportRows(null);
    setExportError(null);
    setExportCopied(false);
  }

  /** Simpan jadwal pembayaran (kalau berubah), lalu ambil baris export siap tempel. */
  async function generateExport() {
    if (!exportPayslip) return;
    setExportSaving(true);
    setExportError(null);
    try {
      if (exportJadwal !== (exportPayslip.jadwalPembayaran ?? "")) {
        const patchRes = await fetch(`/api/payslip/${exportPayslip.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jadwalPembayaran: exportJadwal || null }),
        });
        if (!patchRes.ok) {
          const d = await patchRes.json();
          setExportError(d.error ?? "Gagal simpan jadwal pembayaran");
          setExportSaving(false);
          return;
        }
      }

      const res = await fetch(`/api/payslip/${exportPayslip.id}/export-n8n`);
      const data = await res.json();
      if (!res.ok) {
        setExportError(data.error ?? "Gagal generate export");
      } else {
        setExportRows(data);
        load(); // refresh biar jadwalPembayaran ke-update di list
      }
    } catch (e) {
      setExportError(e instanceof Error ? e.message : String(e));
    }
    setExportSaving(false);
  }

  /**
   * Bungkus nilai pakai tanda kutip kalau isinya ada tab/newline/kutip -
   * aturan quoting TSV/CSV standar yang Google Sheets paham pas paste.
   * items_json server udah dikirim satu baris (gak ada newline), tapi ini
   * lapisan pengaman kedua kalau suatu saat ada field lain yang kebawa
   * karakter aneh (mis. nama trainer yang ada tab-nya).
   */
  function tsvCell(v: string): string {
    if (/[\t\n"]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
    return v;
  }

  /** Satu baris TSV, urutan kolom persis sesuai sheet trigger n8n. */
  function exportTsvRow(r: Record<string, string>): string {
    return [
      r.periode,
      r.jadwal_pembayaran,
      r.nama,
      r.email,
      r.bank,
      r.nomor_rekening,
      r.nama_pemilik_rekening,
      r.items_json,
    ]
      .map(tsvCell)
      .join("\t");
  }

  async function copyExportRow() {
    if (!exportRows) return;
    try {
      await navigator.clipboard.writeText(exportTsvRow(exportRows));
      setExportCopied(true);
      setTimeout(() => setExportCopied(false), 1500);
    } catch {
      // Clipboard API bisa ditolak browser - baris tetap kelihatan di
      // textarea, admin bisa select-all manual.
    }
  }

  // Kelas trainer ini = dia trainer utama ATAU dia salah satu trainer
  // tambahan (kelas multi-trainer). Sebelumnya cuma cek trainerId (trainer
  // utama), jadi kelas yang Gabriel ajar sebagai trainer tambahan gak
  // muncul di wizard - padahal sesi & fee dia beneran ada di kelas itu.
  const kelasTrainer = kelasList.filter(
    (k) =>
      k.trainerId === wTrainerId ||
      (k.trainers ?? []).some((t) => t.trainerId === wTrainerId)
  );
  const wTrainerNama = trainers.find((t) => t.id === wTrainerId)?.nama ?? "";
  const wKelasNama = kelasList.find((k) => k.id === wKelasId)?.nama ?? "";

  // Periode yang beneran ada payslip-nya, terbaru dulu - buat dropdown filter.
  const periodeOptions = useMemo(
    () => Array.from(new Set(payslips.map((p) => p.periode))).sort().reverse(),
    [payslips]
  );

  // Filter periode nge-scope SEMUA di bawahnya (analytics + list), sesuai
  // pola "filters scope everything below them" - biar angkanya selalu sinkron.
  const periodePayslips = useMemo(
    () => (periodeFilter === "all" ? payslips : payslips.filter((p) => p.periode === periodeFilter)),
    [payslips, periodeFilter]
  );

  const visiblePayslips = useMemo(
    () => periodePayslips.filter((p) => statusFilter === "all" || p.status === statusFilter),
    [periodePayslips, statusFilter]
  );

  // --- Analytics, dihitung dari periodePayslips (udah discope filter periode) ---
  const analytics = useMemo(() => {
    const belumDibayar = periodePayslips.filter((p) => p.status === "belum_dibayar");
    const totalBelumDibayar = belumDibayar.reduce((a, p) => a + p.totalFee, 0);

    const lunas = periodePayslips.filter((p) => p.status === "lunas");
    const totalLunas = lunas.reduce((a, p) => a + p.totalFee, 0);

    // Tunggakan terlama = payslip belum_dibayar dengan finalizedAt paling
    // lama - itu tanggal dia "dikunci", jadi patokan wajar buat "udah
    // nunggak berapa lama", bukan createdAt (draft) atau tanggal hari ini.
    const tunggakan = belumDibayar
      .filter((p) => p.finalizedAt)
      .map((p) => ({
        ...p,
        hariTertunggak: Math.floor((now - new Date(p.finalizedAt as string).getTime()) / 86_400_000),
      }))
      .sort((a, b) => b.hariTertunggak - a.hariTertunggak);
    const tunggakanTerlama = tunggakan[0] ?? null;

    // Breakdown per trainer: lunas vs belum dibayar, diurutin dari total
    // terbesar biar yang paling perlu perhatian ada di atas.
    const perTrainerMap = new Map<
      string,
      { trainerId: string; trainerNama: string; lunas: number; belumDibayar: number }
    >();
    for (const p of periodePayslips) {
      if (p.status === "draft") continue; // draft belum final, gak masuk breakdown
      const row = perTrainerMap.get(p.trainerId) ?? {
        trainerId: p.trainerId,
        trainerNama: p.trainerNama,
        lunas: 0,
        belumDibayar: 0,
      };
      if (p.status === "lunas") row.lunas += p.totalFee;
      else row.belumDibayar += p.totalFee;
      perTrainerMap.set(p.trainerId, row);
    }
    const perTrainer = Array.from(perTrainerMap.values()).sort(
      (a, b) => b.lunas + b.belumDibayar - (a.lunas + a.belumDibayar)
    );

    // Tren per periode - SELALU dari payslips penuh (bukan periodePayslips),
    // karena filter periode itu sendiri gak masuk akal dipakai buat nge-scope
    // chart "tren ANTAR periode". 6 bulan terakhir yang ada datanya.
    const perPeriodeMap = new Map<string, number>();
    for (const p of payslips) {
      if (p.status === "draft") continue;
      perPeriodeMap.set(p.periode, (perPeriodeMap.get(p.periode) ?? 0) + p.totalFee);
    }
    const tren = Array.from(perPeriodeMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-6);

    return { totalBelumDibayar, jumlahBelumDibayar: belumDibayar.length, totalLunas, tunggakanTerlama, perTrainer, tren };
  }, [periodePayslips, payslips, now]);

  const inputClass =
    "w-full rounded-lg border border-outline-variant bg-surface px-3 py-2 font-inter text-body-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-primary";

  return (
    <div className="flex flex-col gap-stack-lg">
      {/* Header */}
      <div className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-end">
        <div>
          <h1 className="mb-2 font-geist text-headline-lg-mobile text-primary md:text-headline-lg">
            Payslip
          </h1>
          <p className="font-inter text-body-md text-text-muted">
            Bikin dan pantau payslip fee trainer per periode. Tandai lunas begitu udah dibayar.
          </p>
        </div>
        <button
          type="button"
          onClick={openWizard}
          disabled={!trainers.length}
          className="flex items-center justify-center gap-2 whitespace-nowrap rounded-lg bg-primary px-6 py-2.5 font-geist text-label-md text-on-primary shadow-sm transition-colors hover:bg-primary-container disabled:opacity-50"
        >
          <span className="material-symbols-outlined text-[18px]">add</span>
          Buat Payslip
        </button>
      </div>

      {/* Filter periode - nge-scope analytics + list di bawahnya (bukan chart
          tren, itu sengaja selalu semua periode - lihat komentar analytics). */}
      <div className="flex items-center gap-3">
        <label htmlFor="periode-filter" className="font-geist text-label-sm text-text-muted">
          Periode
        </label>
        <select
          id="periode-filter"
          value={periodeFilter}
          onChange={(e) => setPeriodeFilter(e.target.value)}
          className="rounded-lg border border-outline-variant bg-surface px-3 py-2 font-inter text-body-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-primary"
        >
          <option value="all">Semua periode</option>
          {periodeOptions.map((p) => {
            const [y, m] = p.split("-");
            return (
              <option key={p} value={p}>
                {BULAN_LABEL[m] ?? m} {y}
              </option>
            );
          })}
        </select>
      </div>

      {/* Stat tiles */}
      <div className="grid grid-cols-1 gap-stack-md sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-5">
          <p className="font-inter text-label-sm text-text-muted">Belum Dibayar</p>
          <p className="mt-1 font-geist text-headline-md text-warning">
            {formatRupiah(analytics.totalBelumDibayar)}
          </p>
          <p className="mt-1 font-inter text-label-sm text-text-muted">
            {analytics.jumlahBelumDibayar} payslip
          </p>
        </div>
        <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-5">
          <p className="font-inter text-label-sm text-text-muted">Lunas</p>
          <p className="mt-1 font-geist text-headline-md text-success">
            {formatRupiah(analytics.totalLunas)}
          </p>
          <p className="mt-1 font-inter text-label-sm text-text-muted">
            {periodeFilter === "all" ? "sepanjang waktu" : "periode ini"}
          </p>
        </div>
        <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-5">
          <p className="font-inter text-label-sm text-text-muted">Payslip Aktif</p>
          <p className="mt-1 font-geist text-headline-md text-primary">
            {periodePayslips.filter((p) => p.status !== "draft").length}
          </p>
          <p className="mt-1 font-inter text-label-sm text-text-muted">belum dibayar + lunas</p>
        </div>
        <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-5">
          <p className="font-inter text-label-sm text-text-muted">Tunggakan Terlama</p>
          {analytics.tunggakanTerlama ? (
            <>
              <p className="mt-1 truncate font-geist text-headline-sm text-error">
                {analytics.tunggakanTerlama.trainerNama}
              </p>
              <p className="mt-1 font-inter text-label-sm text-text-muted">
                {analytics.tunggakanTerlama.hariTertunggak} hari &middot;{" "}
                {formatRupiah(analytics.tunggakanTerlama.totalFee)}
              </p>
            </>
          ) : (
            <p className="mt-1 font-geist text-headline-sm text-text-muted">-</p>
          )}
        </div>
      </div>

      {/* Breakdown per trainer & tren per periode */}
      {(analytics.perTrainer.length > 0 || analytics.tren.length > 0) && (
        <div className="grid grid-cols-1 gap-stack-md lg:grid-cols-2">
          {analytics.perTrainer.length > 0 && (
            <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-5">
              <h2 className="mb-4 font-geist text-label-lg text-primary">Per Trainer</h2>
              <div className="flex flex-col gap-3">
                {analytics.perTrainer.map((row) => {
                  const total = row.lunas + row.belumDibayar;
                  const maxTotal = Math.max(
                    ...analytics.perTrainer.map((r) => r.lunas + r.belumDibayar)
                  );
                  const pctLunas = total > 0 ? (row.lunas / total) * 100 : 0;
                  const pctBelum = total > 0 ? (row.belumDibayar / total) * 100 : 0;
                  const widthPct = maxTotal > 0 ? (total / maxTotal) * 100 : 0;
                  return (
                    <div key={row.trainerId} className="flex flex-col gap-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="truncate font-inter text-body-sm text-on-surface-variant">
                          {row.trainerNama}
                        </span>
                        <span className="whitespace-nowrap font-geist text-label-sm text-primary tabular-nums">
                          {formatRupiah(total)}
                        </span>
                      </div>
                      <div
                        className="h-2.5 overflow-hidden rounded-full bg-surface-container-high"
                        role="img"
                        aria-label={`${row.trainerNama}: ${formatRupiah(row.lunas)} lunas, ${formatRupiah(row.belumDibayar)} belum dibayar`}
                      >
                        <div className="flex h-full" style={{ width: `${widthPct}%` }}>
                          {row.lunas > 0 && (
                            <div
                              className="h-full bg-success"
                              style={{ width: `${pctLunas}%` }}
                              title={`Lunas: ${formatRupiah(row.lunas)}`}
                            />
                          )}
                          {row.belumDibayar > 0 && (
                            <div
                              className="h-full bg-warning"
                              style={{ width: `${pctBelum}%` }}
                              title={`Belum dibayar: ${formatRupiah(row.belumDibayar)}`}
                            />
                          )}
                        </div>
                      </div>
                      {/* Angka eksplisit, bukan cuma warna+tooltip - success/warning
                          di atas surface ini kontrasnya di bawah 3:1 (WARN dari
                          validator), jadi nilainya wajib kebaca tanpa hover. */}
                      <div className="flex items-center gap-3 font-inter text-label-sm text-text-muted">
                        {row.lunas > 0 && <span>Lunas {formatRupiah(row.lunas)}</span>}
                        {row.belumDibayar > 0 && (
                          <span>Belum dibayar {formatRupiah(row.belumDibayar)}</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="mt-4 flex items-center gap-4 border-t border-outline-variant/60 pt-3">
                <span className="flex items-center gap-1.5 font-inter text-label-sm text-text-muted">
                  <span className="h-2.5 w-2.5 rounded-full bg-success" /> Lunas
                </span>
                <span className="flex items-center gap-1.5 font-inter text-label-sm text-text-muted">
                  <span className="h-2.5 w-2.5 rounded-full bg-warning" /> Belum dibayar
                </span>
              </div>
            </div>
          )}

          {analytics.tren.length > 0 && (
            <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-5">
              <h2 className="mb-1 font-geist text-label-lg text-primary">Tren Fee per Bulan</h2>
              <p className="mb-4 font-inter text-label-sm text-text-muted">
                Payslip belum dibayar + lunas, 6 periode terakhir
              </p>
              <div className="flex items-end gap-3" style={{ height: 160 }}>
                {(() => {
                  const maxVal = Math.max(...analytics.tren.map(([, v]) => v), 1);
                  return analytics.tren.map(([periode, val]) => {
                    const [y, m] = periode.split("-");
                    const isActive = periodeFilter === periode;
                    const hPct = (val / maxVal) * 100;
                    return (
                      <button
                        key={periode}
                        type="button"
                        onClick={() => setPeriodeFilter(isActive ? "all" : periode)}
                        className="group flex flex-1 flex-col items-center gap-2"
                        title={`${BULAN_LABEL[m] ?? m} ${y}: ${formatRupiah(val)}`}
                      >
                        <span className="font-inter text-label-sm tabular-nums text-text-muted opacity-0 transition-opacity group-hover:opacity-100">
                          {formatRupiah(val)}
                        </span>
                        <div className="flex h-full w-full items-end">
                          <div
                            className={`w-full rounded-t transition-colors ${
                              isActive
                                ? "bg-primary"
                                : "bg-primary-fixed-dim group-hover:bg-primary"
                            }`}
                            style={{ height: `${Math.max(hPct, 3)}%` }}
                          />
                        </div>
                        <span
                          className={`font-geist text-label-sm ${isActive ? "text-primary" : "text-text-muted"}`}
                        >
                          {(BULAN_LABEL[m] ?? m).slice(0, 3)}
                        </span>
                      </button>
                    );
                  });
                })()}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Filter status */}
      <div className="flex flex-wrap gap-2">
        {[
          { key: "all", label: "Semua" },
          { key: "draft", label: "Draft" },
          { key: "belum_dibayar", label: "Belum Dibayar" },
          { key: "lunas", label: "Lunas" },
        ].map((opt) => (
          <button
            key={opt.key}
            type="button"
            onClick={() => setStatusFilter(opt.key)}
            className={
              statusFilter === opt.key
                ? "rounded-lg bg-primary px-4 py-2 font-geist text-label-sm text-on-primary"
                : "rounded-lg border border-outline-variant bg-surface px-4 py-2 font-geist text-label-sm text-on-surface-variant transition-colors hover:bg-surface-container"
            }
          >
            {opt.label}
            {opt.key !== "all" &&
              ` (${payslips.filter((p) => p.status === opt.key).length})`}
          </button>
        ))}
      </div>

      {/* List payslip */}
      <div className="flex flex-col gap-stack-md">
        {loading && (
          <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-6 text-center font-inter text-body-sm text-text-muted">
            Memuat...
          </div>
        )}

        {!loading && visiblePayslips.length === 0 && (
          <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-6 text-center font-inter text-body-sm text-text-muted">
            {payslips.length === 0
              ? "Belum ada payslip. Klik \"Buat Payslip\" buat mulai."
              : "Nggak ada payslip yang cocok sama filter ini."}
          </div>
        )}

        {visiblePayslips.map((p) => (
          <div
            key={p.id}
            className="flex flex-col gap-4 rounded-xl border border-outline-variant bg-surface-container-lowest p-5 transition-shadow hover:shadow-md lg:flex-row lg:items-center lg:justify-between"
          >
            <div className="flex items-start gap-4">
              <div
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-bold ${avatarClass(
                  p.trainerId
                )}`}
              >
                {initials(p.trainerNama)}
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-geist text-headline-sm text-primary">{p.trainerNama}</h3>
                  <span
                    className={`inline-flex items-center rounded-full px-2.5 py-1 font-geist text-label-sm ${STATUS_STYLE[p.status]}`}
                  >
                    {STATUS_LABEL[p.status] ?? p.status}
                  </span>
                </div>
                <p className="mt-1 font-inter text-body-sm text-text-muted">
                  Periode {BULAN_LABEL[p.periode.split("-")[1]] ?? p.periode.split("-")[1]}{" "}
                  {p.periode.split("-")[0]} · {p.jumlahSesi} sesi
                </p>
                <p className="mt-1 font-inter text-body-sm text-text-muted">
                  {Array.from(new Set(p.sesi.map((s) => s.kelasNama))).join(", ")}
                </p>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-4">
              <div className="text-right">
                <div className="font-geist text-headline-sm text-primary">
                  {formatRupiah(p.totalFee)}
                </div>
                {p.status === "lunas" && p.paidAt && (
                  <div className="font-inter text-label-sm text-text-muted">
                    Lunas {new Date(p.paidAt).toLocaleDateString("id-ID")}
                  </div>
                )}
              </div>

              <div className="flex gap-2">
                {p.status === "draft" && (
                  <>
                    <button
                      onClick={() => openEditWizard(p)}
                      className="flex items-center gap-1.5 rounded-lg border border-outline-variant px-4 py-2 font-geist text-label-sm text-on-surface-variant transition-colors hover:bg-surface-container"
                    >
                      <span className="material-symbols-outlined text-[16px]">edit</span>
                      Edit
                    </button>
                    <button
                      onClick={() => ubahStatus(p.id, "belum_dibayar")}
                      className="rounded-lg bg-primary px-4 py-2 font-geist text-label-sm text-on-primary transition-colors hover:bg-primary-container"
                    >
                      Finalisasi
                    </button>
                    <button
                      onClick={() => batalkan(p.id)}
                      className="rounded-lg border border-outline-variant px-4 py-2 font-geist text-label-sm text-on-surface-variant transition-colors hover:bg-surface-container"
                    >
                      Batalkan
                    </button>
                  </>
                )}
                {p.status === "belum_dibayar" && (
                  <>
                    <button
                      onClick={() => ubahStatus(p.id, "lunas")}
                      className="flex items-center gap-1.5 rounded-lg bg-success px-4 py-2 font-geist text-label-sm text-white transition-colors hover:opacity-90"
                    >
                      <span className="material-symbols-outlined text-[16px]">check_circle</span>
                      Tandai Lunas
                    </button>
                    <button
                      onClick={() => ubahStatus(p.id, "draft")}
                      title="Balikin ke draft buat koreksi sesi"
                      className="rounded-lg border border-outline-variant px-4 py-2 font-geist text-label-sm text-on-surface-variant transition-colors hover:bg-surface-container"
                    >
                      Batalkan Finalisasi
                    </button>
                  </>
                )}
                {(p.status === "belum_dibayar" || p.status === "lunas") && (
                  <button
                    onClick={() => openExport(p)}
                    title="Generate baris siap tempel ke sheet trigger n8n"
                    className="flex items-center gap-1.5 rounded-lg border border-outline-variant px-4 py-2 font-geist text-label-sm text-on-surface-variant transition-colors hover:bg-surface-container"
                  >
                    <span className="material-symbols-outlined text-[16px]">output</span>
                    Export n8n
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Wizard buat payslip - modal sederhana */}
      {wizardOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-on-surface/40 p-4">
          <div className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl bg-surface-container-lowest shadow-lg">
            <div className="flex items-center justify-between border-b border-outline-variant px-6 py-4">
              <h2 className="font-geist text-headline-sm text-primary">
                {wEditingId ? "Edit Payslip" : "Buat Payslip Baru"}
              </h2>
              <button
                onClick={closeWizard}
                className="rounded-full p-1.5 text-text-muted transition-colors hover:bg-surface-container"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            {/* Step indicator */}
            <div className="flex items-center gap-2 border-b border-outline-variant/60 px-6 py-3 font-geist text-label-sm text-text-muted">
              <span className={step >= 1 ? "text-primary" : ""}>1. Trainer</span>
              <span className="material-symbols-outlined text-[14px]">chevron_right</span>
              <span className={step >= 2 ? "text-primary" : ""}>2. Kelas</span>
              <span className="material-symbols-outlined text-[14px]">chevron_right</span>
              <span className={step >= 3 ? "text-primary" : ""}>3. Sesi & Periode</span>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              {/* Step 1: pilih trainer */}
              {step === 1 && (
                <div className="flex flex-col gap-2">
                  {trainers.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => pickTrainer(t.id)}
                      className="flex items-center gap-3 rounded-lg border border-outline-variant px-4 py-3 text-left transition-colors hover:border-primary hover:bg-neutral-light-bg"
                    >
                      <div
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold ${avatarClass(
                          t.id
                        )}`}
                      >
                        {initials(t.nama)}
                      </div>
                      <span className="font-inter text-body-sm text-primary">{t.nama}</span>
                    </button>
                  ))}
                </div>
              )}

              {/* Step 2: pilih kelas */}
              {step === 2 && (
                <div className="flex flex-col gap-3">
                  <button
                    onClick={() => setStep(1)}
                    className="flex w-fit items-center gap-1 font-geist text-label-sm text-text-muted hover:text-primary"
                  >
                    <span className="material-symbols-outlined text-[16px]">arrow_back</span>
                    Ganti trainer ({wTrainerNama})
                  </button>
                  {kelasTrainer.length === 0 && (
                    <p className="font-inter text-body-sm text-text-muted">
                      Trainer ini belum punya kelas.
                    </p>
                  )}
                  <div className="flex flex-col gap-2">
                    {kelasTrainer.map((k) => (
                      <button
                        key={k.id}
                        onClick={() => pickKelas(k.id)}
                        className="flex items-center justify-between rounded-lg border border-outline-variant px-4 py-3 text-left transition-colors hover:border-primary hover:bg-neutral-light-bg"
                      >
                        <span className="font-inter text-body-sm text-primary">{k.nama}</span>
                        <span className="material-symbols-outlined text-[18px] text-outline">
                          chevron_right
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Step 3: centang sesi + pilih periode */}
              {step === 3 && (
                <div className="flex flex-col gap-4">
                  <button
                    onClick={() => setStep(2)}
                    className="flex w-fit items-center gap-1 font-geist text-label-sm text-text-muted hover:text-primary"
                  >
                    <span className="material-symbols-outlined text-[16px]">arrow_back</span>
                    Ganti kelas ({wKelasNama})
                  </button>

                  {wSesiLoading && (
                    <p className="font-inter text-body-sm text-text-muted">Memuat sesi...</p>
                  )}
                  {!wSesiLoading && wSesiDetail.length === 0 && (
                    <p className="font-inter text-body-sm text-text-muted">
                      Belum ada sesi selesai di kelas ini.
                    </p>
                  )}

                  {/* Pilih banyak sekaligus - ngetik range jauh lebih cepat
                      daripada nyentang 30+ sesi satu-satu. */}
                  {!wSesiLoading && wSesiDetail.length > 0 && (
                    <div className="flex flex-col gap-2 rounded-lg border border-outline-variant bg-surface-container-low p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <label
                          htmlFor="range-sesi"
                          className="font-geist text-label-sm text-text-muted"
                        >
                          Pilih range:
                        </label>
                        <input
                          id="range-sesi"
                          className={`${inputClass} w-40`}
                          placeholder="mis. 1-33"
                          value={wRangeInput}
                          onChange={(e) => {
                            setWRangeInput(e.target.value);
                            setWRangeMsg(null);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              pilihRange();
                            }
                          }}
                        />
                        <button
                          type="button"
                          onClick={pilihRange}
                          disabled={!wRangeInput.trim()}
                          className="rounded-lg bg-primary px-4 py-2 font-geist text-label-sm text-on-primary transition-colors hover:bg-primary-container disabled:opacity-50"
                        >
                          Centang
                        </button>
                        <span className="text-outline-variant">|</span>
                        <button
                          type="button"
                          onClick={pilihSemua}
                          className="rounded-lg border border-outline-variant bg-surface px-3 py-2 font-geist text-label-sm text-on-surface-variant transition-colors hover:bg-surface-container"
                        >
                          Pilih Semua
                        </button>
                        <button
                          type="button"
                          onClick={bersihkanPilihan}
                          disabled={wChecked.size === 0}
                          className="rounded-lg border border-outline-variant bg-surface px-3 py-2 font-geist text-label-sm text-on-surface-variant transition-colors hover:bg-surface-container disabled:opacity-50"
                        >
                          Bersihkan
                        </button>
                      </div>
                      {wRangeMsg && (
                        <p className="font-inter text-label-sm text-text-muted">{wRangeMsg}</p>
                      )}
                    </div>
                  )}

                  {!wSesiLoading && wSesiDetail.length > 0 && (
                    <div className="flex max-h-64 flex-col gap-1 overflow-y-auto rounded-lg border border-outline-variant">
                      {wSesiDetail.map((s) => {
                        // Sesi yang nempel di payslip yang LAGI DIEDIT ini
                        // sendiri boleh dicentang/lepas bebas - cuma sesi
                        // yang kepakai payslip LAIN yang beneran di-lock.
                        const locked = s.sudahDiPayslip && s.payslipId !== wEditingId;
                        return (
                          <label
                            key={s.sesiId}
                            className={`flex items-center gap-3 border-b border-outline-variant/40 px-4 py-2.5 last:border-b-0 ${
                              locked
                                ? "cursor-not-allowed opacity-50"
                                : "cursor-pointer hover:bg-neutral-light-bg"
                            }`}
                          >
                            <input
                              type="checkbox"
                              disabled={locked}
                              checked={wChecked.has(s.sesiId)}
                              onChange={() => toggleChecked(s.sesiId)}
                              className="h-4 w-4 rounded border-outline-variant text-primary focus:ring-primary"
                            />
                            <span className="w-16 shrink-0 font-geist text-label-sm text-text-muted">
                              Sesi {s.pertemuanKe}
                            </span>
                            <span className="flex-1 truncate font-inter text-body-sm text-on-surface-variant">
                              {s.materi ?? "-"}
                            </span>
                            <span className="w-24 shrink-0 text-right font-inter text-body-sm text-primary">
                              {formatRupiah(s.ratePerSesi)}
                            </span>
                            {locked && (
                              <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 font-geist text-label-sm text-primary">
                                {s.payslipPeriode}
                              </span>
                            )}
                          </label>
                        );
                      })}
                    </div>
                  )}

                  <div className="flex flex-col gap-2">
                    <span className="font-geist text-label-sm text-text-muted">
                      Periode payslip
                    </span>
                    <div className="flex gap-2">
                      <select
                        className={inputClass}
                        value={wBulan}
                        onChange={(e) => setWBulan(e.target.value)}
                      >
                        {BULAN.map((b) => (
                          <option key={b} value={b}>
                            {BULAN_LABEL[b]}
                          </option>
                        ))}
                      </select>
                      <select
                        className={inputClass}
                        value={wTahun}
                        onChange={(e) => setWTahun(e.target.value)}
                      >
                        {[currentYear() - 1, currentYear(), currentYear() + 1].map((y) => (
                          <option key={y} value={y}>
                            {y}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {wMsg && <p className="font-inter text-body-sm text-error">{wMsg}</p>}
                </div>
              )}
            </div>

            {step === 3 && (
              <div className="flex items-center justify-between border-t border-outline-variant px-6 py-4">
                <span className="font-inter text-body-sm text-text-muted">
                  {wChecked.size > 0
                    ? `${wChecked.size} sesi dipilih · ${formatRupiah(wCheckedTotal)}`
                    : "Belum ada sesi dipilih"}
                </span>
                <button
                  onClick={simpanPayslip}
                  disabled={wCreating || wChecked.size === 0}
                  className="flex items-center gap-2 rounded-lg bg-primary px-6 py-2.5 font-geist text-label-md text-on-primary shadow-sm transition-colors hover:bg-primary-container disabled:opacity-50"
                >
                  <span className="material-symbols-outlined text-[18px]">receipt_long</span>
                  {wCreating ? "Menyimpan..." : wEditingId ? "Simpan Perubahan" : "Buat Payslip"}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal export ke format n8n */}
      {exportPayslip && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-on-surface/40 p-4">
          <div className="flex max-h-[85vh] w-full max-w-xl flex-col overflow-hidden rounded-xl bg-surface-container-lowest shadow-lg">
            <div className="flex items-center justify-between border-b border-outline-variant px-6 py-4">
              <h2 className="font-geist text-headline-sm text-primary">
                Export ke n8n &mdash; {exportPayslip.trainerNama}
              </h2>
              <button
                onClick={() => setExportPayslip(null)}
                className="rounded-full p-1.5 text-text-muted transition-colors hover:bg-surface-container"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              <div className="flex flex-col gap-stack-md">
                <div className="flex flex-col gap-1.5">
                  <label
                    htmlFor="export-jadwal"
                    className="font-geist text-label-sm text-text-muted"
                  >
                    Jadwal pembayaran (estimasi tanggal transfer)
                  </label>
                  <input
                    id="export-jadwal"
                    type="date"
                    className={inputClass}
                    value={exportJadwal}
                    onChange={(e) => setExportJadwal(e.target.value)}
                  />
                </div>

                <button
                  type="button"
                  onClick={generateExport}
                  disabled={exportSaving || !exportJadwal}
                  className="self-start rounded-lg bg-primary px-5 py-2 font-geist text-label-md text-on-primary transition-colors hover:bg-primary-container disabled:opacity-50"
                >
                  {exportSaving ? "Menyiapkan..." : "Generate baris export"}
                </button>

                {exportError && (
                  <p className="rounded-lg border border-error-container bg-error-container/40 p-3 font-inter text-body-sm text-on-error-container">
                    {exportError}
                  </p>
                )}

                {exportRows && (
                  <div className="flex flex-col gap-stack-sm">
                    <p className="font-inter text-body-sm text-text-muted">
                      Satu baris, kolom dipisah tab &mdash; tempel langsung ke baris baru di
                      Google Sheet trigger n8n-mu (Ctrl+V di kolom pertama, bukan &quot;Paste
                      special&quot;).
                    </p>
                    <textarea
                      readOnly
                      value={exportTsvRow(exportRows)}
                      onClick={(e) => e.currentTarget.select()}
                      rows={4}
                      className="w-full resize-none rounded-lg border border-outline-variant bg-surface px-3 py-2 font-inter text-label-sm text-on-surface-variant"
                    />
                    <button
                      type="button"
                      onClick={copyExportRow}
                      className="flex items-center justify-center gap-2 self-start rounded-lg border border-outline-variant bg-surface-container-low px-5 py-2 font-geist text-label-md text-primary transition-colors hover:bg-surface-container"
                    >
                      <span className="material-symbols-outlined text-[18px]">
                        {exportCopied ? "check" : "content_copy"}
                      </span>
                      {exportCopied ? "Disalin" : "Copy baris"}
                    </button>

                    <div className="mt-2 rounded-lg border border-outline-variant bg-surface-container-low p-3 font-inter text-label-sm text-text-muted">
                      <p>
                        <strong className="text-on-surface-variant">Periode:</strong>{" "}
                        {exportRows.periode}
                      </p>
                      <p>
                        <strong className="text-on-surface-variant">Nama:</strong>{" "}
                        {exportRows.nama} ({exportRows.email})
                      </p>
                      <p>
                        <strong className="text-on-surface-variant">Bank:</strong>{" "}
                        {exportRows.bank} &middot; {exportRows.nomor_rekening} a.n{" "}
                        {exportRows.nama_pemilik_rekening}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
