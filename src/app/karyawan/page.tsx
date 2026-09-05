"use client";
import { useEffect, useState } from "react";
import { initials, avatarClass } from "@/lib/ui";

type Karyawan = {
  id: string;
  nama: string;
  posisi: string;
  bankName: string | null;
  bankAccountNumber: string | null;
  bankAccountName: string | null;
};

const inputClass =
  "w-full rounded-lg border border-outline-variant bg-surface px-3 py-2 font-inter text-body-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-primary";

export default function KaryawanPage() {
  const [karyawanList, setKaryawanList] = useState<Karyawan[]>([]);
  const [nama, setNama] = useState("");
  const [posisi, setPosisi] = useState("");
  const [bankName, setBankName] = useState("");
  const [bankAccountNumber, setBankAccountNumber] = useState("");
  const [bankAccountName, setBankAccountName] = useState("");
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [formMsg, setFormMsg] = useState<string | null>(null);

  // Karyawan yang lagi diedit inline di tabel. null = gak ada yang diedit.
  const [editId, setEditId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Partial<Karyawan>>({});
  const [editSaving, setEditSaving] = useState(false);

  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/trainer?tipe=karyawan");
    setKaryawanList(await res.json());
  }

  useEffect(() => {
    load();
  }, []);

  async function addKaryawan(e: React.FormEvent) {
    e.preventDefault();
    if (!nama.trim() || !posisi.trim()) return;
    setLoading(true);
    setFormMsg(null);
    try {
      const res = await fetch("/api/trainer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nama,
          tipe: "karyawan",
          posisi,
          bankName: bankName || undefined,
          bankAccountNumber: bankAccountNumber || undefined,
          bankAccountName: bankAccountName || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFormMsg(`Gagal: ${data.error ?? "karyawan gagal ditambahkan"}`);
        setLoading(false);
        return;
      }
      setNama("");
      setPosisi("");
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

  function startEdit(k: Karyawan) {
    setEditId(k.id);
    setEditDraft({
      nama: k.nama,
      posisi: k.posisi,
      bankName: k.bankName ?? "",
      bankAccountNumber: k.bankAccountNumber ?? "",
      bankAccountName: k.bankAccountName ?? "",
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

  async function deleteKaryawan(k: Karyawan) {
    if (!window.confirm(`Hapus karyawan "${k.nama}"? Tindakan ini gak bisa dibatalin.`)) return;
    setDeletingId(k.id);
    const res = await fetch(`/api/trainer/${k.id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      window.alert(data.error ?? "Gagal hapus karyawan.");
    }
    setDeletingId(null);
    load();
  }

  return (
    <div className="flex flex-col gap-stack-lg">
      {/* Header */}
      <div className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-end">
        <div>
          <h1 className="mb-2 font-geist text-headline-lg-mobile text-primary md:text-headline-lg">
            Karyawan
          </h1>
          <p className="font-inter text-body-md text-text-muted">
            Kelola data karyawan non-trainer (marketing, admin, dst) buat keperluan payslip.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          className="flex w-full items-center justify-center gap-2 whitespace-nowrap rounded-lg bg-primary px-6 py-2.5 font-geist text-label-md text-on-primary shadow-sm transition-colors hover:bg-primary-container md:w-auto"
        >
          <span className="material-symbols-outlined text-[18px]">
            {showForm ? "close" : "add"}
          </span>
          {showForm ? "Tutup" : "Add Karyawan"}
        </button>
      </div>

      {/* Form tambah karyawan */}
      {showForm && (
        <form
          onSubmit={addKaryawan}
          className="flex flex-col gap-stack-md rounded-xl border border-outline-variant bg-surface-container-lowest p-6"
        >
          <h2 className="font-geist text-headline-sm text-primary">Tambah Karyawan Baru</h2>
          <div className="grid grid-cols-1 gap-stack-md md:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="karyawan-nama" className="font-geist text-label-sm text-text-muted">
                Nama karyawan
              </label>
              <input
                id="karyawan-nama"
                className={inputClass}
                placeholder="Nama karyawan"
                value={nama}
                onChange={(e) => setNama(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="karyawan-posisi" className="font-geist text-label-sm text-text-muted">
                Posisi
              </label>
              <input
                id="karyawan-posisi"
                className={inputClass}
                placeholder="mis. Marketing, Admin, Finance"
                value={posisi}
                onChange={(e) => setPosisi(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="karyawan-bank" className="font-geist text-label-sm text-text-muted">
                Nama bank (opsional)
              </label>
              <input
                id="karyawan-bank"
                className={inputClass}
                placeholder="Bank Rakyat Indonesia"
                value={bankName}
                onChange={(e) => setBankName(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="karyawan-rekening"
                className="font-geist text-label-sm text-text-muted"
              >
                Nomor rekening (opsional)
              </label>
              <input
                id="karyawan-rekening"
                className={inputClass}
                placeholder="455101001888501"
                value={bankAccountNumber}
                onChange={(e) => setBankAccountNumber(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5 md:col-span-2">
              <label
                htmlFor="karyawan-pemilik"
                className="font-geist text-label-sm text-text-muted"
              >
                Nama pemilik rekening (opsional - kalau beda dari nama karyawan)
              </label>
              <input
                id="karyawan-pemilik"
                className={inputClass}
                placeholder="Nama pemilik rekening"
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

      {/* Tabel karyawan */}
      <div className="flex flex-col overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest shadow-sm">
        <div className="w-full overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-outline-variant bg-surface-container-low/50 font-geist text-label-md text-text-muted">
                <th className="p-4 pl-6">Nama</th>
                <th className="p-4">Posisi</th>
                <th className="p-4">Rekening</th>
                <th className="p-4 pr-6 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="font-inter text-body-sm">
              {karyawanList.length === 0 && (
                <tr>
                  <td
                    colSpan={4}
                    className="p-6 text-center font-inter text-body-sm text-text-muted"
                  >
                    Belum ada karyawan.
                  </td>
                </tr>
              )}
              {karyawanList.map((k) =>
                editId === k.id ? (
                  <tr key={k.id} className="border-b border-outline-variant/50 bg-surface-container-low/40">
                    <td className="p-3 pl-6" colSpan={4}>
                      <div className="flex flex-col gap-2">
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
                          <input
                            className={inputClass}
                            placeholder="Nama"
                            value={editDraft.nama ?? ""}
                            onChange={(e) => setEditDraft((d) => ({ ...d, nama: e.target.value }))}
                          />
                          <input
                            className={inputClass}
                            placeholder="Posisi"
                            value={editDraft.posisi ?? ""}
                            onChange={(e) => setEditDraft((d) => ({ ...d, posisi: e.target.value }))}
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
                    key={k.id}
                    className="border-b border-outline-variant/50 transition-colors last:border-b-0 hover:bg-neutral-light-bg"
                  >
                    <td className="p-4 pl-6">
                      <div className="flex items-center gap-3">
                        <div
                          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold ${avatarClass(
                            k.id
                          )}`}
                        >
                          {initials(k.nama)}
                        </div>
                        <div>
                          <div className="font-medium text-primary">{k.nama}</div>
                          <div className="font-inter text-label-sm text-text-muted">
                            ID: {k.id.slice(0, 8)}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="p-4 text-text-muted">{k.posisi}</td>
                    <td className="p-4 text-text-muted">
                      {k.bankName ? (
                        <div className="flex flex-col">
                          <span>{k.bankName}</span>
                          <span className="font-inter text-label-sm text-text-muted">
                            {k.bankAccountNumber}
                            {k.bankAccountName ? ` · ${k.bankAccountName}` : ""}
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
                          onClick={() => startEdit(k)}
                          aria-label={`Edit karyawan ${k.nama}`}
                          className="rounded p-1.5 text-text-muted transition-colors hover:bg-surface-container hover:text-primary"
                        >
                          <span className="material-symbols-outlined text-[20px]">edit</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteKaryawan(k)}
                          disabled={deletingId === k.id}
                          aria-label={`Hapus karyawan ${k.nama}`}
                          className="rounded p-1.5 text-text-muted transition-colors hover:bg-error-container hover:text-error disabled:opacity-50"
                        >
                          <span className="material-symbols-outlined text-[20px]">
                            {deletingId === k.id ? "hourglass_empty" : "delete"}
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
            Menampilkan {karyawanList.length} karyawan
          </span>
        </div>
      </div>
    </div>
  );
}
