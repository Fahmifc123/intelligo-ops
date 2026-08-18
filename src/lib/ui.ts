// Helper tampilan yang dipakai bareng-bareng antar halaman (avatar inisial, format rupiah).

/** Ambil maks 2 huruf inisial dari nama. "Ahmad Nurudin" -> "AN" */
export function initials(nama: string): string {
  const parts = nama.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Warna avatar dipilih deterministik dari nama, biar trainer yang sama
 * selalu dapet warna yang sama tiap render. Palet ambil dari container
 * color token di DESIGN.md.
 */
const AVATAR_PALETTE = [
  "bg-primary-container text-on-primary-container",
  "bg-secondary-container text-on-secondary-container",
  "bg-tertiary-container text-on-tertiary-container",
];

export function avatarClass(key: string): string {
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  }
  return AVATAR_PALETTE[hash % AVATAR_PALETTE.length];
}

export function formatRupiah(n: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(n);
}
