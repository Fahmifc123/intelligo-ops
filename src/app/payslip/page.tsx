"use client";
import { useEffect, useMemo, useState } from "react";
import { initials, avatarClass, formatRupiah } from "@/lib/ui";

type Trainer = { id: string; nama: string };
type Kelas = { id: string; nama: string; trainerId: string };

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
  jumlahSesi: number;
  totalFee: number;
  sesi: { sesiId: string; pertemuanKe: number; kelasNama: string | null; ratePerSesi: number }[];
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

const BULAN = [
  "01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12",
];
const BULAN_LABEL: Record<string, string> = {
  "01": "Januari", "02": "Februari", "03": "Maret", "04": "April",
  "05": "Mei", "06": "Juni", "07": "Juli", "08": "Agustus",
  "09": "September", "10": "Oktober", "11": "November", "12": "Desember",
};

function currentYear() {
  return new Date().getFullYear();
}

export default function PayslipPage() {
  const [payslips, setPayslips] = useState<Payslip[]>([]);
  const [trainers, setTrainers] = useState<Trainer[]>([]);
  const [kelasList, setKelasList] = useState<Kelas[]>([]);
  const [statusFilter, setStatusFilter] = useState("all");
  const [loading, setLoading] = useState(true);

  const [wizardOpen, setWizardOpen] = useState(false);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [wTrainerId, setWTrainerId] = useState("");
  const [wKelasId, setWKelasId] = useState("");
  const [wSesiDetail, setWSesiDetail] = useState<SesiDetail[]>([]);
  const [wSesiLoading, setWSesiLoading] = useState(false);
  const [wChecked, setWChecked] = useState<Set<string>>(new Set());
  const [wBulan, setWBulan] = useState(BULAN[new Date().getMonth()]);
  const [wTahun, setWTahun] = useState(String(currentYear()));
  const [wCreating, setWCreating] = useState(false);
  const [wMsg, setWMsg] = useState<string | null>(null);

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
    setWTrainerId("");
    setWKelasId("");
    setWSesiDetail([]);
    setWChecked(new Set());
    setWBulan(BULAN[new Date().getMonth()]);
    setWTahun(String(currentYear()));
    setWMsg(null);
    setWizardOpen(true);
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

  const wPeriode = `${wTahun}-${wBulan}`;
  const wCheckedTotal = wSesiDetail
    .filter((s) => wChecked.has(s.sesiId))
    .reduce((sum, s) => sum + s.ratePerSesi, 0);

  async function createPayslip() {
    if (wChecked.size === 0) return;
    setWCreating(true);
    setWMsg(null);
    const res = await fetch("/api/payslip", {
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

  const kelasTrainer = kelasList.filter((k) => k.trainerId === wTrainerId);
  const wTrainerNama = trainers.find((t) => t.id === wTrainerId)?.nama ?? "";
  const wKelasNama = kelasList.find((k) => k.id === wKelasId)?.nama ?? "";

  const visiblePayslips = useMemo(
    () => payslips.filter((p) => statusFilter === "all" || p.status === statusFilter),
    [payslips, statusFilter]
  );

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
              <h2 className="font-geist text-headline-sm text-primary">Buat Payslip Baru</h2>
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

                  {!wSesiLoading && wSesiDetail.length > 0 && (
                    <div className="flex max-h-64 flex-col gap-1 overflow-y-auto rounded-lg border border-outline-variant">
                      {wSesiDetail.map((s) => (
                        <label
                          key={s.sesiId}
                          className={`flex items-center gap-3 border-b border-outline-variant/40 px-4 py-2.5 last:border-b-0 ${
                            s.sudahDiPayslip
                              ? "cursor-not-allowed opacity-50"
                              : "cursor-pointer hover:bg-neutral-light-bg"
                          }`}
                        >
                          <input
                            type="checkbox"
                            disabled={s.sudahDiPayslip}
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
                          {s.sudahDiPayslip && (
                            <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 font-geist text-label-sm text-primary">
                              {s.payslipPeriode}
                            </span>
                          )}
                        </label>
                      ))}
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
                  onClick={createPayslip}
                  disabled={wCreating || wChecked.size === 0}
                  className="flex items-center gap-2 rounded-lg bg-primary px-6 py-2.5 font-geist text-label-md text-on-primary shadow-sm transition-colors hover:bg-primary-container disabled:opacity-50"
                >
                  <span className="material-symbols-outlined text-[18px]">receipt_long</span>
                  {wCreating ? "Membuat..." : "Buat Payslip"}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
