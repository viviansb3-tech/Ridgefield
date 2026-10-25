#!/usr/bin/env python3
from pathlib import Path
import sqlite3, sys
ROOT=Path(__file__).resolve().parents[1]
DB=ROOT/"server"/"data"/"ridgefield.db"
if not DB.exists():
    print("Database not found"); raise SystemExit(1)
db=sqlite3.connect(DB)
print("integrity_check:",db.execute("PRAGMA integrity_check").fetchone()[0])
print("foreign_key_check rows:",len(db.execute("PRAGMA foreign_key_check").fetchall()))
tables=[x[0] for x in db.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")]
print("tables:",len(tables))
for table in tables:
    try:
        count=db.execute(f'SELECT COUNT(*) FROM "{table}"').fetchone()[0]
        print(f"{table}: {count}")
    except Exception as e:
        print(f"{table}: ERROR {e}")
db.close()
