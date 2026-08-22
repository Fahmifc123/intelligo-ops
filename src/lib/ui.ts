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

/** Format rupiah ringkas buat card - "Rp 6,7jt" lebih kebaca dari 7 digit. */
export function rupiahRingkas(v: number): string {
  if (v >= 1_000_000) {
    const jt = v / 1_000_000;
    // Satu desimal cuma kalau perlu, biar "Rp 5jt" gak jadi "Rp 5,0jt".
    return `Rp ${(Math.round(jt * 10) / 10).toLocaleString("id-ID")}jt`;
  }
  if (v >= 1000) return `Rp ${Math.round(v / 1000).toLocaleString("id-ID")}rb`;
  return `Rp ${v.toLocaleString("id-ID")}`;
}

export const TIPE_LABEL: Record<string, string> = {
  bootcamp: "Bootcamp",
  private: "Private",
  mbc: "MBC",
  corporate: "Corporate Training",
};

/**
 * Badge status kelas. Dua status "selesai" sengaja nyebut fee eksplisit -
 * "Selesai" doang ambigu antara "udah kelar ngajar" dan "udah dibayar".
 */
export const STATUS_BADGE: Record<
  string,
  { label: string; kelas: string; ikon: string }
> = {
  persiapan: {
    label: "Persiapan",
    kelas: "bg-warning/10 text-warning",
    ikon: "schedule",
  },
  aktif: {
    label: "Aktif",
    kelas: "bg-success/10 text-success",
    ikon: "play_circle",
  },
  selesai: {
    label: "Selesai · fee belum lunas",
    kelas: "bg-secondary-container/20 text-secondary",
    ikon: "payments",
  },
  lunas: {
    label: "Selesai · fee lunas",
    kelas: "bg-surface-container text-text-muted",
    ikon: "task_alt",
  },
};

/** ID sheet -> link Google Sheets yang bisa dibuka manusia (tab edit). */
export function sheetUrl(sheetId: string): string {
  return `https://docs.google.com/spreadsheets/d/${sheetId}/edit`;
}
