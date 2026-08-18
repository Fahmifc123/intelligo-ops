"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { initials, avatarClass, formatRupiah } from "@/lib/ui";

type FeeRow = {
  trainerId: string;
  trainerNama: string;
  jumlahSesi: number;
  totalFee: number;
};

type Sesi = { id: string; status: string; tanggal: string | null };

export default function FeePage() {
  const [rows, setRows] = useState<FeeRow[]>([]);
  const [sesiList, setSesiList] = useState<Sesi[]>([]);
  const [periode, setPeriode] = useState("");
  const [appliedPeriode, setAppliedPeriode] = useState("");

  async function load(p?: string) {
    const url = p ? `/api/fee?periode=${p}` : "/api/fee";
    const [fee, sesi] = await Promise.all([
      fetch(url).then((r) => r.json()),
      fetch("/api/sesi").then((r) => r.json()),
    ]);
    setRows(fee);
    setSesiList(sesi);
    setAppliedPeriode(p ?? "");
  }

  useEffect(() => {
    load();
  }, []);

  const total = rows.reduce((sum, r) => sum + r.totalFee, 0);
  const totalSesiSelesai = rows.reduce((sum, r) => sum + r.jumlahSesi, 0);

  // "Belum terlaksana" = sesi yang belum ditandai selesai, dihitung dari
  // data sesi beneran (bukan angka mockup). Ikut filter periode kalau ada.
  const sesiBelumTerlaksana = sesiList.filter(
    (s) =>
      s.status !== "selesai" &&
      s.status !== "batal" &&
      (!appliedPeriode || s.tanggal?.startsWith(appliedPeriode))
  ).length;

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

      {/* Summary cards */}
      <div className="grid grid-cols-1 gap-stack-md md:grid-cols-3">
        <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-6 transition-shadow hover:shadow-md">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-secondary-container/10">
              <span className="material-symbols-outlined text-secondary">
                account_balance_wallet
              </span>
            </div>
            <h3 className="font-geist text-label-md text-text-muted">Total Estimasi Fee</h3>
          </div>
          <div className="font-geist text-headline-lg text-primary">{formatRupiah(total)}</div>
          <div className="mt-2 font-inter text-body-sm text-text-muted">
            {appliedPeriode ? `Periode ${appliedPeriode}` : "Semua periode"}
          </div>
        </div>

        <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-6 transition-shadow hover:shadow-md">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-container/10">
              <span className="material-symbols-outlined text-primary-container">
                event_available
              </span>
            </div>
            <h3 className="font-geist text-label-md text-text-muted">Total Sesi Selesai</h3>
          </div>
          <div className="font-geist text-headline-lg text-primary">{totalSesiSelesai}</div>
          <div className="mt-2 font-inter text-body-sm text-text-muted">
            Sesi telah dikonfirmasi
          </div>
        </div>

        <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-6 transition-shadow hover:shadow-md">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-warning/10">
              <span className="material-symbols-outlined text-warning">pending_actions</span>
            </div>
            <h3 className="font-geist text-label-md text-text-muted">Belum Terlaksana</h3>
          </div>
          <div className="font-geist text-headline-lg text-primary">{sesiBelumTerlaksana}</div>
          <div className="mt-2 font-inter text-body-sm text-warning">
            {sesiBelumTerlaksana > 0 ? "Perlu tindakan segera" : "Semua sesi sudah terlaksana"}
          </div>
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
              onClick={() => load(periode || undefined)}
              className="rounded-lg bg-primary px-4 py-2 font-geist text-label-sm text-on-primary transition-colors hover:bg-primary-container"
            >
              Terapkan
            </button>
            {appliedPeriode && (
              <button
                onClick={() => {
                  setPeriode("");
                  load();
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
                <th className="p-4 pr-6">Status</th>
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
                const siapBayar = r.totalFee > 0;
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
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${
                          siapBayar
                            ? "bg-success/10 text-success"
                            : "bg-warning/10 text-warning"
                        }`}
                      >
                        {siapBayar ? "Siap Bayar" : "Rate belum diset"}
                      </span>
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
