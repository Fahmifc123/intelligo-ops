"use client";
import { useEffect, useState } from "react";

type Trainer = { id: string; nama: string };
type Kelas = { id: string; nama: string; trainerId: string; trainerNama: string | null };
type Sesi = {
  id: string;
  kelasId: string;
  kelasNama: string | null;
  pertemuanKe: number;
  tanggal: string | null;
  materi: string | null;
  status: string;
  linkRecord: string | null;
  // null = ngikut trainer utama kelas. Diisi kalau kelasnya diajar gantian.
  trainerId: string | null;
  kelasTrainerId: string | null;
  // Sesi materi rekaman ("Video Course" dkk) - gak ada trainer, gak ada fee.
  tanpaFee: boolean;
};

export default function SesiPage() {
  const [sesiList, setSesiList] = useState<Sesi[]>([]);
  const [kelasList, setKelasList] = useState<Kelas[]>([]);
  const [kelasId, setKelasId] = useState("");
  const [pertemuanKe, setPertemuanKe] = useState("");
  const [tanggal, setTanggal] = useState("");
  const [materi, setMateri] = useState("");
  const [linkRecord, setLinkRecord] = useState("");
  // "" = ikut trainer utama kelas. Diisi kalau sesi ini diajar orang lain.
  const [sesiTrainerId, setSesiTrainerId] = useState("");
  const [trainerList, setTrainerList] = useState<Trainer[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  // Filter tampilan daftar sesi. Dipisah dari `kelasId` (yang dipakai form
  // tambah sesi) biar milih filter nggak ngubah kelas tujuan input.
  const [filterKelasId, setFilterKelasId] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");

  async function load() {
    const [s, k, t] = await Promise.all([
      fetch("/api/sesi").then((r) => r.json()),
      fetch("/api/kelas").then((r) => r.json()),
      fetch("/api/trainer").then((r) => r.json()),
    ]);
    setSesiList(s);
    setKelasList(k);
    setTrainerList(t);
    if (k.length && !kelasId) setKelasId(k[0].id);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function addSesi(e: React.FormEvent) {
    e.preventDefault();
    if (!kelasId || !pertemuanKe) return;
    setLoading(true);
    await fetch("/api/sesi", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kelasId,
        pertemuanKe: Number(pertemuanKe),
        tanggal: tanggal || undefined,
        materi: materi || undefined,
        linkRecord: linkRecord || undefined,
        trainerId: sesiTrainerId || undefined,
      }),
    });
    setPertemuanKe("");
    setTanggal("");
    setMateri("");
    setLinkRecord("");
    setSesiTrainerId("");
    setLoading(false);
    load();
  }

  /** Nama trainer yang ngajar sesi ini (sesi.trainerId ?? trainer kelas). */
  function namaTrainerSesi(s: Sesi): string {
    if (s.tanpaFee) return "Video Course";
    const tid = s.trainerId ?? s.kelasTrainerId;
    return trainerList.find((t) => t.id === tid)?.nama ?? "-";
  }

  /** Ganti trainer sesi langsung dari tabel. "" = balik ke trainer kelas. */
  async function ubahTrainer(s: Sesi, tid: string) {
    await fetch(`/api/sesi/${s.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trainerId: tid }),
    });
    load();
  }

  async function toggleStatus(s: Sesi) {
    const next = s.status === "selesai" ? "belum" : "selesai";
    await fetch(`/api/sesi/${s.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    });
    load();
  }

  const inputClass =
    "w-full rounded-lg border border-outline-variant bg-surface px-3 py-2 font-inter text-body-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-primary";

  // Daftar yang ditampilkan: difilter kelas + status, lalu diurutin nomor
  // pertemuan biar kebaca urut (API balikin urutan insert, bukan urutan sesi).
  const visibleSesi = sesiList
    .filter((s) => filterKelasId === "all" || s.kelasId === filterKelasId)
    .filter((s) =>
      filterStatus === "all"
        ? true
        : filterStatus === "selesai"
          ? s.status === "selesai"
          : s.status !== "selesai"
    )
    .sort((a, b) => {
      const namaA = a.kelasNama ?? "";
      const namaB = b.kelasNama ?? "";
      if (namaA !== namaB) return namaA.localeCompare(namaB);
      return a.pertemuanKe - b.pertemuanKe;
    });

  // Ringkasan progres, ngikut filter kelas yang lagi aktif.
  const scoped = sesiList.filter(
    (s) => filterKelasId === "all" || s.kelasId === filterKelasId
  );
  const jumlahSelesai = scoped.filter((s) => s.status === "selesai").length;
  const jumlahBelum = scoped.length - jumlahSelesai;

  return (
    <div className="flex flex-col gap-stack-lg">
      {/* Header */}
      <div className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-end">
        <div>
          <h1 className="mb-2 font-geist text-headline-lg-mobile text-primary md:text-headline-lg">
            Daftar Sesi
          </h1>
          <p className="font-inter text-body-md text-text-muted">
            Kelola dan pantau status sesi kelas. Ini gantiin file Navigator per trainer.
          </p>
        </div>
        <div className="flex w-full gap-3 md:w-auto">
          <button
            type="button"
            onClick={() => setShowForm((v) => !v)}
            className="flex items-center justify-center gap-2 whitespace-nowrap rounded-lg bg-primary px-6 py-2.5 font-geist text-label-md text-on-primary shadow-sm transition-colors hover:bg-primary-container"
          >
            <span className="material-symbols-outlined text-[18px]">
              {showForm ? "close" : "add"}
            </span>
            {showForm ? "Tutup" : "Tambah Sesi"}
          </button>
        </div>
      </div>

      {/* Form tambah sesi */}
      {showForm && (
        <form
          onSubmit={addSesi}
          className="flex flex-col gap-stack-md rounded-xl border border-outline-variant bg-surface-container-lowest p-6"
        >
          <h2 className="font-geist text-headline-sm text-primary">Tambah Sesi Baru</h2>

          <div className="grid grid-cols-1 gap-stack-md md:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="sesi-kelas" className="font-geist text-label-sm text-text-muted">
                Kelas
              </label>
              <select
                id="sesi-kelas"
                className={inputClass}
                value={kelasId}
                onChange={(e) => setKelasId(e.target.value)}
              >
                {kelasList.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.nama}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="sesi-pertemuan"
                className="font-geist text-label-sm text-text-muted"
              >
                Pertemuan ke-
              </label>
              <input
                id="sesi-pertemuan"
                className={inputClass}
                placeholder="1"
                type="number"
                value={pertemuanKe}
                onChange={(e) => setPertemuanKe(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="sesi-trainer" className="font-geist text-label-sm text-text-muted">
                Trainer
              </label>
              <select
                id="sesi-trainer"
                className={inputClass}
                value={sesiTrainerId}
                onChange={(e) => setSesiTrainerId(e.target.value)}
              >
                {/* Default: ngikut trainer utama kelas. Diganti cuma kalau
                    kelasnya emang diajar gantian. */}
                <option value="">
                  Trainer kelas
                  {kelasList.find((k) => k.id === kelasId)?.trainerNama
                    ? ` (${kelasList.find((k) => k.id === kelasId)?.trainerNama})`
                    : ""}
                </option>
                {trainerList.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nama}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="sesi-tanggal" className="font-geist text-label-sm text-text-muted">
                Tanggal
              </label>
              <input
                id="sesi-tanggal"
                className={inputClass}
                type="date"
                value={tanggal}
                onChange={(e) => setTanggal(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="sesi-link" className="font-geist text-label-sm text-text-muted">
                Link record (opsional)
              </label>
              <input
                id="sesi-link"
                className={inputClass}
                placeholder="https://..."
                value={linkRecord}
                onChange={(e) => setLinkRecord(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5 md:col-span-2">
              <label htmlFor="sesi-materi" className="font-geist text-label-sm text-text-muted">
                Judul materi
              </label>
              <input
                id="sesi-materi"
                className={inputClass}
                placeholder="mis. Pengenalan Machine Learning"
                value={materi}
                onChange={(e) => setMateri(e.target.value)}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading || !kelasList.length}
            className="self-start rounded-lg bg-primary px-6 py-2.5 font-geist text-label-md text-on-primary transition-colors hover:bg-primary-container disabled:opacity-50"
          >
            {loading ? "Menyimpan..." : "Tambah Sesi"}
          </button>
          {!kelasList.length && (
            <p className="font-inter text-body-sm text-warning">
              Tambah kelas dulu sebelum input sesi.
            </p>
          )}
        </form>
      )}

      {/* Filter: pilih kelas dulu, baru status */}
      {sesiList.length > 0 && (
        <div className="flex flex-col gap-stack-md rounded-xl border border-outline-variant bg-surface-container-lowest p-5">
          <div className="flex flex-col gap-stack-md lg:flex-row lg:items-end">
            <div className="flex flex-1 flex-col gap-1.5">
              <label
                htmlFor="filter-kelas"
                className="font-geist text-label-sm text-text-muted"
              >
                Pilih kelas
              </label>
              <select
                id="filter-kelas"
                className={inputClass}
                value={filterKelasId}
                onChange={(e) => setFilterKelasId(e.target.value)}
              >
                <option value="all">Semua kelas ({sesiList.length} sesi)</option>
                {kelasList.map((k) => {
                  const n = sesiList.filter((s) => s.kelasId === k.id).length;
                  return (
                    <option key={k.id} value={k.id}>
                      {k.nama} ({n} sesi)
                    </option>
                  );
                })}
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <span className="font-geist text-label-sm text-text-muted">Status</span>
              <div className="flex gap-2">
                {[
                  { key: "all", label: `Semua (${scoped.length})` },
                  { key: "belum", label: `Belum (${jumlahBelum})` },
                  { key: "selesai", label: `Selesai (${jumlahSelesai})` },
                ].map((opt) => (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => setFilterStatus(opt.key)}
                    className={
                      filterStatus === opt.key
                        ? "rounded-lg bg-primary px-4 py-2 font-geist text-label-sm text-on-primary"
                        : "rounded-lg border border-outline-variant bg-surface px-4 py-2 font-geist text-label-sm text-on-surface-variant transition-colors hover:bg-surface-container"
                    }
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Progress bar - langsung keliatan berapa yang udah kelar */}
          {scoped.length > 0 && (
            <div className="flex items-center gap-3 border-t border-outline-variant/60 pt-4">
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-container-high">
                <div
                  className="h-full rounded-full bg-success transition-all"
                  style={{
                    width: `${Math.round((jumlahSelesai / scoped.length) * 100)}%`,
                  }}
                />
              </div>
              <span className="whitespace-nowrap font-inter text-label-sm text-text-muted">
                {jumlahSelesai} dari {scoped.length} sesi selesai
              </span>
            </div>
          )}
        </div>
      )}

      {/* List sesi */}
      <div className="flex flex-col gap-stack-md">
        {sesiList.length === 0 && (
          <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-6 text-center font-inter text-body-sm text-text-muted">
            Belum ada sesi.
          </div>
        )}

        {sesiList.length > 0 && visibleSesi.length === 0 && (
          <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-6 text-center font-inter text-body-sm text-text-muted">
            Nggak ada sesi yang cocok sama filter ini.
          </div>
        )}

        {visibleSesi.map((s) => {
          const selesai = s.status === "selesai";
          return (
            <div
              key={s.id}
              className={`flex flex-col gap-4 rounded-xl border bg-surface-container-lowest p-5 transition-shadow hover:shadow-md lg:flex-row lg:items-center lg:justify-between ${
                selesai
                  ? "border-outline-variant border-l-4 border-l-success"
                  : "border-outline-variant border-l-4 border-l-warning"
              }`}
            >
              <div className="flex items-start gap-4">
                {/* Nomor sesi jadi penanda utama - nama kelas keulang terus
                    kalau semua sesi dari kelas yang sama. */}
                <div
                  className={`flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-lg ${
                    selesai
                      ? "bg-success/10 text-success"
                      : "bg-surface-container text-on-surface-variant"
                  }`}
                >
                  <span className="font-geist text-label-sm leading-none opacity-70">
                    SESI
                  </span>
                  <span className="font-geist text-body-md font-bold leading-tight">
                    {s.pertemuanKe}
                  </span>
                </div>

                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-geist text-headline-sm text-primary">
                      {s.materi ? s.materi : `Sesi ${s.pertemuanKe}`}
                    </h3>
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-geist text-label-sm ${
                        selesai
                          ? "bg-success/10 text-success"
                          : "bg-warning/10 text-warning"
                      }`}
                    >
                      <span className="material-symbols-outlined text-[14px]">
                        {selesai ? "check_circle" : "schedule"}
                      </span>
                      {selesai ? "Selesai" : "Belum"}
                    </span>
                  </div>

                  <p className="mt-1 font-inter text-body-sm text-text-muted">
                    {s.kelasNama ?? "-"}
                    {s.materi ? ` · Sesi ${s.pertemuanKe}` : ""}
                  </p>

                  <div className="mt-2 flex flex-wrap items-center gap-4 font-inter text-label-sm text-text-muted">
                    <span className="flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-[16px]">schedule</span>
                      {s.tanggal ?? "Tanggal belum diisi"}
                    </span>
                    {/* Sesi Video Course gak punya trainer sama sekali -
                        dropdown ganti trainer gak relevan, cukup label. */}
                    {s.tanpaFee ? (
                      <span className="flex items-center gap-1.5 text-text-muted">
                        <span className="material-symbols-outlined text-[16px]">
                          smart_display
                        </span>
                        Video Course &middot; no fee
                      </span>
                    ) : (
                      // Trainer bisa diganti langsung di sini - kelas yang
                      // diajar gantian gak perlu buka form edit.
                      <span className="flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-[16px]">person</span>
                        <select
                          value={s.trainerId ?? ""}
                          onChange={(e) => ubahTrainer(s, e.target.value)}
                          aria-label={`Trainer sesi ${s.pertemuanKe}`}
                          title={`Trainer: ${namaTrainerSesi(s)}`}
                          className="cursor-pointer rounded border border-transparent bg-transparent py-0.5 pr-1 font-inter text-label-sm text-text-muted transition-colors hover:border-outline-variant hover:text-primary focus:border-outline-variant focus:outline-none"
                        >
                          <option value="">{namaTrainerSesi(s)} (trainer kelas)</option>
                          {trainerList.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.nama}
                            </option>
                          ))}
                        </select>
                      </span>
                    )}
                    {s.linkRecord && (
                      <a
                        href={s.linkRecord}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 text-secondary hover:underline"
                      >
                        <span className="material-symbols-outlined text-[16px]">link</span>
                        Link record
                      </a>
                    )}
                  </div>
                </div>
              </div>

              {/* Tombolnya selalu aksi, bukan status - status udah diwakilin
                  badge + garis kiri, jadi nggak ambigu lagi. */}
              <div className="flex shrink-0 gap-2">
                <button
                  onClick={() => toggleStatus(s)}
                  title={
                    selesai
                      ? "Batalin tanda selesai buat sesi ini"
                      : "Tandai sesi ini selesai"
                  }
                  className={
                    selesai
                      ? "flex items-center justify-center gap-2 rounded-lg border border-outline-variant bg-surface px-5 py-2.5 font-geist text-label-md text-on-surface-variant transition-colors hover:bg-surface-container"
                      : "flex items-center justify-center gap-2 rounded-lg bg-primary px-5 py-2.5 font-geist text-label-md text-on-primary shadow-sm transition-colors hover:bg-primary-container"
                  }
                >
                  <span className="material-symbols-outlined text-[18px]">
                    {selesai ? "undo" : "check_circle"}
                  </span>
                  {selesai ? "Batalkan" : "Tandai Selesai"}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer list */}
      {visibleSesi.length > 0 && (
        <div className="flex flex-col items-start justify-between gap-3 border-t border-outline-variant/60 pt-4 sm:flex-row sm:items-center">
          <span className="font-inter text-body-sm text-text-muted">
            Menampilkan {visibleSesi.length} dari {sesiList.length} sesi
          </span>
          {/* TODO: belum diimplementasi - pagination belum ada di API */}
          <div className="flex gap-2">
            <button
              type="button"
              disabled
              aria-label="Halaman sebelumnya (belum tersedia)"
              className="cursor-not-allowed rounded-lg border border-outline-variant p-1.5 text-text-muted opacity-50"
            >
              <span className="material-symbols-outlined text-[20px]">chevron_left</span>
            </button>
            <button
              type="button"
              disabled
              aria-label="Halaman berikutnya (belum tersedia)"
              className="cursor-not-allowed rounded-lg border border-outline-variant p-1.5 text-text-muted opacity-50"
            >
              <span className="material-symbols-outlined text-[20px]">chevron_right</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
