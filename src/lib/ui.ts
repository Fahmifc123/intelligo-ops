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

/** Dua digit angka bulan "01".."12", dipakai buat dropdown filter/wizard periode. */
export const BULAN = [
  "01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12",
];

export const BULAN_LABEL: Record<string, string> = {
  "01": "Januari", "02": "Februari", "03": "Maret", "04": "April",
  "05": "Mei", "06": "Juni", "07": "Juli", "08": "Agustus",
  "09": "September", "10": "Oktober", "11": "November", "12": "Desember",
};

export function currentYear(): number {
  return new Date().getFullYear();
}
