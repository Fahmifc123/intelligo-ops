import Link from "next/link";

const MENU = [
  {
    href: "/trainer",
    title: "Trainer",
    desc: "Kelola data trainer",
    icon: "group",
  },
  {
    href: "/kelas",
    title: "Kelas",
    desc: "Kelola kelas & assign trainer",
    icon: "school",
  },
  {
    href: "/sesi",
    title: "Sesi",
    desc: "Input & tandai sesi selesai",
    icon: "calendar_month",
  },
  {
    href: "/fee",
    title: "Rekap Fee",
    desc: "Lihat fee otomatis per trainer",
    icon: "account_balance_wallet",
  },
];

export default function Home() {
  return (
    <div className="flex flex-col gap-stack-lg">
      <header>
        <h1 className="mb-2 font-geist text-headline-lg-mobile text-primary md:text-headline-xl">
          Intelligo Ops
        </h1>
        <p className="max-w-xl font-inter text-body-md text-text-muted">
          Sistem operasional keuangan &amp; fee trainer. Ganti dari spreadsheet
          IMPORTRANGE ke database beneran.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-stack-md md:grid-cols-2">
        {MENU.map((m) => (
          <Link
            key={m.href}
            href={m.href}
            className="group relative flex min-h-[200px] flex-col justify-between rounded-xl border border-outline-variant bg-surface-container-lowest p-6 transition-all hover:border-primary hover:shadow-md"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="font-geist text-headline-sm text-primary">
                  {m.title}
                </h2>
                <p className="mt-1 font-inter text-body-sm text-text-muted">
                  {m.desc}
                </p>
              </div>
              <span className="material-symbols-outlined text-[56px] leading-none text-surface-container-highest transition-colors group-hover:text-outline-variant">
                {m.icon}
              </span>
            </div>

            <div className="mt-6 flex justify-end">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-container text-on-surface-variant transition-colors group-hover:bg-primary group-hover:text-on-primary">
                <span className="material-symbols-outlined text-[20px]">
                  arrow_forward
                </span>
              </span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
