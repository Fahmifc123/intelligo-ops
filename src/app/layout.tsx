import type { Metadata } from "next";
import { Geist, Inter } from "next/font/google";
import "./globals.css";
import NavBar from "@/components/NavBar";

const geist = Geist({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-geist-sans",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Intelligo Ops",
  description: "Sistem operasional keuangan & fee trainer Intelligo ID",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id" className={`${geist.variable} ${inter.variable}`}>
      <head>
        {/*
          Ikon Material Symbols Outlined. Di-load lewat <link> dan bukan
          @import di globals.css, karena Tailwind v4 nge-inline
          @import "tailwindcss" duluan jadi @import kita ke-reject
          ("@import rules must precede all rules").
          Rule no-page-custom-font di bawah nyasar ke Pages Router
          (pages/_document.js) - di App Router ini udah bener.
        */}
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="flex min-h-screen flex-col bg-neutral-light-bg text-on-surface">
        <NavBar />
        <main className="mx-auto flex w-full max-w-container-max flex-grow flex-col gap-stack-lg px-margin-mobile py-stack-lg md:px-8">
          {children}
        </main>
        <footer className="mt-auto w-full border-t border-outline-variant/20 bg-surface-container-low">
          <div className="mx-auto flex w-full max-w-container-max flex-col items-center justify-between gap-stack-md px-margin-mobile py-8 md:flex-row md:px-8">
            <div className="font-geist text-label-md font-bold text-primary">
              © {new Date().getFullYear()} Intelligo Ops
            </div>
            <p className="font-inter text-body-sm text-text-muted">
              Sistem operasional keuangan &amp; fee trainer Intelligo ID
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
