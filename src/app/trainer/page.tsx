"use client";
import { useEffect, useState } from "react";
import { initials, avatarClass } from "@/lib/ui";

type Trainer = {
  id: string;
  nama: string;
  tipe: "trainer" | "karyawan";
  posisi: string | null;
  email: string | null;
  bankName: string | null;
  bankAccountNumber: string | null;
  bankAccountName: string | null;
};

const inputClass =
  "w-full rounded-lg border border-outline-variant bg-surface px-3 py-2 font-inter text-body-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-primary";

export default function TrainerPage() {
  const [trainers, setTrainers] = useState<Trainer[]>([]);
  const [nama, setNama] = useState("");
  // Trainer beneran (ngajar kelas) vs karyawan non-trainer (marketing,
  // admin, dst) - satu tabel, dibedain kolom tipe. Karyawan butuh posisi,
  // gak butuh email (email cuma dipakai buat sync rekening trainer).
  const [tipe, setTipe] = useState<"trainer" | "karyawan">("trainer");
  const [posisi, setPosisi] = useState("");
  const [email, setEmail] = useState("");
  const [bankName, setBankName] = useState("");
  const [bankAccountNumber, setBankAccountNumber] = useState("");
  const [bankAccountName, setBankAccountName] = useState("");
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [formMsg, setFormMsg] = useState<string | null>(null);

  // Trainer yang lagi diedit inline di tabel. null = gak ada yang diedit.
  const [editId, setEditId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Partial<Trainer>>({});
  const [editSaving, setEditSaving] = useState(false);

  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Filter tampilan - "all" default, atau cuma trainer / cuma karyawan.
  const [filterTipe, setFilterTipe] = useState<"all" | "trainer" | "karyawan">("all");

  // Sync data rekening dari Google Form pendaftaran trainer.
  const [showSync, setShowSync] = useState(false);
  const [syncLink, setSyncLink] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/trainer?tipe=all");
    setTrainers(await res.json());
  }

  useEffect(() => {
    load();
  }, []);

  async function addTrainer(e: React.FormEvent) {
    e.preventDefault();
    if (!nama.trim()) return;
    if (tipe === "karyawan" && !posisi.trim()) return;
    setLoading(true);
    setFormMsg(null);
    try {
      const res = await fetch("/api/trainer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nama,
          tipe,
          posisi: tipe === "karyawan" ? posisi : undefined,
          email: email || undefined,
          bankName: bankName || undefined,
          bankAccountNumber: bankAccountNumber || undefined,
          bankAccountName: bankAccountName || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFormMsg(`Gagal: ${data.error ?? "data gagal ditambahkan"}`);
        setLoading(false);
        return;
      }
      setNama("");
      setTipe("trainer");
      setPosisi("");
      setEmail("");
      setBankName("");
      setBankAccountNumber("");
      setBankAccountName("");
      setShowForm(false);
      load();
    } catch (err) {
      setFormMsg(`Gagal: ${err instanceof Error ? err.message : String(err)}`);
    }
    setLoading(false);
  }

  function startEdit(t: Trainer) {
    setEditId(t.id);
    setEditDraft({
      nama: t.nama,
      posisi: t.posisi ?? "",
      email: t.email ?? "",
      bankName: t.bankName ?? "",
      bankAccountNumber: t.bankAccountNumber ?? "",
      bankAccountName: t.bankAccountName ?? "",
    });
  }

  async function saveEdit() {
    if (!editId) return;
    setEditSaving(true);
    const res = await fetch(`/api/trainer/${editId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editDraft),
    });
    if (res.ok) {
      setEditId(null);
      load();
    }
    setEditSaving(false);
  }

  async function deleteTrainer(t: Trainer) {
    const label = t.tipe === "karyawan" ? "karyawan" : "trainer";
    if (!window.confirm(`Hapus ${label} "${t.nama}"? Tindakan ini gak bisa dibatalin.`)) return;
    setDeletingId(t.id);
    const res = await fetch(`/api/trainer/${t.id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      window.alert(data.error ?? `Gagal hapus ${label}.`);
    }
    setDeletingId(null);
    load();
  }

  async function syncBankInfo() {
    if (!syncLink.trim()) return;
    setSyncing(true);
    setSyncMsg(null);
    try {
      const res = await fetch("/api/sync/trainer-bank", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ link: syncLink }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSyncMsg(`Gagal: ${data.error}`);
      } else {
        setSyncMsg(
          `Sync selesai: ${data.updated} trainer diupdate dari ${data.rowsRead} baris.` +
            (data.unmatchedEmails.length > 0
              ? ` ${data.unmatchedEmails.length} email di form gak ketemu trainer manapun (cek email trainer di sistem udah sama persis).`
              : "")
        );
        load();
      }
    } catch (e) {
      setSyncMsg(`Gagal: ${e instanceof Error ? e.message : String(e)}`);
    }
    setSyncing(false);
  }

  const visibleTrainers = trainers.filter(
    (t) => filterTipe === "all" || t.tipe === filterTipe
  );

  return (
    <div className="flex flex-col gap-stack-lg">
      {/* Header */}
      <div className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-end">
        <div>
          <h1 className="mb-2 font-geist text-headline-lg-mobile text-primary md:text-headline-lg">
            Trainer & Karyawan
          </h1>
          <p className="font-inter text-body-md text-text-muted">
            Kelola data trainer yang mengajar di kelas, maupun karyawan non-trainer
            (marketing, admin, dst) buat keperluan payslip.
          </p>
        </div>
        <div className="flex w-full gap-3 md:w-auto">
          <button
            type="button"
            onClick={() => setShowSync((v) => !v)}
            className="flex flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-lg border border-outline-variant bg-surface-container-lowest px-5 py-2.5 font-geist text-label-md text-primary transition-colors hover:bg-surface-container md:flex-none"
          >
            <span className="material-symbols-outlined text-[18px]">sync</span>
            Sync Rekening
          </button>
          <button
            type="button"
            onClick={() => setShowForm((v) => !v)}
            className="flex flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-lg bg-primary px-6 py-2.5 font-geist text-label-md text-on-primary shadow-sm transition-colors hover:bg-primary-container md:flex-none"
          >
            <span className="material-symbols-outlined text-[18px]">
              {showForm ? "close" : "add"}
            </span>
            {showForm ? "Tutup" : "Add Data"}
          </button>
        </div>
      </div>

      {/* Sync rekening dari Google Form */}
      {showSync && (
        <div className="flex flex-col gap-stack-sm rounded-xl border border-outline-variant bg-surface-container-lowest p-6">
          <h2 className="font-geist text-headline-sm text-primary">
            Sync Data Rekening dari Google Form
          </h2>
          <p className="font-inter text-body-sm text-text-muted">
            Tarik Nama Bank, Nomor Rekening, dan Nama Pemilik Rekening dari sheet Google Form
            pendaftaran trainer. Dicocokkan berdasarkan <strong>email</strong> - pastikan email
            trainer di sistem ini sama persis dengan &quot;Email Aktif&quot; di form.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              className={inputClass}
              placeholder="https://docs.google.com/spreadsheets/d/....../edit"
              value={syncLink}
              onChange={(e) => setSyncLink(e.target.value)}
            />
            <button
              type="button"
              onClick={syncBankInfo}
              disabled={!syncLink.trim() || syncing}
              className="whitespace-nowrap rounded-lg bg-primary px-5 py-2 font-geist text-label-md text-on-primary transition-colors hover:bg-primary-container disabled:opacity-50"
            >
              {syncing ? "Syncing..." : "Sync sekarang"}
            </button>
          </div>
          {syncMsg && (
            <p className="rounded-lg border border-outline-variant bg-surface-container-low p-3 font-inter text-body-sm text-on-surface-variant">
              {syncMsg}
            </p>
          )}
        </div>
      )}

      {/* Form tambah trainer/karyawan */}
      {showForm && (
        <form
          onSubmit={addTrainer}
          className="flex flex-col gap-stack-md rounded-xl border border-outline-variant bg-surface-container-lowest p-6"
        >
          <h2 className="font-geist text-headline-sm text-primary">Tambah Data Baru</h2>

          <div className="flex flex-col gap-1.5">
            <span className="font-geist text-label-sm text-text-muted">Tipe</span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setTipe("trainer")}
                className={
                  tipe === "trainer"
                    ? "rounded-lg bg-primary px-4 py-2 font-geist text-label-sm text-on-primary"
                    : "rounded-lg border border-outline-variant bg-surface px-4 py-2 font-geist text-label-sm text-on-surface-variant transition-colors hover:bg-surface-container"
                }
              >
                Trainer
              </button>
              <button
                type="button"
                onClick={() => setTipe("karyawan")}
                className={
                  tipe === "karyawan"
                    ? "rounded-lg bg-primary px-4 py-2 font-geist text-label-sm text-on-primary"
                    : "rounded-lg border border-outline-variant bg-surface px-4 py-2 font-geist text-label-sm text-on-surface-variant transition-colors hover:bg-surface-container"
                }
              >
                Karyawan (non-trainer)
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-stack-md md:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="trainer-nama"
                className="font-geist text-label-sm text-text-muted"
              >
                Nama {tipe === "karyawan" ? "karyawan" : "trainer"}
              </label>
              <input
                id="trainer-nama"
                className={inputClass}
                placeholder={tipe === "karyawan" ? "Nama karyawan" : "Nama trainer"}
                value={nama}
                onChange={(e) => setNama(e.target.value)}
              />
            </div>

            {tipe === "karyawan" && (
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="trainer-posisi"
                  className="font-geist text-label-sm text-text-muted"
                >
                  Posisi
                </label>
                <input
                  id="trainer-posisi"
                  className={inputClass}
                  placeholder="mis. Marketing, Admin, Finance"
                  value={posisi}
                  onChange={(e) => setPosisi(e.target.value)}
                />
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="trainer-email"
                className="font-geist text-label-sm text-text-muted"
              >
                Email{tipe === "trainer" ? " (dipakai buat sync rekening)" : ""}
              </label>
              <input
                id="trainer-email"
                className={inputClass}
                placeholder="nama@intelligo.id"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="trainer-bank"
                className="font-geist text-label-sm text-text-muted"
              >
                Nama bank (opsional)
              </label>
              <input
                id="trainer-bank"
                className={inputClass}
                placeholder="Bank Rakyat Indonesia"
                value={bankName}
                onChange={(e) => setBankName(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="trainer-rekening"
                className="font-geist text-label-sm text-text-muted"
              >
                Nomor rekening (opsional)
              </label>
              <input
                id="trainer-rekening"
                className={inputClass}
                placeholder="455101001888501"
                value={bankAccountNumber}
                onChange={(e) => setBankAccountNumber(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5 md:col-span-2">
              <label
                htmlFor="trainer-pemilik"
                className="font-geist text-label-sm text-text-muted"
              >
                Nama pemilik rekening (opsional - kalau beda dari nama di atas)
              </label>
              <input
                id="trainer-pemilik"
                className={inputClass}
                placeholder="Kevyn Alifian Hernanda Wibowo"
                value={bankAccountName}
                onChange={(e) => setBankAccountName(e.target.value)}
              />
            </div>
          </div>

          {formMsg && (
            <p className="rounded-lg border border-error-container bg-error-container/40 p-3 font-inter text-body-sm text-on-error-container">
              {formMsg}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="self-start rounded-lg bg-primary px-6 py-2.5 font-geist text-label-md text-on-primary transition-colors hover:bg-primary-container disabled:opacity-50"
          >
            {loading ? "Menyimpan..." : "Tambah"}
          </button>
        </form>
      )}

      {/* Filter tipe */}
      <div className="flex flex-wrap gap-2">
        {[
          { key: "all" as const, label: "Semua" },
          { key: "trainer" as const, label: "Trainer" },
          { key: "karyawan" as const, label: "Karyawan" },
        ].map((opt) => (
          <button
            key={opt.key}
            type="button"
            onClick={() => setFilterTipe(opt.key)}
            className={
              filterTipe === opt.key
                ? "rounded-lg bg-primary px-4 py-2 font-geist text-label-sm text-on-primary"
                : "rounded-lg border border-outline-variant bg-surface px-4 py-2 font-geist text-label-sm text-on-surface-variant transition-colors hover:bg-surface-container"
            }
          >
            {opt.label}
            {opt.key !== "all" &&
              ` (${trainers.filter((t) => t.tipe === opt.key).length})`}
          </button>
        ))}
      </div>

      {/* Tabel trainer & karyawan */}
      <div className="flex flex-col overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest shadow-sm">
        <div className="w-full overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-outline-variant bg-surface-container-low/50 font-geist text-label-md text-text-muted">
                <th className="p-4 pl-6">Name</th>
                <th className="p-4">Posisi / Contact</th>
                <th className="p-4">Rekening</th>
                <th className="p-4 pr-6 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="font-inter text-body-sm">
              {visibleTrainers.length === 0 && (
                <tr>
                  <td
                    colSpan={4}
                    className="p-6 text-center font-inter text-body-sm text-text-muted"
                  >
                    Belum ada data.
                  </td>
                </tr>
              )}
              {visibleTrainers.map((t) =>
                editId === t.id ? (
                  <tr key={t.id} className="border-b border-outline-variant/50 bg-surface-container-low/40">
                    <td className="p-3 pl-6" colSpan={4}>
                      <div className="flex flex-col gap-2">
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-6">
                          <input
                            className={inputClass}
                            placeholder="Nama"
                            value={editDraft.nama ?? ""}
                            onChange={(e) => setEditDraft((d) => ({ ...d, nama: e.target.value }))}
                          />
                          {t.tipe === "karyawan" && (
                            <input
                              className={inputClass}
                              placeholder="Posisi"
                              value={editDraft.posisi ?? ""}
                              onChange={(e) => setEditDraft((d) => ({ ...d, posisi: e.target.value }))}
                            />
                          )}
                          <input
                            className={inputClass}
                            placeholder="Email"
                            value={editDraft.email ?? ""}
                            onChange={(e) => setEditDraft((d) => ({ ...d, email: e.target.value }))}
                          />
                          <input
                            className={inputClass}
                            placeholder="Nama bank"
                            value={editDraft.bankName ?? ""}
                            onChange={(e) => setEditDraft((d) => ({ ...d, bankName: e.target.value }))}
                          />
                          <input
                            className={inputClass}
                            placeholder="Nomor rekening"
                            value={editDraft.bankAccountNumber ?? ""}
                            onChange={(e) =>
                              setEditDraft((d) => ({ ...d, bankAccountNumber: e.target.value }))
                            }
                          />
                          <input
                            className={inputClass}
                            placeholder="Nama pemilik rekening"
                            value={editDraft.bankAccountName ?? ""}
                            onChange={(e) =>
                              setEditDraft((d) => ({ ...d, bankAccountName: e.target.value }))
                            }
                          />
                        </div>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={saveEdit}
                            disabled={editSaving}
                            className="rounded-lg bg-primary px-4 py-1.5 font-geist text-label-sm text-on-primary transition-colors hover:bg-primary-container disabled:opacity-50"
                          >
                            {editSaving ? "Menyimpan..." : "Simpan"}
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditId(null)}
                            className="rounded-lg border border-outline-variant px-4 py-1.5 font-geist text-label-sm text-text-muted transition-colors hover:bg-surface-container"
                          >
                            Batal
                          </button>
                        </div>
                      </div>
                    </td>
                  </tr>
                ) : (
                  <tr
                    key={t.id}
                    className="border-b border-outline-variant/50 transition-colors last:border-b-0 hover:bg-neutral-light-bg"
                  >
                    <td className="p-4 pl-6">
                      <div className="flex items-center gap-3">
                        <div
                          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold ${avatarClass(
                            t.id
                          )}`}
                        >
                          {initials(t.nama)}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-primary">{t.nama}</span>
                            {t.tipe === "karyawan" && (
                              <span className="rounded-full bg-surface-container px-2 py-0.5 font-geist text-label-sm text-on-surface-variant">
                                Karyawan
                              </span>
                            )}
                          </div>
                          <div className="font-inter text-label-sm text-text-muted">
                            ID: {t.id.slice(0, 8)}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="p-4 text-text-muted">
                      {t.tipe === "karyawan" ? (
                        <div className="flex flex-col">
                          <span>{t.posisi ?? "-"}</span>
                          {t.email && (
                            <span className="font-inter text-label-sm text-text-muted">
                              {t.email}
                            </span>
                          )}
                        </div>
                      ) : (
                        (t.email ?? "-")
                      )}
                    </td>
                    <td className="p-4 text-text-muted">
                      {t.bankName ? (
                        <div className="flex flex-col">
                          <span>{t.bankName}</span>
                          <span className="font-inter text-label-sm text-text-muted">
                            {t.bankAccountNumber}
                            {t.bankAccountName ? ` · ${t.bankAccountName}` : ""}
                          </span>
                        </div>
                      ) : (
                        <span className="font-inter text-label-sm text-warning">Belum diisi</span>
                      )}
                    </td>
                    <td className="p-4 pr-6 text-right">
                      <div className="flex justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => startEdit(t)}
                          aria-label={`Edit ${t.nama}`}
                          className="rounded p-1.5 text-text-muted transition-colors hover:bg-surface-container hover:text-primary"
                        >
                          <span className="material-symbols-outlined text-[20px]">edit</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteTrainer(t)}
                          disabled={deletingId === t.id}
                          aria-label={`Hapus ${t.nama}`}
                          className="rounded p-1.5 text-text-muted transition-colors hover:bg-error-container hover:text-error disabled:opacity-50"
                        >
                          <span className="material-symbols-outlined text-[20px]">
                            {deletingId === t.id ? "hourglass_empty" : "delete"}
                          </span>
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              )}
            </tbody>
          </table>
        </div>

        {/* Footer tabel */}
        <div className="flex flex-col items-start justify-between gap-3 border-t border-outline-variant bg-surface-container-lowest px-6 py-4 text-sm sm:flex-row sm:items-center">
          <span className="font-inter text-body-sm text-text-muted">
            Menampilkan {visibleTrainers.length} dari {trainers.length} data
          </span>
        </div>
      </div>
    </div>
  );
}
