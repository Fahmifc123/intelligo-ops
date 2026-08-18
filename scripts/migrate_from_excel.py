"""
Migrasi data lama (file Navigator per trainer) ke database SQLite baru.

Cara pakai:
  1. Taruh semua file "*_Navigator_*.xlsx" di folder scripts/navigator_files/
  2. python3 scripts/migrate_from_excel.py
  3. Jalanin `npx drizzle-kit migrate` dulu di root project biar tabelnya ada
     sebelum jalanin script ini.

Script ini BUKAN bagian dari aplikasi yang live - cuma dipakai sekali buat
mindahin histori sesi dari file Navigator lama ke tabel `sesi` di data.db.
Setelah ini selesai, semua input sesi baru dilakukan lewat halaman /sesi
di aplikasi web, bukan lewat Excel lagi.
"""

import sqlite3
import uuid
import sys
from pathlib import Path

try:
    import openpyxl
except ImportError:
    print("Install dulu: pip install openpyxl --break-system-packages")
    sys.exit(1)

DB_PATH = Path(__file__).parent.parent / "data.db"
NAVIGATOR_DIR = Path(__file__).parent / "navigator_files"


def get_or_create_trainer(conn, nama: str) -> str:
    row = conn.execute("SELECT id FROM trainer WHERE nama = ?", (nama,)).fetchone()
    if row:
        return row[0]
    trainer_id = str(uuid.uuid4())
    conn.execute(
        "INSERT INTO trainer (id, nama) VALUES (?, ?)", (trainer_id, nama)
    )
    return trainer_id


def get_or_create_kelas(conn, nama: str, trainer_id: str, tipe: str = "private") -> str:
    row = conn.execute("SELECT id FROM kelas WHERE nama = ?", (nama,)).fetchone()
    if row:
        return row[0]
    kelas_id = str(uuid.uuid4())
    conn.execute(
        "INSERT INTO kelas (id, nama, tipe, trainer_id) VALUES (?, ?, ?, ?)",
        (kelas_id, nama, tipe, trainer_id),
    )
    return kelas_id


def migrate_navigator_file(conn, filepath: Path):
    """
    Format Navigator: kolom B=Pertemuan, C=Date, D=Judul Materi,
    G=Record link, I=Trainer nama. Sesuaikan index kalau formatnya beda.
    """
    wb = openpyxl.load_workbook(filepath, data_only=True)
    ws = wb["Sheet1"]

    kelas_nama = filepath.stem.replace("Private_Navigator_", "").replace("_", " ")
    print(f"  Migrating: {kelas_nama}")

    inserted = 0
    for row in ws.iter_rows(min_row=2, values_only=True):
        # kolom (0-indexed): 0=blank,1=Pertemuan,2=Date,3=Judul,4=Materi,5=SourceCode,6=Record,7=MiniProject,8=Trainer
        pertemuan = row[1] if len(row) > 1 else None
        tanggal = row[2] if len(row) > 2 else None
        materi = row[3] if len(row) > 3 else None
        record = row[6] if len(row) > 6 else None
        trainer_nama = row[8] if len(row) > 8 else None

        if pertemuan is None or trainer_nama is None:
            continue

        trainer_id = get_or_create_trainer(conn, str(trainer_nama).strip())
        kelas_id = get_or_create_kelas(conn, kelas_nama, trainer_id)

        tanggal_str = tanggal.strftime("%Y-%m-%d") if hasattr(tanggal, "strftime") else (str(tanggal) if tanggal else None)

        sesi_id = str(uuid.uuid4())
        conn.execute(
            """INSERT INTO sesi (id, kelas_id, pertemuan_ke, tanggal, materi, status, link_record)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (
                sesi_id,
                kelas_id,
                int(pertemuan),
                tanggal_str,
                str(materi) if materi else None,
                "selesai" if tanggal else "belum",
                str(record) if record else None,
            ),
        )
        inserted += 1

    conn.commit()
    print(f"    -> {inserted} sesi dimasukkan")


def main():
    if not DB_PATH.exists():
        print(f"Database belum ada di {DB_PATH}. Jalankan 'npx drizzle-kit migrate' dulu.")
        sys.exit(1)

    if not NAVIGATOR_DIR.exists():
        print(f"Folder {NAVIGATOR_DIR} belum ada. Bikin folder itu dan taruh file xlsx Navigator di sana.")
        NAVIGATOR_DIR.mkdir(exist_ok=True)
        sys.exit(1)

    files = list(NAVIGATOR_DIR.glob("*.xlsx"))
    if not files:
        print(f"Gak ada file .xlsx di {NAVIGATOR_DIR}")
        sys.exit(1)

    conn = sqlite3.connect(DB_PATH)
    print(f"Migrasi {len(files)} file Navigator...")
    for f in files:
        migrate_navigator_file(conn, f)
    conn.close()
    print("Selesai.")


if __name__ == "__main__":
    main()
