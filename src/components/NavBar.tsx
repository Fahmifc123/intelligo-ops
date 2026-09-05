"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

const LINKS = [
  { href: "/", label: "Home" },
  { href: "/trainer", label: "Trainer" },
  { href: "/karyawan", label: "Karyawan" },
  { href: "/kelas", label: "Kelas" },
  { href: "/sesi", label: "Sesi" },
  { href: "/fee", label: "Rekap Fee" },
  { href: "/payslip", label: "Payslip" },
];

export default function NavBar() {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  function isActive(href: string) {
    return href === "/" ? pathname === "/" : pathname.startsWith(href);
  }

  async function logout() {
    setLoggingOut(true);
    await fetch("/api/auth/logout", { method: "POST" });
    // router.refresh() mastiin router cache Next.js gak nyimpen state
    // halaman-halaman yang butuh login, jadi begitu balik ke /login
    // gak ada data sisa dari session sebelumnya yang nyantol.
    router.push("/login");
    router.refresh();
  }

  // Halaman login punya layout sendiri (full-screen, gak ada nav) - proxy.ts
  // udah mastiin route lain gak kebuka tanpa login, jadi NavBar aman
  // disembunyiin di sini tanpa nyoba nge-guard ulang.
  if (pathname === "/login") return null;

  return (
    <nav className="sticky top-0 z-50 w-full border-b border-outline-variant/30 bg-surface/80 backdrop-blur-md transition-all duration-200 ease-in-out">
      <div className="mx-auto flex h-16 w-full max-w-container-max items-center justify-between px-margin-mobile md:px-8">
        <div className="flex items-center gap-6">
          <Link
            href="/"
            className="mr-2 font-geist text-headline-md font-bold text-primary md:mr-4"
          >
            Intelligo Ops
          </Link>

          {/* Desktop navigation */}
          <div className="hidden items-center gap-6 md:flex">
            {LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className={
                  isActive(l.href)
                    ? "border-b-2 border-secondary px-2 py-1 pb-1 font-geist text-label-md font-bold text-secondary"
                    : "rounded-lg px-2 py-1 font-geist text-label-md text-on-surface-variant transition-colors hover:bg-surface-container-high/50 hover:text-primary"
                }
              >
                {l.label}
              </Link>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 md:gap-4">
          <div className="hidden items-center gap-2 text-on-surface-variant md:flex">
            {/* TODO: belum ada fitur notifikasi */}
            <button
              type="button"
              disabled
              aria-label="Notifikasi (belum tersedia)"
              className="cursor-not-allowed rounded-full p-2 opacity-60 transition-colors"
            >
              <span className="material-symbols-outlined">notifications</span>
            </button>
            {/* TODO: belum ada fitur settings */}
            <button
              type="button"
              disabled
              aria-label="Pengaturan (belum tersedia)"
              className="cursor-not-allowed rounded-full p-2 opacity-60 transition-colors"
            >
              <span className="material-symbols-outlined">settings</span>
            </button>
          </div>

          <button
            type="button"
            onClick={logout}
            disabled={loggingOut}
            aria-label="Keluar"
            title="Keluar"
            className="flex h-8 w-8 items-center justify-center rounded-full border border-outline-variant bg-surface-container-high text-outline transition-colors hover:border-error hover:text-error disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-[18px]">
              {loggingOut ? "hourglass_empty" : "logout"}
            </span>
          </button>

          {/* Mobile hamburger */}
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-label="Buka menu"
            aria-expanded={open}
            className="rounded-lg p-2 text-on-surface-variant transition-colors hover:bg-surface-container-high/50 md:hidden"
          >
            <span className="material-symbols-outlined">
              {open ? "close" : "menu"}
            </span>
          </button>
        </div>
      </div>

      {/* Mobile navigation */}
      {open && (
        <div className="border-t border-outline-variant/30 bg-surface px-margin-mobile py-stack-sm md:hidden">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              onClick={() => setOpen(false)}
              className={
                isActive(l.href)
                  ? "block rounded-lg bg-secondary/10 px-3 py-2 font-geist text-body-md font-bold text-secondary"
                  : "block rounded-lg px-3 py-2 font-geist text-body-md text-on-surface-variant hover:bg-surface-container-high/50"
              }
            >
              {l.label}
            </Link>
          ))}
        </div>
      )}
    </nav>
  );
}
