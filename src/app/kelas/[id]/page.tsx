"use client";
import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { rupiahRingkas as rupiah, TIPE_LABEL, STATUS_BADGE, sheetUrl } from "@/lib/ui";

type TrainerRingkas = {
  trainerId: string;
  trainerNama: string;
  utama: boolean;
  skema: string;
  ratePerSesi: number | null;
  totalPaket: number | null;
  targetSesi: number | null;
};

type KelasDetail = {
  id: string;
  nama: string;
  tipe: string;
  trainerId: string;
  trainerNama: string | null;
  tanggalMulai: string | null;
  polaPembayaran: "akhir" | "bulanan";
  navigatorSheetId: string | null;
  navigatorTabName: string | null;
  navigatorLastSyncedAt: string | null;
  trainers: TrainerRingkas[];
};

// Bentuk kelas dari /api/kelas (list) - bukan detail, tapi ada status &
// analytics fee yang gak ikut dibalikin sama /api/kelas/[id].
type KelasRingkas = {
  id: string;
  status: "persiapan" | "aktif" | "selesai" | "lunas";
  totalFeeKelas: number;
  feeLunasKelas: number;
  trainers: (TrainerRingkas & { jumlahSesi: number; sesiSelesai: number; totalFee: number; feeLunas: number })[];
};

type Sesi = {
  id: string;
  pertemuanKe: number;
  tanggal: string | null;
  materi: string | null;
  status: string;
  linkRecord: string | null;
  trainerId: string | null;
};

export default function KelasDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const kelasId = params.id;

  const [kelas, setKelas] = useState<KelasDetail | null>(null);
  const [ringkas, setRingkas] = useState<KelasRingkas | null>(null);
  const [sesiList, setSesiList] = useState<Sesi[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function load() {
    const [detailRes, listRes, sesiRes] = await Promise.all([
      fetch(`/api/kelas/${kelasId}`),
      fetch("/api/kelas"),
      fetch(`/api/sesi?kelasId=${kelasId}`),
    ]);

    if (!detailRes.ok) {
      setNotFound(true);
      setLoading(false);
      return;
    }

    const detail = await detailRes.json();
    const list: KelasRingkas[] = await listRes.json();
    const s = await sesiRes.json();

    setKelas(detail);
    setRingkas(list.find((k) => k.id === kelasId) ?? null);
    setSesiList(s);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kelasId]);

  async function syncNow() {
    setSyncing(true);
    setSyncMsg(null);
    try {
      const res = await fetch(`/api/sync/navigator?kelasId=${kelasId}`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) setSyncMsg(`Gagal: ${data.error}`);
      else
        setSyncMsg(
          `Sync selesai: ${data.inserted} sesi baru, ${data.updated} diupdate, ${data.rowsRead} baris dibaca.`
        );
    } catch (e) {
      setSyncMsg(`Gagal: ${e instanceof Error ? e.message : String(e)}`);
    }
    setSyncing(false);
    load();
  }

  async function copyLink() {
    if (!kelas?.navigatorSheetId) return;
    try {
      await navigator.clipboard.writeText(sheetUrl(kelas.navigatorSheetId));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API bisa ditolak browser (mis. bukan HTTPS/localhost) -
      // link-nya tetap kelihatan & bisa di-klik manual, jadi gak fatal.
    }
  }

  if (loading) {
    return <p className="font-inter text-body-sm text-text-muted">Memuat...</p>;
  }

  if (notFound || !kelas) {
    return (
      <div className="flex flex-col items-start gap-3">
        <p className="font-inter text-body-md text-text-muted">Kelas gak ditemukan.</p>
        <Link href="/kelas" className="font-geist text-label-md text-primary hover:underline">
          &larr; Balik ke Manajemen Kelas
        </Link>
      </div>
    );
  }

  const badge = STATUS_BADGE[ringkas?.status ?? "persiapan"] ?? STATUS_BADGE.persiapan;
  const totalSesi = sesiList.length;
  const sesiSelesai = sesiList.filter((s) => s.status === "selesai").length;
  const pct = totalSesi > 0 ? Math.round((sesiSelesai / totalSesi) * 100) : 0;
  const namaTrainerById = Object.fromEntries(
    kelas.trainers.map((t) => [t.trainerId, t.trainerNama])
  );

  return (
    <div className="flex flex-col gap-stack-lg">
      <div>
        <Link
          href="/kelas"
          className="mb-3 inline-flex items-center gap-1 font-geist text-label-sm text-text-muted transition-colors hover:text-primary"
        >
          <span className="material-symbols-outlined text-[16px]">arrow_back</span>
          Manajemen Kelas
        </Link>

        <div className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-end">
          <div>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span
                className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-geist text-label-sm ${badge.kelas}`}
              >
                <span className="material-symbols-outlined text-[14px]">{badge.ikon}</span>
                {badge.label}
              </span>
              <span className="inline-flex items-center rounded-full bg-surface-container px-2.5 py-1 font-geist text-label-sm text-on-surface-variant">
                {TIPE_LABEL[kelas.tipe] ?? kelas.tipe}
              </span>
            </div>
            <h1 className="font-geist text-headline-lg-mobile text-primary md:text-headline-lg">
              {kelas.nama}
            </h1>
          </div>
          <button
            type="button"
            onClick={() => router.push(`/kelas?edit=${kelas.id}`)}
            className="flex items-center gap-2 whitespace-nowrap rounded-lg border border-outline-variant bg-surface-container-lowest px-5 py-2.5 font-geist text-label-md text-primary transition-colors hover:bg-surface-container"
          >
            <span className="material-symbols-outlined text-[18px]">edit</span>
            Edit kelas
          </button>
        </div>
      </div>

      {/* Ringkasan progres sesi */}
      <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 font-inter text-body-sm text-on-surface-variant">
            <span className="material-symbols-outlined text-[18px] text-outline">event</span>
            {totalSesi > 0 ? `${sesiSelesai}/${totalSesi} sesi selesai` : "Belum ada sesi"}
          </div>
          {kelas.tanggalMulai && (
            <div className="flex items-center gap-2 font-inter text-body-sm text-text-muted">
              <span className="material-symbols-outlined text-[18px] text-outline">
                calendar_today
              </span>
              Mulai {kelas.tanggalMulai}
            </div>
          )}
          <div className="flex items-center gap-2 font-inter text-body-sm text-text-muted">
            <span className="material-symbols-outlined text-[18px] text-outline">payments</span>
            Fee dibayar{" "}
            {kelas.polaPembayaran === "bulanan" ? "diakumulasi tiap bulan" : "di akhir kelas"}
          </div>
        </div>
        {totalSesi > 0 && (
          <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-surface-container-high">
            <div
              className="h-full rounded-full bg-secondary-container transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
        )}
      </div>

      {/* Sumber data: Navigator sheet - didokumentasikan jelas di sini biar
          gampang dicek/dibuka lagi kapanpun, gak cuma keliatan pas edit. */}
      <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-6">
        <h2 className="mb-3 font-geist text-headline-sm text-primary">Sumber Data Navigator</h2>

        {kelas.navigatorSheetId ? (
          <div className="flex flex-col gap-stack-sm">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <a
                href={sheetUrl(kelas.navigatorSheetId)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex flex-1 items-center gap-2 truncate rounded-lg border border-outline-variant bg-surface px-3 py-2 font-inter text-body-sm text-secondary hover:underline"
              >
                <span className="material-symbols-outlined shrink-0 text-[18px] text-outline">
                  description
                </span>
                <span className="truncate">{sheetUrl(kelas.navigatorSheetId)}</span>
                <span className="material-symbols-outlined ml-auto shrink-0 text-[16px] text-outline">
                  open_in_new
                </span>
              </a>
              <button
                type="button"
                onClick={copyLink}
                className="flex items-center justify-center gap-2 whitespace-nowrap rounded-lg border border-outline-variant bg-surface-container-low px-4 py-2 font-geist text-label-sm text-primary transition-colors hover:bg-surface-container"
              >
                <span className="material-symbols-outlined text-[16px]">
                  {copied ? "check" : "content_copy"}
                </span>
                {copied ? "Disalin" : "Salin link"}
              </button>
            </div>

            <p className="font-inter text-label-sm text-text-muted">
              Tab yang dibaca: <span className="font-medium text-on-surface-variant">
                {kelas.navigatorTabName || "Sheet1 (default)"}
              </span>
            </p>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="font-inter text-label-sm text-text-muted">
                {kelas.navigatorLastSyncedAt
                  ? `Last sync: ${new Date(kelas.navigatorLastSyncedAt).toLocaleString("id-ID")}`
                  : "Belum pernah di-sync"}
              </p>
              <button
                type="button"
                onClick={syncNow}
                disabled={syncing}
                className="flex items-center gap-2 rounded-lg border border-outline-variant bg-surface-container-low px-4 py-2 font-geist text-label-sm text-primary transition-colors hover:bg-surface-container disabled:opacity-50"
              >
                <span className="material-symbols-outlined text-[16px]">sync</span>
                {syncing ? "Syncing..." : "Sync sekarang"}
              </button>
            </div>

            {syncMsg && (
              <p className="rounded-lg border border-outline-variant bg-surface-container-low p-3 font-inter text-body-sm text-on-surface-variant">
                {syncMsg}
              </p>
            )}
          </div>
        ) : (
          <p className="font-inter text-body-sm text-text-muted">
            Kelas ini belum disambungkan ke Google Sheet Navigator manapun. Sesi diisi
            manual. Sambungkan lewat tombol &quot;Edit kelas&quot; di atas kalau kelas ini
            punya sheet Navigator.
          </p>
        )}
      </div>

      {/* Fee per trainer */}
      {ringkas && ringkas.trainers.length > 0 && (
        <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-6">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-geist text-headline-sm text-primary">Trainer &amp; Fee</h2>
            {ringkas.trainers.length > 1 && (
              <span className="font-geist text-label-md text-primary tabular-nums">
                Total {rupiah(ringkas.totalFeeKelas)}
              </span>
            )}
          </div>
          <div className="flex flex-col divide-y divide-outline-variant/60">
            {ringkas.trainers.map((t) => (
              <div key={t.trainerId} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="flex items-center gap-2">
                  <span className="font-geist text-label-md text-primary">{t.trainerNama}</span>
                  {t.utama && (
                    <span className="rounded-full bg-surface-container px-2 py-0.5 font-inter text-label-sm text-text-muted">
                      utama
                    </span>
                  )}
                  {t.skema === "paket" && (
                    <span className="rounded bg-surface-container px-1.5 py-0.5 font-geist text-label-sm text-text-muted">
                      paket
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-4 font-inter text-body-sm text-text-muted">
                  <span className="tabular-nums">
                    {t.sesiSelesai}/{t.jumlahSesi} sesi
                  </span>
                  {t.ratePerSesi !== null && (
                    <span className="tabular-nums">{rupiah(t.ratePerSesi)}/sesi</span>
                  )}
                  <span className="font-geist text-label-md text-primary tabular-nums">
                    {rupiah(t.totalFee)}
                  </span>
                </div>
              </div>
            ))}
          </div>
          {ringkas.totalFeeKelas > ringkas.feeLunasKelas && (
            <p className="mt-3 font-inter text-label-sm text-secondary">
              Belum dibayar: {rupiah(ringkas.totalFeeKelas - ringkas.feeLunasKelas)}
              {ringkas.feeLunasKelas > 0 && ` dari ${rupiah(ringkas.totalFeeKelas)}`}
            </p>
          )}
        </div>
      )}

      {/* Daftar sesi */}
      <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-geist text-headline-sm text-primary">
            Sesi ({sesiList.length})
          </h2>
          <Link
            href={`/sesi?kelasId=${kelas.id}`}
            className="font-geist text-label-sm text-primary hover:underline"
          >
            Kelola sesi &rarr;
          </Link>
        </div>

        {sesiList.length === 0 ? (
          <p className="font-inter text-body-sm text-text-muted">Belum ada sesi.</p>
        ) : (
          <div className="w-full overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-outline-variant font-geist text-label-sm text-text-muted">
                  <th className="py-2 pr-3">Sesi</th>
                  <th className="py-2 pr-3">Tanggal</th>
                  <th className="py-2 pr-3">Materi</th>
                  <th className="py-2 pr-3">Trainer</th>
                  <th className="py-2 pr-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {[...sesiList]
                  .sort((a, b) => a.pertemuanKe - b.pertemuanKe)
                  .map((s) => (
                    <tr
                      key={s.id}
                      className="border-b border-outline-variant/60 font-inter text-body-sm last:border-0"
                    >
                      <td className="py-2 pr-3 tabular-nums">{s.pertemuanKe}</td>
                      <td className="py-2 pr-3 text-text-muted">{s.tanggal ?? "-"}</td>
                      <td className="py-2 pr-3">{s.materi ?? "-"}</td>
                      <td className="py-2 pr-3 text-text-muted">
                        {namaTrainerById[s.trainerId ?? ""] ?? kelas.trainerNama ?? "-"}
                      </td>
                      <td className="py-2 pr-3">
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 font-geist text-label-sm ${
                            s.status === "selesai"
                              ? "bg-success/10 text-success"
                              : "bg-warning/10 text-warning"
                          }`}
                        >
                          {s.status === "selesai" ? "Selesai" : "Belum"}
                        </span>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
