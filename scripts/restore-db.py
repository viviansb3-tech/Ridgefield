#!/usr/bin/env python3
from pathlib import Path
import sqlite3, shutil, sys, datetime, hashlib

ROOT=Path(__file__).resolve().parents[1]
DB=ROOT/"server"/"data"/"ridgefield.db"

if len(sys.argv)!=2:
    print("Usage: python3 scripts/restore-db.py server/backups/ridgefield-YYYYMMDD-HHMMSS.db")
    raise SystemExit(1)

src=Path(sys.argv[1]).resolve()
if not src.exists():
    print("Backup file not found:",src); raise SystemExit(1)

# Validate SQLite before replacing live DB
try:
    conn=sqlite3.connect(src)
    result=conn.execute("PRAGMA integrity_check").fetchone()[0]
    conn.close()
except Exception as e:
    print("Backup validation failed:",e); raise SystemExit(1)
if result!="ok":
    print("Backup integrity check failed:",result); raise SystemExit(1)

DB.parent.mkdir(parents=True,exist_ok=True)
safety=DB.with_name("ridgefield-pre-restore-"+datetime.datetime.now().strftime("%Y%m%d-%H%M%S")+".db")
if DB.exists():
    shutil.copy2(DB,safety)
shutil.copy2(src,DB)
print("Restore complete:",DB)
print("Pre-restore safety copy:",safety if safety.exists() else "none")
