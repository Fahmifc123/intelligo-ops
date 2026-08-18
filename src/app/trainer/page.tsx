"use client";
import { useEffect, useState } from "react";
import { initials, avatarClass } from "@/lib/ui";

type Trainer = { id: string; nama: string; email: string | null };

export default function TrainerPage() {
  const [trainers, setTrainers] = useState<Trainer[]>([]);
  const [nama, setNama] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);

  async function load() {
    const res = await fetch("/api/trainer");
    setTrainers(await res.json());
  }

  useEffect(() => {
    load();
  }, []);

  async function addTrainer(e: React.FormEvent) {
    e.preventDefault();
    if (!nama.trim()) return;
    setLoading(true);
    await fetch("/api/trainer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nama, email: email || undefined }),
    });
    setNama("");
    setEmail("");
    setLoading(false);
    load();
  }

  return (
    <div className="flex flex-col gap-stack-lg">
      {/* Header */}
      <div className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-end">
        <div>
          <h1 className="mb-2 font-geist text-headline-lg-mobile text-primary md:text-headline-lg">
            Trainer Management
          </h1>
          <p className="font-inter text-body-md text-text-muted">
            Kelola data trainer yang mengajar di kelas Intelligo.
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
          {showForm ? "Tutup" : "Add Trainer"}
        </button>
      </div>

      {/* Form tambah trainer */}
      {showForm && (
        <form
          onSubmit={addTrainer}
          className="flex flex-col gap-stack-md rounded-xl border border-outline-variant bg-surface-container-lowest p-6"
        >
          <h2 className="font-geist text-headline-sm text-primary">
            Tambah Trainer Baru
          </h2>
          <div className="grid grid-cols-1 gap-stack-md md:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="trainer-nama"
                className="font-geist text-label-sm text-text-muted"
              >
                Nama trainer
              </label>
              <input
                id="trainer-nama"
                className="w-full rounded-lg border border-outline-variant bg-surface px-3 py-2 font-inter text-body-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="Nama trainer"
                value={nama}
                onChange={(e) => setNama(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="trainer-email"
                className="font-geist text-label-sm text-text-muted"
              >
                Email (opsional)
              </label>
              <input
                id="trainer-email"
                className="w-full rounded-lg border border-outline-variant bg-surface px-3 py-2 font-inter text-body-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="nama@intelligo.id"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
          </div>
          <button
            type="submit"
            disabled={loading}
            className="self-start rounded-lg bg-primary px-6 py-2.5 font-geist text-label-md text-on-primary transition-colors hover:bg-primary-container disabled:opacity-50"
          >
            {loading ? "Menyimpan..." : "Tambah"}
          </button>
        </form>
      )}

      {/* Tabel trainer */}
      <div className="flex flex-col overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest shadow-sm">
        <div className="w-full overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-outline-variant bg-surface-container-low/50 font-geist text-label-md text-text-muted">
                <th className="p-4 pl-6">Name</th>
                <th className="p-4">Contact</th>
                {/*
                  TODO: kolom Expertise & Status ada di mockup tapi belum ada
                  di data model (tabel trainer cuma punya nama/email/bank).
                  Kolomnya disembunyiin dulu daripada bikin data palsu.
                */}
                <th className="p-4 pr-6 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="font-inter text-body-sm">
              {trainers.length === 0 && (
                <tr>
                  <td
                    colSpan={3}
                    className="p-6 text-center font-inter text-body-sm text-text-muted"
                  >
                    Belum ada trainer.
                  </td>
                </tr>
              )}
              {trainers.map((t) => (
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
                        <div className="font-medium text-primary">{t.nama}</div>
                        <div className="font-inter text-label-sm text-text-muted">
                          ID: {t.id.slice(0, 8)}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="p-4 text-text-muted">{t.email ?? "-"}</td>
                  <td className="p-4 pr-6 text-right">
                    {/* TODO: belum diimplementasi - edit & hapus trainer belum ada endpoint-nya */}
                    <div className="flex justify-end gap-1">
                      <button
                        type="button"
                        disabled
                        aria-label="Edit trainer (belum tersedia)"
                        className="cursor-not-allowed rounded p-1.5 text-text-muted opacity-40"
                      >
                        <span className="material-symbols-outlined text-[20px]">
                          edit
                        </span>
                      </button>
                      <button
                        type="button"
                        disabled
                        aria-label="Hapus trainer (belum tersedia)"
                        className="cursor-not-allowed rounded p-1.5 text-text-muted opacity-40"
                      >
                        <span className="material-symbols-outlined text-[20px]">
                          delete
                        </span>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Footer tabel */}
        <div className="flex flex-col items-start justify-between gap-3 border-t border-outline-variant bg-surface-container-lowest px-6 py-4 text-sm sm:flex-row sm:items-center">
          <span className="font-inter text-body-sm text-text-muted">
            Menampilkan {trainers.length} trainer
          </span>
          {/* TODO: belum diimplementasi - pagination belum ada di API */}
          <div className="flex gap-2">
            <button
              type="button"
              disabled
              className="cursor-not-allowed rounded-lg border border-outline-variant px-4 py-1.5 font-geist text-label-sm text-text-muted opacity-50"
            >
              Previous
            </button>
            <button
              type="button"
              disabled
              className="cursor-not-allowed rounded-lg border border-outline-variant px-4 py-1.5 font-geist text-label-sm text-text-muted opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
