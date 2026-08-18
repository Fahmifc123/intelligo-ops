"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { initials, avatarClass, formatRupiah } from "@/lib/ui";

type FeeRow = {
  trainerId: string;
  trainerNama: string;
  jumlahSesi: number;
  totalFee: number;
  sesiLunas: number;
  feeLunas: number;
  sesiBelumDibayar: number;
  feeBelumDibayar: number;
  sesiBelumDiPayslip: number;
  feeBelumDiPayslip: number;
};

type Sesi = { id: string; kelasId: string; status: string; tanggal: string | null };
type Trainer = { id: string; nama: string };
type Kelas = { id: string; nama: string; trainerId: string };

export default function FeePage() {
  const [rows, setRows] = useState<FeeRow[]>([]);
  const [sesiList, setSesiList] = useState<Sesi[]>([]);
  const [trainers, setTrainers] = useState<Trainer[]>([]);
  const [kelasList, setKelasList] = useState<Kelas[]>([]);
  const [periode, setPeriode] = useState("");
  const [appliedPeriode, setAppliedPeriode] = useState("");
  const [trainerFilter, setTrainerFilter] = useState("all");
  const [kelasFilter, setKelasFilter] = useState("all");

  async function load(p?: string, trainerId?: string, kelasId?: string) {
    const params = new URLSearchParams();
    if (p) params.set("periode", p);
    if (trainerId && trainerId !== "all") params.set("trainerId", trainerId);
    if (kelasId && kelasId !== "all") params.set("kelasId", kelasId);
    const qs = params.toString();

    const [fee, sesi, t, k] = await Promise.all([
      fetch(`/api/fee${qs ? `?${qs}` : ""}`).then((r) => r.json()),
      fetch("/api/sesi").then((r) => r.json()),
      fetch("/api/trainer").then((r) => r.json()),
      fetch("/api/kelas").then((r) => r.json()),
    ]);
    setRows(fee);
    setSesiList(sesi);
    setTrainers(t);
    setKelasList(k);
    setAppliedPeriode(p ?? "");
  }

  useEffect(() => {
    load();
  }, []);

  function applyFilters(p: string, trainerId: string, kelasId: string) {
    setTrainerFilter(trainerId);
    setKelasFilter(kelasId);
    load(p || undefined, trainerId, kelasId);
  }

  const total = rows.reduce((sum, r) => sum + r.totalFee, 0);
  const totalSesiSelesai = rows.reduce((sum, r) => sum + r.jumlahSesi, 0);
  const totalLunas = rows.reduce((sum, r) => sum + r.feeLunas, 0);
  const sesiLunas = rows.reduce((sum, r) => sum + r.sesiLunas, 0);
  const totalBelumDibayar = rows.reduce((sum, r) => sum + r.feeBelumDibayar, 0);
  const sesiBelumDibayarCount = rows.reduce((sum, r) => sum + r.sesiBelumDibayar, 0);
  const totalBelumDiPayslip = rows.reduce((sum, r) => sum + r.feeBelumDiPayslip, 0);
  const sesiBelumDiPayslipCount = rows.reduce((sum, r) => sum + r.sesiBelumDiPayslip, 0);

  // "Belum terlaksana" = sesi yang belum ditandai selesai, dihitung dari
  // data sesi beneran. Ikut filter periode + trainer + kelas yang aktif -
  // filter trainer diturunin lewat kelasList (sesi gak nyimpen trainerId
  // langsung, tapi kelasnya iya).
  const kelasTrainerFilter = useMemo(() => {
    if (trainerFilter === "all") return null;
    return new Set(kelasList.filter((k) => k.trainerId === trainerFilter).map((k) => k.id));
  }, [kelasList, trainerFilter]);

  const sesiBelumTerlaksana = sesiList.filter((s) => {
    if (s.status === "selesai" || s.status === "batal") return false;
    if (appliedPeriode && !s.tanggal?.startsWith(appliedPeriode)) return false;
    if (kelasFilter !== "all" && s.kelasId !== kelasFilter) return false;
    if (kelasTrainerFilter && !kelasTrainerFilter.has(s.kelasId)) return false;
    return true;
  }).length;

  const kelasUntukDropdown =
    trainerFilter === "all" ? kelasList : kelasList.filter((k) => k.trainerId === trainerFilter);

  const inputClass =
    "w-full rounded-lg border border-outline-variant bg-surface px-3 py-2 font-inter text-body-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-primary";

  return (
    <div className="flex flex-col gap-stack-lg">
      {/* Header */}
      <div className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-end">
        <div>
          <h1 className="mb-2 font-geist text-headline-lg-mobile text-primary md:text-headline-lg">
            Rekap Fee Trainer
          </h1>
          <p className="font-inter text-body-md text-text-muted">
            Otomatis dihitung dari sesi berstatus selesai × rate per sesi.
          </p>
        </div>
        <div className="flex w-full gap-3 md:w-auto">
          {/* TODO: belum diimplementasi - search trainer belum ada di API fee */}
          <div className="relative flex-1 md:w-64 md:flex-none">
            <span className="material-symbols-outlined pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[20px] text-outline">
              search
            </span>
            <input
              type="text"
              disabled
              placeholder="Cari nama trainer..."
              className="w-full cursor-not-allowed rounded-lg border border-outline-variant bg-surface py-2.5 pl-10 pr-4 font-inter text-body-sm opacity-50"
            />
          </div>
          <Link
            href="/payslip"
            className="flex items-center justify-center gap-2 whitespace-nowrap rounded-lg bg-primary px-6 py-2.5 font-geist text-label-md text-on-primary shadow-sm transition-colors hover:bg-primary-container"
          >
            <span className="material-symbols-outlined text-[18px]">receipt_long</span>
            Kelola Payslip
          </Link>
        </div>
      </div>

      {/* Filter trainer & kelas - mempengaruhi summary card + tabel bareng */}
      <div className="flex flex-col gap-stack-md rounded-xl border border-outline-variant bg-surface-container-lowest p-4 sm:flex-row sm:items-center">
        <div className="flex flex-1 flex-col gap-1.5">
          <label htmlFor="filter-trainer" className="font-geist text-label-sm text-text-muted">
            Trainer
          </label>
          <select
            id="filter-trainer"
            className={inputClass}
            value={trainerFilter}
            onChange={(e) => {
              // Ganti trainer -> reset kelas kalau kelas yg lagi dipilih
              // bukan milik trainer baru ini.
              const newTrainerId = e.target.value;
              const stillValid =
                kelasFilter === "all" ||
                kelasList.find((k) => k.id === kelasFilter)?.trainerId === newTrainerId ||
                newTrainerId === "all";
              const newKelasFilter = stillValid ? kelasFilter : "all";
              applyFilters(periode, newTrainerId, newKelasFilter);
            }}
          >
            <option value="all">Semua Trainer</option>
            {trainers.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nama}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-1 flex-col gap-1.5">
          <label htmlFor="filter-kelas" className="font-geist text-label-sm text-text-muted">
            Kelas
          </label>
          <select
            id="filter-kelas"
            className={inputClass}
            value={kelasFilter}
            onChange={(e) => applyFilters(periode, trainerFilter, e.target.value)}
          >
            <option value="all">Semua Kelas</option>
            {kelasUntukDropdown.map((k) => (
              <option key={k.id} value={k.id}>
                {k.nama}
              </option>
            ))}
          </select>
        </div>
        {(trainerFilter !== "all" || kelasFilter !== "all") && (
          <button
            onClick={() => applyFilters(periode, "all", "all")}
            className="self-start rounded-lg px-3 py-2 font-geist text-label-sm text-text-muted underline underline-offset-4 hover:text-primary sm:self-end"
          >
            Reset filter
          </button>
        )}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 gap-stack-md sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-6 transition-shadow hover:shadow-md">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-success/10">
              <span className="material-symbols-outlined text-success">task_alt</span>
            </div>
            <h3 className="font-geist text-label-md text-text-muted">Sudah Lunas</h3>
          </div>
          <div className="font-geist text-headline-lg text-primary">
            {formatRupiah(totalLunas)}
          </div>
          <div className="mt-2 font-inter text-body-sm text-text-muted">
            {sesiLunas} sesi terbayar
          </div>
        </div>

        <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-6 transition-shadow hover:shadow-md">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-warning/10">
              <span className="material-symbols-outlined text-warning">hourglass_top</span>
            </div>
            <h3 className="font-geist text-label-md text-text-muted">Menunggu Dibayar</h3>
          </div>
          <div className="font-geist text-headline-lg text-primary">
            {formatRupiah(totalBelumDibayar)}
          </div>
          <div className="mt-2 font-inter text-body-sm text-text-muted">
            {sesiBelumDibayarCount} sesi udah di-payslip
          </div>
        </div>

        <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-6 transition-shadow hover:shadow-md">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-secondary-container/10">
              <span className="material-symbols-outlined text-secondary">receipt_long</span>
            </div>
            <h3 className="font-geist text-label-md text-text-muted">Belum Di-payslip</h3>
          </div>
          <div className="font-geist text-headline-lg text-primary">
            {formatRupiah(totalBelumDiPayslip)}
          </div>
          <div className="mt-2 font-inter text-body-sm text-text-muted">
            {sesiBelumDiPayslipCount} sesi selesai, siap di-payslip-kan
          </div>
        </div>

        <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-6 transition-shadow hover:shadow-md">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-container/10">
              <span className="material-symbols-outlined text-primary-container">
                pending_actions
              </span>
            </div>
            <h3 className="font-geist text-label-md text-text-muted">Belum Terlaksana</h3>
          </div>
          <div className="font-geist text-headline-lg text-primary">{sesiBelumTerlaksana}</div>
          <div className="mt-2 font-inter text-body-sm text-text-muted">sesi</div>
        </div>
      </div>

      {/* Tabel detail */}
      <div className="flex flex-col overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest shadow-sm">
        <div className="flex flex-col items-start justify-between gap-3 border-b border-outline-variant bg-surface-container-low px-6 py-4 sm:flex-row sm:items-center">
          <h2 className="font-geist text-headline-sm text-primary">Detail Fee per Trainer</h2>
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
            <label htmlFor="fee-periode" className="font-geist text-label-sm text-text-muted">
              Periode:
            </label>
            <input
              id="fee-periode"
              className={`${inputClass} w-32`}
              placeholder="2026-08"
              value={periode}
              onChange={(e) => setPeriode(e.target.value)}
            />
            <button
              onClick={() => applyFilters(periode, trainerFilter, kelasFilter)}
              className="rounded-lg bg-primary px-4 py-2 font-geist text-label-sm text-on-primary transition-colors hover:bg-primary-container"
            >
              Terapkan
            </button>
            {appliedPeriode && (
              <button
                onClick={() => {
                  setPeriode("");
                  applyFilters("", trainerFilter, kelasFilter);
                }}
                className="rounded-lg px-2 py-2 font-geist text-label-sm text-text-muted underline underline-offset-4 hover:text-primary"
              >
                Reset
              </button>
            )}
          </div>
        </div>

        <div className="w-full overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-outline-variant bg-surface-container-low/50 font-geist text-label-md text-text-muted">
                <th className="p-4 pl-6">Nama Trainer</th>
                <th className="p-4">Total Sesi</th>
                <th className="p-4">Rate Rata-rata</th>
                <th className="p-4">Total Fee</th>
                <th className="p-4 pr-6">Status Pembayaran</th>
              </tr>
            </thead>
            <tbody className="font-inter text-body-sm">
              {rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-6 text-center text-text-muted">
                    Belum ada sesi selesai buat dihitung.
                  </td>
                </tr>
              )}
              {rows.map((r) => {
                // Rate rata-rata diturunin dari data yang ada (total fee / jumlah sesi),
                // bukan angka baru - satu trainer bisa ngajar beberapa kelas dgn rate beda.
                const rataRata = r.jumlahSesi > 0 ? r.totalFee / r.jumlahSesi : 0;
                return (
                  <tr
                    key={r.trainerId}
                    className="border-b border-outline-variant/50 transition-colors hover:bg-neutral-light-bg"
                  >
                    <td className="p-4 pl-6">
                      <div className="flex items-center gap-3">
                        <div
                          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ${avatarClass(
                            r.trainerId
                          )}`}
                        >
                          {initials(r.trainerNama)}
                        </div>
                        <div className="font-medium text-primary">{r.trainerNama}</div>
                      </div>
                    </td>
                    <td className="p-4 text-on-surface-variant">{r.jumlahSesi} Sesi</td>
                    <td className="p-4 text-on-surface-variant">{formatRupiah(rataRata)}</td>
                    <td className="p-4 font-bold text-primary">{formatRupiah(r.totalFee)}</td>
                    <td className="p-4 pr-6">
                      <div className="flex flex-wrap gap-1.5">
                        {r.sesiLunas > 0 && (
                          <span className="inline-flex items-center rounded-full bg-success/10 px-2.5 py-1 text-xs font-medium text-success">
                            {r.sesiLunas} Lunas
                          </span>
                        )}
                        {r.sesiBelumDibayar > 0 && (
                          <span className="inline-flex items-center rounded-full bg-warning/10 px-2.5 py-1 text-xs font-medium text-warning">
                            {r.sesiBelumDibayar} Menunggu
                          </span>
                        )}
                        {r.sesiBelumDiPayslip > 0 && (
                          <span className="inline-flex items-center rounded-full bg-secondary-container/10 px-2.5 py-1 text-xs font-medium text-secondary">
                            {r.sesiBelumDiPayslip} Belum Di-payslip
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {rows.length > 0 && (
              <tfoot>
                <tr className="bg-surface-container-low font-geist">
                  <td className="p-4 pl-6 font-semibold text-primary">Total</td>
                  <td className="p-4 font-semibold text-primary">{totalSesiSelesai} Sesi</td>
                  <td className="p-4" />
                  <td className="p-4 font-bold text-primary">{formatRupiah(total)}</td>
                  <td className="p-4 pr-6" />
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        <div className="flex flex-col items-start justify-between gap-3 border-t border-outline-variant bg-surface-container-lowest px-6 py-4 sm:flex-row sm:items-center">
          <span className="font-inter text-body-sm text-text-muted">
            Menampilkan {rows.length} trainer
          </span>
          {/* TODO: belum diimplementasi - pagination belum ada di API */}
          <div className="flex gap-1">
            <button
              type="button"
              disabled
              aria-label="Halaman sebelumnya (belum tersedia)"
              className="cursor-not-allowed rounded p-1 text-text-muted opacity-50"
            >
              <span className="material-symbols-outlined">chevron_left</span>
            </button>
            <button
              type="button"
              disabled
              aria-label="Halaman berikutnya (belum tersedia)"
              className="cursor-not-allowed rounded p-1 text-text-muted opacity-50"
            >
              <span className="material-symbols-outlined">chevron_right</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
