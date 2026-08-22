"use client";
import { useEffect, useState } from "react";

type Trainer = { id: string; nama: string };
type Kelas = {
  id: string;
  nama: string;
  tipe: string;
  trainerId: string;
  trainerNama: string | null;
  tanggalMulai: string | null;
  navigatorSheetId: string | null;
  navigatorLastSyncedAt: string | null;
};

type Sesi = { id: string; kelasId: string; status: string };

type PreviewResult = {
  sheetId?: string;
  headerRow?: string[];
  detected?: Record<string, number> | null;
  needsManualMapping?: boolean;
  error?: string | null;
};

// Field yang bisa dipetakan ke kolom sheet. Pertemuan & Trainer wajib -
// tanpa dua itu sync gak bisa jalan.
const MAPPABLE_FIELDS = [
  { key: "pertemuan", label: "Pertemuan ke-", wajib: true },
  { key: "trainer", label: "Trainer", wajib: true },
  { key: "tanggal", label: "Tanggal", wajib: false },
  { key: "materi", label: "Judul materi", wajib: false },
  { key: "record", label: "Link record", wajib: false },
];

const TIPE_LABEL: Record<string, string> = {
  bootcamp: "Bootcamp",
  private: "Private",
  mbc: "MBC",
  corporate: "Corporate Training",
};

export default function KelasPage() {
  const [kelasList, setKelasList] = useState<Kelas[]>([]);
  const [trainers, setTrainers] = useState<Trainer[]>([]);
  const [sesiList, setSesiList] = useState<Sesi[]>([]);
  const [nama, setNama] = useState("");
  const [tipe, setTipe] = useState("bootcamp");
  const [trainerId, setTrainerId] = useState("");
  const [rate, setRate] = useState("");
  const [sheetLink, setSheetLink] = useState("");
  const [loading, setLoading] = useState(false);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  // Mapping kolom manual: { pertemuan: 1, trainer: 11, ... }. Dipakai kalau
  // auto-detect gagal, atau kalau admin mau override hasil deteksi.
  const [columnMap, setColumnMap] = useState<Record<string, number>>({});
  const [showManualMap, setShowManualMap] = useState(false);
  const [checking, setChecking] = useState(false);
  const [showForm, setShowForm] = useState(false);
  // Kelas yang lagi diedit. null = form dalam mode "tambah baru".
  const [editId, setEditId] = useState<string | null>(null);
  const [tanggalMulai, setTanggalMulai] = useState("");
  const [formMsg, setFormMsg] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function load() {
    const [k, t, s] = await Promise.all([
      fetch("/api/kelas").then((r) => r.json()),
      fetch("/api/trainer").then((r) => r.json()),
      fetch("/api/sesi").then((r) => r.json()),
    ]);
    setKelasList(k);
    setTrainers(t);
    setSesiList(s);
    if (t.length && !trainerId) setTrainerId(t[0].id);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Progress sesi per kelas - dihitung dari data sesi yang emang kita punya. */
  function progressOf(kelasId: string) {
    const sesiKelas = sesiList.filter((s) => s.kelasId === kelasId);
    const total = sesiKelas.length;
    const selesai = sesiKelas.filter((s) => s.status === "selesai").length;
    return { total, selesai };
  }

  async function checkLink(mapOverride?: Record<string, number>) {
    if (!sheetLink.trim()) return;
    setChecking(true);
    setPreview(null);
    try {
      const map = mapOverride ?? columnMap;
      const res = await fetch("/api/sync/navigator/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          link: sheetLink,
          columnMap: Object.keys(map).length ? map : undefined,
        }),
      });
      const data = await res.json();
      setPreview(data);
      // Auto-detect gagal -> langsung buka form mapping manual, biar admin
      // gak perlu nebak-nebak harus ngapain.
      if (data.needsManualMapping) setShowManualMap(true);
    } catch (e) {
      setPreview({ error: e instanceof Error ? e.message : String(e) });
    }
    setChecking(false);
  }

  function setKolom(field: string, idx: string) {
    const next = { ...columnMap };
    if (idx === "") delete next[field];
    else next[field] = Number(idx);
    setColumnMap(next);
    // Re-validate langsung pakai mapping baru biar admin lihat hasilnya seketika.
    if (next.pertemuan !== undefined && next.trainer !== undefined) checkLink(next);
  }

  function resetForm() {
    setEditId(null);
    setNama("");
    setTipe("bootcamp");
    setTrainerId(trainers[0]?.id ?? "");
    setRate("");
    setTanggalMulai("");
    setSheetLink("");
    setPreview(null);
    setColumnMap({});
    setShowManualMap(false);
    setFormMsg(null);
  }

  /** Isi form dari data kelas yang mau diedit, terus scroll ke form-nya. */
  async function startEdit(k: Kelas) {
    setEditId(k.id);
    setNama(k.nama);
    setTipe(k.tipe);
    setTrainerId(k.trainerId);
    setTanggalMulai(k.tanggalMulai ?? "");
    // Sheet disimpan sebagai ID, bukan URL penuh. Ditampilkan apa adanya -
    // extractSheetId di server nerima dua-duanya, jadi user boleh paste
    // link penuh buat nggantinya.
    setSheetLink(k.navigatorSheetId ?? "");
    setPreview(null);
    setColumnMap({});
    setShowManualMap(false);
    setFormMsg(null);
    setShowForm(true);

    // Rate ada di tabel terpisah, jadi diambil belakangan.
    setRate("");
    try {
      const res = await fetch(`/api/kelas/${k.id}`);
      if (res.ok) {
        const detail = await res.json();
        if (detail.ratePerSesi !== null) setRate(String(detail.ratePerSesi));
      }
    } catch {
      // Rate gagal keambil bukan alasan buat batalin edit - field-nya
      // dibiarin kosong, dan kalau user gak nyentuh, rate lama tetap aman.
    }

    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function submitKelas(e: React.FormEvent) {
    e.preventDefault();
    if (!nama.trim() || !trainerId) return;
    setLoading(true);
    setFormMsg(null);

    try {
      if (editId) {
        const res = await fetch(`/api/kelas/${editId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            nama,
            tipe,
            trainerId,
            tanggalMulai: tanggalMulai || null,
            navigatorSheetId: sheetLink || null,
            // Cuma kirim mapping kalau user emang nyetel ulang di sesi edit
            // ini; kalau nggak, mapping lama di DB dibiarin apa adanya.
            ...(Object.keys(columnMap).length ? { navigatorColumnMap: columnMap } : {}),
            ratePerSesi: rate === "" ? null : Number(rate),
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          setFormMsg(`Gagal: ${data.error ?? "kelas gagal diupdate"}`);
          setLoading(false);
          return;
        }
      } else {
        const res = await fetch("/api/kelas", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            nama,
            tipe,
            trainerId,
            tanggalMulai: tanggalMulai || undefined,
            navigatorSheetId: sheetLink || undefined,
            navigatorColumnMap: Object.keys(columnMap).length ? columnMap : undefined,
          }),
        });
        const newKelas = await res.json();
        if (!res.ok) {
          setFormMsg(`Gagal: ${newKelas.error ?? "kelas gagal dibuat"}`);
          setLoading(false);
          return;
        }
        if (rate) {
          await fetch("/api/fee-rule", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ kelasId: newKelas.id, ratePerSesi: Number(rate) }),
          });
        }
      }

      resetForm();
      setShowForm(false);
      load();
    } catch (err) {
      setFormMsg(`Gagal: ${err instanceof Error ? err.message : String(err)}`);
    }
    setLoading(false);
  }

  async function deleteKelas(k: Kelas) {
    const { total } = progressOf(k.id);
    const konfirmasi =
      total > 0
        ? `Kelas "${k.nama}" masih punya ${total} sesi. Hapus sesinya dulu sebelum kelas bisa dihapus.`
        : `Hapus kelas "${k.nama}"? Tindakan ini gak bisa dibatalin.`;

    if (total > 0) {
      window.alert(konfirmasi);
      return;
    }
    if (!window.confirm(konfirmasi)) return;

    setDeletingId(k.id);
    setFormMsg(null);
    try {
      const res = await fetch(`/api/kelas/${k.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) setFormMsg(`Gagal hapus: ${data.error}`);
      else if (editId === k.id) resetForm();
    } catch (err) {
      setFormMsg(`Gagal hapus: ${err instanceof Error ? err.message : String(err)}`);
    }
    setDeletingId(null);
    load();
  }

  async function syncNow(kelasId: string) {
    setSyncingId(kelasId);
    setSyncMsg(null);
    try {
      const res = await fetch(`/api/sync/navigator?kelasId=${kelasId}`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setSyncMsg(`Gagal: ${data.error}`);
      } else {
        setSyncMsg(
          `Sync selesai: ${data.inserted} sesi baru, ${data.updated} diupdate, ${data.rowsRead} baris dibaca.`
        );
      }
    } catch (e) {
      setSyncMsg(`Gagal: ${e instanceof Error ? e.message : String(e)}`);
    }
    setSyncingId(null);
    load();
  }

  const inputClass =
    "w-full rounded-lg border border-outline-variant bg-surface px-3 py-2 font-inter text-body-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-primary";

  return (
    <div className="flex flex-col gap-stack-lg">
      {/* Header */}
      <div className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-end">
        <div>
          <h1 className="mb-2 font-geist text-headline-lg-mobile text-primary md:text-headline-lg">
            Manajemen Kelas
          </h1>
          <p className="font-inter text-body-md text-text-muted">
            Kelola kelas aktif, assign trainer, dan pantau progres sesi.
          </p>
        </div>
        <div className="flex w-full gap-3 md:w-auto">
          {/* TODO: belum diimplementasi - filter kelas belum ada */}
          <button
            type="button"
            disabled
            className="flex flex-1 cursor-not-allowed items-center justify-center gap-2 rounded-lg border border-outline-variant bg-surface-container-lowest px-5 py-2.5 font-geist text-label-md text-text-muted opacity-50 md:flex-none"
          >
            <span className="material-symbols-outlined text-[18px]">filter_list</span>
            Filter
          </button>
          <button
            type="button"
            onClick={() => {
              if (showForm) {
                resetForm();
                setShowForm(false);
              } else {
                setShowForm(true);
              }
            }}
            className="flex flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-lg bg-secondary-container px-6 py-2.5 font-geist text-label-md text-on-secondary-container shadow-sm transition-colors hover:bg-secondary md:flex-none"
          >
            <span className="material-symbols-outlined text-[18px]">
              {showForm ? "close" : "add"}
            </span>
            {showForm ? "Tutup" : "Tambah Kelas"}
          </button>
        </div>
      </div>

      {/* Form tambah / edit kelas */}
      {showForm && (
        <form
          onSubmit={submitKelas}
          className="flex flex-col gap-stack-md rounded-xl border border-outline-variant bg-surface-container-lowest p-6"
        >
          <div className="flex items-start justify-between gap-4">
            <h2 className="font-geist text-headline-sm text-primary">
              {editId ? `Edit Kelas — ${nama || "tanpa nama"}` : "Buat Kelas Baru"}
            </h2>
            {editId && (
              <button
                type="button"
                onClick={() => {
                  resetForm();
                  setShowForm(false);
                }}
                className="whitespace-nowrap font-geist text-label-sm text-text-muted transition-colors hover:text-primary"
              >
                Batal edit
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 gap-stack-md md:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="kelas-nama" className="font-geist text-label-sm text-text-muted">
                Nama kelas
              </label>
              <input
                id="kelas-nama"
                className={inputClass}
                placeholder="mis. BC DS 17"
                value={nama}
                onChange={(e) => setNama(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="kelas-tipe" className="font-geist text-label-sm text-text-muted">
                Tipe kelas
              </label>
              <select
                id="kelas-tipe"
                className={inputClass}
                value={tipe}
                onChange={(e) => setTipe(e.target.value)}
              >
                <option value="bootcamp">Bootcamp</option>
                <option value="private">Private</option>
                <option value="mbc">MBC</option>
                <option value="corporate">Corporate Training</option>
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="kelas-trainer" className="font-geist text-label-sm text-text-muted">
                Trainer
              </label>
              <select
                id="kelas-trainer"
                className={inputClass}
                value={trainerId}
                onChange={(e) => setTrainerId(e.target.value)}
              >
                {trainers.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nama}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="kelas-rate" className="font-geist text-label-sm text-text-muted">
                Rate per sesi (Rp, opsional)
              </label>
              <input
                id="kelas-rate"
                className={inputClass}
                placeholder="150000"
                type="number"
                value={rate}
                onChange={(e) => setRate(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="kelas-tanggal"
                className="font-geist text-label-sm text-text-muted"
              >
                Tanggal mulai (opsional)
              </label>
              <input
                id="kelas-tanggal"
                className={inputClass}
                type="date"
                value={tanggalMulai}
                onChange={(e) => setTanggalMulai(e.target.value)}
              />
            </div>
          </div>

          <div className="flex flex-col gap-stack-sm">
            <label htmlFor="kelas-sheet" className="font-geist text-label-sm text-text-muted">
              Link Google Sheet Kelas (opsional - Share sheet-nya jadi &quot;Anyone with the
              link&quot; dulu, baru paste link penuhnya di sini)
            </label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                id="kelas-sheet"
                className={inputClass}
                placeholder="https://docs.google.com/spreadsheets/d/....../edit"
                value={sheetLink}
                onChange={(e) => {
                  setSheetLink(e.target.value);
                  setPreview(null);
                  // Link ganti -> mapping kolom lama gak relevan lagi.
                  setColumnMap({});
                  setShowManualMap(false);
                }}
              />
              <button
                type="button"
                onClick={() => checkLink()}
                disabled={!sheetLink.trim() || checking}
                className="whitespace-nowrap rounded-lg border border-outline-variant bg-surface-container-low px-5 py-2 font-geist text-label-md text-primary transition-colors hover:bg-surface-container disabled:opacity-50"
              >
                {checking ? "Ngecek..." : "Cek link"}
              </button>
            </div>

            {preview && preview.error && (
              <p className="rounded-lg border border-error-container bg-error-container/40 p-3 font-inter text-body-sm text-on-error-container">
                {preview.error}
              </p>
            )}

            {/* Mapping kolom manual - muncul otomatis kalau auto-detect gagal,
                atau bisa dibuka manual buat ngoreksi hasil deteksi. */}
            {preview && preview.headerRow && preview.headerRow.length > 0 && (
              <div className="flex flex-col gap-stack-sm">
                <button
                  type="button"
                  onClick={() => setShowManualMap((v) => !v)}
                  className="flex w-fit items-center gap-1.5 font-geist text-label-sm text-text-muted transition-colors hover:text-primary"
                >
                  <span className="material-symbols-outlined text-[16px]">tune</span>
                  {showManualMap ? "Tutup pengaturan kolom" : "Atur kolom manual"}
                </button>

                {showManualMap && (
                  <div className="flex flex-col gap-stack-md rounded-lg border border-outline-variant bg-surface-container-low p-4">
                    <p className="font-inter text-body-sm text-text-muted">
                      Pilih kolom di sheet yang cocok buat tiap data. Kolom bertanda{" "}
                      <span className="text-error">*</span> wajib diisi.
                    </p>
                    <div className="grid grid-cols-1 gap-stack-md sm:grid-cols-2">
                      {MAPPABLE_FIELDS.map((f) => (
                        <div key={f.key} className="flex flex-col gap-1.5">
                          <label
                            htmlFor={`map-${f.key}`}
                            className="font-geist text-label-sm text-text-muted"
                          >
                            {f.label}
                            {f.wajib && <span className="text-error"> *</span>}
                          </label>
                          <select
                            id={`map-${f.key}`}
                            className={inputClass}
                            value={
                              columnMap[f.key] !== undefined
                                ? String(columnMap[f.key])
                                : preview.detected?.[f.key] !== undefined
                                  ? String(preview.detected[f.key])
                                  : ""
                            }
                            onChange={(e) => setKolom(f.key, e.target.value)}
                          >
                            <option value="">— pilih kolom —</option>
                            {preview.headerRow?.map((h, i) =>
                              h ? (
                                <option key={i} value={i}>
                                  {h}
                                </option>
                              ) : null
                            )}
                          </select>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
            {preview && preview.detected && (
              <div className="rounded-lg border border-success/30 bg-success/10 p-3 font-inter text-body-sm text-primary">
                <p className="font-medium">Link valid. Kolom kedetect:</p>
                <ul className="mt-1 list-inside list-disc text-text-muted">
                  {Object.entries(preview.detected).map(([field, idx]) => (
                    <li key={field}>
                      {field} → kolom &quot;{preview.headerRow?.[idx as number]}&quot;
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {formMsg && (
            <p className="rounded-lg border border-error-container bg-error-container/40 p-3 font-inter text-body-sm text-on-error-container">
              {formMsg}
            </p>
          )}

          <button
            type="submit"
            disabled={loading || !trainers.length}
            className="self-start rounded-lg bg-primary px-6 py-2.5 font-geist text-label-md text-on-primary transition-colors hover:bg-primary-container disabled:opacity-50"
          >
            {loading ? "Menyimpan..." : editId ? "Simpan Perubahan" : "Tambah Kelas"}
          </button>
          {!trainers.length && (
            <p className="font-inter text-body-sm text-warning">
              Tambah trainer dulu sebelum bikin kelas.
            </p>
          )}
        </form>
      )}

      {syncMsg && (
        <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-4 font-inter text-body-sm text-on-surface-variant">
          {syncMsg}
        </div>
      )}

      {/* Grid kelas */}
      <div className="grid grid-cols-1 gap-stack-md md:grid-cols-2 lg:grid-cols-3">
        {kelasList.map((k) => {
          const { total, selesai } = progressOf(k.id);
          // "Aktif" kalau udah ada sesi yang jalan, "Persiapan" kalau belum ada sesi sama sekali.
          const aktif = total > 0;
          const pct = total > 0 ? Math.round((selesai / total) * 100) : 0;

          return (
            <div
              key={k.id}
              className="flex flex-col rounded-xl border border-outline-variant bg-surface-container-lowest p-6 transition-shadow hover:shadow-md"
            >
              <div className="mb-3 flex items-start justify-between gap-2">
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-1 font-geist text-label-sm ${
                    aktif ? "bg-success/10 text-success" : "bg-warning/10 text-warning"
                  }`}
                >
                  {aktif ? "Aktif" : "Persiapan"}
                </span>
                <span className="inline-flex items-center rounded-full bg-surface-container px-2.5 py-1 font-geist text-label-sm text-on-surface-variant">
                  {TIPE_LABEL[k.tipe] ?? k.tipe}
                </span>
              </div>

              <h3 className="mb-3 font-geist text-headline-sm text-primary">{k.nama}</h3>

              <div className="flex flex-col gap-2 font-inter text-body-sm text-on-surface-variant">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-[18px] text-outline">
                    person
                  </span>
                  {k.trainerNama ?? "-"}
                </div>
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-[18px] text-outline">
                    event
                  </span>
                  {total > 0 ? `${total} sesi terdaftar` : "Belum ada sesi"}
                </div>
                {k.navigatorLastSyncedAt && (
                  <div className="flex items-center gap-2 text-label-sm text-text-muted">
                    <span className="material-symbols-outlined text-[18px] text-outline">
                      sync
                    </span>
                    Last sync: {new Date(k.navigatorLastSyncedAt).toLocaleString("id-ID")}
                  </div>
                )}
              </div>

              {/* Progress sesi - cuma dirender kalau kelasnya emang punya sesi */}
              <div className="mt-auto border-t border-outline-variant/60 pt-4">
                {total > 0 ? (
                  <div className="flex items-center gap-3">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-container-high">
                      <div
                        className="h-full rounded-full bg-secondary-container transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="whitespace-nowrap font-inter text-label-sm text-text-muted">
                      Sesi {selesai}/{total}
                    </span>
                  </div>
                ) : (
                  <p className="font-inter text-label-sm text-text-muted">
                    Belum ada sesi buat dipantau
                  </p>
                )}
              </div>

              {/* Aksi sync Navigator */}
              <div className="mt-4">
                {k.navigatorSheetId ? (
                  <button
                    onClick={() => syncNow(k.id)}
                    disabled={syncingId === k.id}
                    className="flex w-full items-center justify-center gap-2 rounded-lg border border-outline-variant bg-surface-container-low px-4 py-2 font-geist text-label-sm text-primary transition-colors hover:bg-surface-container disabled:opacity-50"
                  >
                    <span className="material-symbols-outlined text-[16px]">sync</span>
                    {syncingId === k.id ? "Syncing..." : "Sync sekarang"}
                  </button>
                ) : (
                  <p className="text-center font-inter text-label-sm text-text-muted">
                    Belum ada Navigator sheet
                  </p>
                )}
              </div>

              {/* Edit & hapus. Hapus dibikin sekunder (cuma ikon) - dia
                  destruktif dan jauh lebih jarang dipakai daripada edit. */}
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => startEdit(k)}
                  className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-outline-variant bg-surface-container-low px-4 py-2 font-geist text-label-sm text-primary transition-colors hover:bg-surface-container"
                >
                  <span className="material-symbols-outlined text-[16px]">edit</span>
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => deleteKelas(k)}
                  disabled={deletingId === k.id}
                  title={total > 0 ? "Hapus sesinya dulu" : "Hapus kelas"}
                  aria-label={`Hapus kelas ${k.nama}`}
                  className="flex items-center justify-center rounded-lg border border-outline-variant bg-surface-container-low px-3 py-2 font-geist text-label-sm text-error transition-colors hover:bg-error-container disabled:opacity-50"
                >
                  <span className="material-symbols-outlined text-[16px]">
                    {deletingId === k.id ? "hourglass_empty" : "delete"}
                  </span>
                </button>
              </div>
            </div>
          );
        })}

        {/* Card "Buat Kelas Baru" */}
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="flex min-h-[220px] flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-outline-variant bg-transparent p-6 text-center transition-colors hover:border-primary hover:bg-surface-container-lowest"
        >
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-surface-container text-on-surface-variant">
            <span className="material-symbols-outlined">add</span>
          </span>
          <span className="font-geist text-label-md text-primary">Buat Kelas Baru</span>
          <span className="max-w-[220px] font-inter text-body-sm text-text-muted">
            Siapkan kurikulum dan assign trainer untuk kelas baru.
          </span>
        </button>
      </div>
    </div>
  );
}
