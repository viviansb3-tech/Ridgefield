#!/usr/bin/env python3
from pathlib import Path
import sqlite3, shutil, datetime, hashlib, json, sys

ROOT=Path(__file__).resolve().parents[1]
DB=ROOT/"server"/"data"/"ridgefield.db"
BACKUPS=ROOT/"server"/"backups"
BACKUPS.mkdir(parents=True,exist_ok=True)

if not DB.exists():
    print("Database not found:",DB)
    raise SystemExit(1)

stamp=datetime.datetime.now().strftime("%Y%m%d-%H%M%S")
dest=BACKUPS/f"ridgefield-{stamp}.db"

src=sqlite3.connect(DB)
dst=sqlite3.connect(dest)
with dst:
    src.backup(dst)
src.close(); dst.close()

h=hashlib.sha256(dest.read_bytes()).hexdigest()
size=dest.stat().st_size
print(dest)
print("size:",size)
print("sha256:",h)

try:
    db=sqlite3.connect(DB)
    db.execute("""CREATE TABLE IF NOT EXISTS backup_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      backup_ref TEXT UNIQUE NOT NULL,
      file_name TEXT NOT NULL,
      file_path TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      restored_at TEXT,
      notes TEXT
    )""")
    ref=f"RF-BKP-{datetime.datetime.now().year}-{stamp}"
    db.execute("INSERT INTO backup_log(backup_ref,file_name,file_path,file_size,status,created_at,notes) VALUES(?,?,?,?,?,?,?)",
               (ref,dest.name,str(dest),size,"Created",datetime.datetime.now().isoformat(),f"sha256:{h}"))
    db.commit(); db.close()
except Exception as e:
    print("Warning: backup log not written:",e,file=sys.stderr)
