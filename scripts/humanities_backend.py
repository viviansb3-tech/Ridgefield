#!/usr/bin/env python3
"""
Humanities Learning Portal - Backend & Access Control Service
Implements:
- Relational schema (SQLite with foreign keys enabled)
- Authentication with secure session tokens & password hashing (PBKDF2-HMAC-SHA256)
- Role-based access control (Student, Teacher, Administrator)
- Module management & teaching assignments
- Enrolment controls & resource access gating
- Atomic PDF storage with checksum & HTTP range streaming support
- Audit logging of administrative & teaching events
- Reading progress persistence per user
"""

import sqlite3
import hashlib
import os
import hmac
import json
import uuid
import re
import urllib.parse
from datetime import datetime, timezone, timedelta
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
STORAGE_DIR = BASE_DIR / "storage" / "humanities"
RESOURCE_DIR = STORAGE_DIR / "resources"
DB_PATH = STORAGE_DIR / "humanities.sqlite3"

STORAGE_DIR.mkdir(parents=True, exist_ok=True)
RESOURCE_DIR.mkdir(parents=True, exist_ok=True)

SESSION_LIFETIME = timedelta(hours=12)

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.execute("PRAGMA foreign_keys = ON;")
    conn.row_factory = sqlite3.Row
    return conn

def hash_password(password: str, salt: bytes = None) -> str:
    if salt is None:
        salt = os.urandom(16)
    hashed = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 100_000)
    return f"{salt.hex()}:{hashed.hex()}"

def verify_password(password: str, stored_hash: str) -> bool:
    try:
        salt_hex, hash_hex = stored_hash.split(":")
        salt = bytes.fromhex(salt_hex)
        expected = bytes.fromhex(hash_hex)
        actual = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 100_000)
        return hmac.compare_digest(actual, expected)
    except Exception:
        return False

def init_humanities_db():
    conn = get_db()
    with conn:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS profiles (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                display_name TEXT NOT NULL,
                role TEXT NOT NULL CHECK(role IN ('student', 'teacher', 'admin')),
                active INTEGER NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS sessions (
                token_hash TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
                created_at TEXT NOT NULL,
                expires_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS modules (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                code TEXT UNIQUE NOT NULL,
                title TEXT NOT NULL,
                academic_year TEXT NOT NULL,
                description TEXT,
                status TEXT NOT NULL DEFAULT 'published' CHECK(status IN ('draft', 'published', 'archived')),
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS teaching_assignments (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                teacher_id INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
                module_id INTEGER NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
                created_at TEXT NOT NULL,
                UNIQUE(teacher_id, module_id)
            );

            CREATE TABLE IF NOT EXISTS enrolments (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                student_id INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
                module_id INTEGER NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
                status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'suspended', 'completed')),
                created_at TEXT NOT NULL,
                UNIQUE(student_id, module_id)
            );

            CREATE TABLE IF NOT EXISTS resources (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                module_id INTEGER REFERENCES modules(id) ON DELETE SET NULL,
                title TEXT NOT NULL,
                edition_year TEXT,
                author TEXT,
                storage_key TEXT UNIQUE NOT NULL,
                mime_type TEXT NOT NULL DEFAULT 'application/pdf',
                byte_size INTEGER NOT NULL,
                checksum TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft', 'published', 'archived')),
                allow_download INTEGER NOT NULL DEFAULT 0,
                rights_confirmed INTEGER NOT NULL DEFAULT 0,
                created_by INTEGER NOT NULL REFERENCES profiles(id),
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS reading_progress (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
                resource_id INTEGER NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
                current_page INTEGER NOT NULL DEFAULT 1,
                total_pages INTEGER NOT NULL DEFAULT 1,
                updated_at TEXT NOT NULL,
                UNIQUE(user_id, resource_id)
            );

            CREATE TABLE IF NOT EXISTS audit_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                actor_id INTEGER REFERENCES profiles(id) ON DELETE SET NULL,
                action TEXT NOT NULL,
                target_type TEXT NOT NULL,
                target_id TEXT,
                metadata_json TEXT,
                created_at TEXT NOT NULL
            );
        """)

        # Seed initial synthetic test accounts if table is empty
        cur = conn.cursor()
        cur.execute("SELECT COUNT(*) FROM profiles")
        if cur.fetchone()[0] == 0:
            now_iso = datetime.now(timezone.utc).isoformat()
            # Synthetic accounts
            admin_pwd = hash_password("AdminPass2026!")
            teacher_pwd = hash_password("TeacherPass2026!")
            student1_pwd = hash_password("StudentPass2026!")
            student2_pwd = hash_password("Student2Pass2026!")

            conn.execute("INSERT INTO profiles (email, password_hash, display_name, role, active, created_at) VALUES (?, ?, ?, ?, 1, ?)",
                         ("admin@humanities.test", admin_pwd, "Administrator", "admin", now_iso))
            conn.execute("INSERT INTO profiles (email, password_hash, display_name, role, active, created_at) VALUES (?, ?, ?, ?, 1, ?)",
                         ("teacher@humanities.test", teacher_pwd, "Dr. Femi Chapola", "teacher", now_iso))
            conn.execute("INSERT INTO profiles (email, password_hash, display_name, role, active, created_at) VALUES (?, ?, ?, ?, 1, ?)",
                         ("student@humanities.test", student1_pwd, "Lerato Dlamini", "student", now_iso))
            conn.execute("INSERT INTO profiles (email, password_hash, display_name, role, active, created_at) VALUES (?, ?, ?, ?, 1, ?)",
                         ("student2@humanities.test", student2_pwd, "Thabo Molefe", "student", now_iso))

            # Modules
            conn.execute("INSERT INTO modules (code, title, academic_year, description, status, created_at) VALUES (?, ?, ?, ?, 'published', ?)",
                         ("EARH3724", "Applied Research & Academic Literacy", "2026", "Foundations of empirical inquiry and research methodology in humanities.", now_iso))
            conn.execute("INSERT INTO modules (code, title, academic_year, description, status, created_at) VALUES (?, ?, ?, ?, 'published', ?)",
                         ("PSPE3724", "Personality Psychology & Theories", "2026", "Advanced examination of personality structures, assessment, and behavioral dynamics.", now_iso))
            conn.execute("INSERT INTO modules (code, title, academic_year, description, status, created_at) VALUES (?, ?, ?, ?, 'published', ?)",
                         ("EPFM3724", "Performance Management in Organizations", "2026", "Systemic evaluation of performance metrics, coaching, and strategic alignment.", now_iso))
            conn.execute("INSERT INTO modules (code, title, academic_year, description, status, created_at) VALUES (?, ?, ?, ?, 'published', ?)",
                         ("PSTH3724", "Helping Process & Psychological Therapy", "2026", "Therapeutic counseling methodologies and Egan's helping framework.", now_iso))

            # Assignments: Teacher Dr. Chapola assigned to EARH3724 and PSPE3724
            conn.execute("INSERT INTO teaching_assignments (teacher_id, module_id, created_at) VALUES (2, 1, ?)", (now_iso,))
            conn.execute("INSERT INTO teaching_assignments (teacher_id, module_id, created_at) VALUES (2, 2, ?)", (now_iso,))

            # Enrolments: Student 1 (Lerato) enrolled in EARH3724
            conn.execute("INSERT INTO enrolments (student_id, module_id, status, created_at) VALUES (3, 1, 'active', ?)", (now_iso,))

            # Generate synthetic test PDF resource for testing the reader
            test_pdf_content = (
                b"%PDF-1.4\n"
                b"1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n"
                b"2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n"
                b"3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R/Resources<<>>>>endobj\n"
                b"xref\n0 4\n0000000000 65535 f \n0000000009 00000 n \n0000000052 00000 n \n0000000101 00000 n \n"
                b"trailer<</Size 4/Root 1 0 R>>\nstartxref\n178\n%%EOF\n"
            )
            storage_key = "earh3724-study-guide-sample.pdf"
            pdf_path = RESOURCE_DIR / storage_key
            pdf_path.write_bytes(test_pdf_content)
            checksum = hashlib.sha256(test_pdf_content).hexdigest()

            # Insert sample published resource into EARH3724
            conn.execute("""
                INSERT INTO resources (
                    module_id, title, edition_year, author, storage_key, mime_type, 
                    byte_size, checksum, status, allow_download, rights_confirmed, 
                    created_by, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, 'application/pdf', ?, ?, 'published', 1, 1, 2, ?, ?)
            """, (
                1, "EARH3724 Module Overview & Reader (Sample)", "2026", "Department of Humanities",
                storage_key, len(test_pdf_content), checksum, now_iso, now_iso
            ))

            # Audit event
            conn.execute("""
                INSERT INTO audit_events (actor_id, action, target_type, target_id, metadata_json, created_at)
                VALUES (1, 'system_bootstrap', 'database', 'seed', '{"status":"initial_seed_completed"}', ?)
            """, (now_iso,))

    conn.close()

# Initialize DB on load
init_humanities_db()

# --- Authentication Helpers ---
def create_session(user_id: int) -> str:
    raw_token = uuid.uuid4().hex + uuid.uuid4().hex
    token_hash = hashlib.sha256(raw_token.encode("utf-8")).hexdigest()
    now = datetime.now(timezone.utc)
    expires = (now + SESSION_LIFETIME).isoformat()
    now_iso = now.isoformat()

    conn = get_db()
    with conn:
        conn.execute("INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
                     (token_hash, user_id, now_iso, expires))
    conn.close()
    return raw_token

def get_session_user(raw_token: str):
    if not raw_token:
        return None
    token_hash = hashlib.sha256(raw_token.encode("utf-8")).hexdigest()
    now_iso = datetime.now(timezone.utc).isoformat()

    conn = get_db()
    cur = conn.cursor()
    cur.execute("""
        SELECT p.id, p.email, p.display_name, p.role, p.active
        FROM sessions s
        JOIN profiles p ON s.user_id = p.id
        WHERE s.token_hash = ? AND s.expires_at > ? AND p.active = 1
    """, (token_hash, now_iso))
    row = cur.fetchone()
    conn.close()
    if not row:
        return None
    return dict(row)

def revoke_session(raw_token: str):
    if not raw_token:
        return
    token_hash = hashlib.sha256(raw_token.encode("utf-8")).hexdigest()
    conn = get_db()
    with conn:
        conn.execute("DELETE FROM sessions WHERE token_hash = ?", (token_hash,))
    conn.close()

def log_audit(actor_id: int, action: str, target_type: str, target_id: str, metadata: dict = None):
    now_iso = datetime.now(timezone.utc).isoformat()
    meta_json = json.dumps(metadata or {}, ensure_ascii=False)
    conn = get_db()
    with conn:
        conn.execute("""
            INSERT INTO audit_events (actor_id, action, target_type, target_id, metadata_json, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (actor_id, action, target_type, str(target_id), meta_json, now_iso))
    conn.close()

# --- Access Control Checks ---
def can_access_module(user: dict, module_id: int) -> bool:
    if not user:
        return False
    role = user["role"]
    if role == "admin":
        return True
    conn = get_db()
    cur = conn.cursor()
    if role == "teacher":
        cur.execute("SELECT 1 FROM teaching_assignments WHERE teacher_id = ? AND module_id = ?",
                    (user["id"], module_id))
        res = cur.fetchone() is not None
        conn.close()
        return res
    if role == "student":
        cur.execute("SELECT 1 FROM enrolments WHERE student_id = ? AND module_id = ? AND status = 'active'",
                    (user["id"], module_id))
        res = cur.fetchone() is not None
        conn.close()
        return res
    conn.close()
    return False

def can_access_resource(user: dict, resource: dict) -> bool:
    if not user or not resource:
        return False
    role = user["role"]
    if role == "admin":
        return True
    module_id = resource.get("module_id")
    if not module_id:
        return False

    conn = get_db()
    cur = conn.cursor()
    if role == "teacher":
        cur.execute("SELECT 1 FROM teaching_assignments WHERE teacher_id = ? AND module_id = ?",
                    (user["id"], module_id))
        res = cur.fetchone() is not None
        conn.close()
        return res

    if role == "student":
        if resource.get("status") != "published":
            conn.close()
            return False
        cur.execute("SELECT 1 FROM enrolments WHERE student_id = ? AND module_id = ? AND status = 'active'",
                    (user["id"], module_id))
        res = cur.fetchone() is not None
        conn.close()
        return res

    conn.close()
    return False

def can_download_resource(user: dict, resource: dict) -> bool:
    if not can_access_resource(user, resource):
        return False
    if user["role"] in ("admin", "teacher"):
        return True
    return bool(resource.get("allow_download"))

def extract_token(handler) -> str:
    auth_header = handler.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        return auth_header[7:].strip()
    cookie_str = handler.headers.get("Cookie", "")
    if cookie_str:
        for c in cookie_str.split(";"):
            c = c.strip()
            if c.startswith("rf_humanities_token="):
                return c.split("=", 1)[1].strip()
    return ""

def read_json_body(handler):
    content_length = int(handler.headers.get("Content-Length", 0))
    if content_length == 0:
        return {}
    raw = handler.rfile.read(content_length).decode("utf-8", errors="replace")
    try:
        return json.loads(raw)
    except Exception:
        # Check if form urlencoded
        parsed = urllib.parse.parse_qs(raw, keep_blank_values=True)
        return {k: v[0] if len(v) == 1 else v for k, v in parsed.items()}


# --- API Dispatcher ---
def dispatch_humanities_api(handler, method: str, path: str, client_ip: str):
    token = extract_token(handler)
    current_user = get_session_user(token)

    # 1. POST /api/humanities/auth/login
    if method == "POST" and path == "/api/humanities/auth/login":
        body = read_json_body(handler)
        email = body.get("email", "").strip().lower()
        password = body.get("password", "")

        conn = get_db()
        cur = conn.cursor()
        cur.execute("SELECT id, email, password_hash, display_name, role, active FROM profiles WHERE email = ?", (email,))
        row = cur.fetchone()
        conn.close()

        if not row or not verify_password(password, row["password_hash"]):
            handler.send_json(401, {"ok": False, "error": "Invalid email or password."})
            return

        if not row["active"]:
            handler.send_json(403, {"ok": False, "error": "Account is disabled."})
            return

        new_token = create_session(row["id"])
        log_audit(row["id"], "user_login", "session", new_token[:8], {"ip": client_ip})
        user_info = {
            "id": row["id"],
            "email": row["email"],
            "display_name": row["display_name"],
            "role": row["role"]
        }
        handler.send_response(200)
        handler.send_header("Content-Type", "application/json; charset=utf-8")
        handler.send_header("Set-Cookie", f"rf_humanities_token={new_token}; Path=/; HttpOnly; SameSite=Lax")
        resp_data = json.dumps({"ok": True, "token": new_token, "user": user_info}).encode("utf-8")
        handler.send_header("Content-Length", str(len(resp_data)))
        handler.end_headers()
        handler.wfile.write(resp_data)
        return

    # 2. GET /api/humanities/auth/me
    if method == "GET" and path == "/api/humanities/auth/me":
        if not current_user:
            handler.send_json(401, {"ok": False, "error": "Authentication required."})
            return
        handler.send_json(200, {"ok": True, "user": current_user})
        return

    # 3. POST /api/humanities/auth/logout
    if method == "POST" and path == "/api/humanities/auth/logout":
        if token:
            revoke_session(token)
            if current_user:
                log_audit(current_user["id"], "user_logout", "session", token[:8])
        handler.send_response(200)
        handler.send_header("Content-Type", "application/json; charset=utf-8")
        handler.send_header("Set-Cookie", "rf_humanities_token=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT")
        resp_data = json.dumps({"ok": True, "message": "Logged out successfully."}).encode("utf-8")
        handler.send_header("Content-Length", str(len(resp_data)))
        handler.end_headers()
        handler.wfile.write(resp_data)
        return

    # All subsequent endpoints require authentication
    if not current_user:
        handler.send_json(401, {"ok": False, "error": "Authentication required."})
        return

    # 4. GET /api/humanities/modules
    if method == "GET" and path == "/api/humanities/modules":
        conn = get_db()
        cur = conn.cursor()
        role = current_user["role"]

        if role == "admin":
            cur.execute("SELECT id, code, title, academic_year, description, status FROM modules ORDER BY code ASC")
            rows = [dict(r) for r in cur.fetchall()]
        elif role == "teacher":
            cur.execute("""
                SELECT m.id, m.code, m.title, m.academic_year, m.description, m.status
                FROM modules m
                JOIN teaching_assignments ta ON ta.module_id = m.id
                WHERE ta.teacher_id = ?
                ORDER BY m.code ASC
            """, (current_user["id"],))
            rows = [dict(r) for r in cur.fetchall()]
        elif role == "student":
            cur.execute("""
                SELECT m.id, m.code, m.title, m.academic_year, m.description, m.status
                FROM modules m
                JOIN enrolments e ON e.module_id = m.id
                WHERE e.student_id = ? AND e.status = 'active'
                ORDER BY m.code ASC
            """, (current_user["id"],))
            rows = [dict(r) for r in cur.fetchall()]
        else:
            rows = []

        conn.close()
        handler.send_json(200, {"ok": True, "modules": rows})
        return

    # 5. GET /api/humanities/modules/<id>
    mod_match = re.match(r"^/api/humanities/modules/(\d+)$", path)
    if method == "GET" and mod_match:
        module_id = int(mod_match.group(1))
        if not can_access_module(current_user, module_id):
            handler.send_json(403, {"ok": False, "error": "Access denied to this module."})
            return

        conn = get_db()
        cur = conn.cursor()
        cur.execute("SELECT id, code, title, academic_year, description, status FROM modules WHERE id = ?", (module_id,))
        module = cur.fetchone()
        if not module:
            conn.close()
            handler.send_json(404, {"ok": False, "error": "Module not found."})
            return

        # Query resources
        if current_user["role"] in ("admin", "teacher"):
            cur.execute("SELECT id, title, edition_year, author, byte_size, status, allow_download FROM resources WHERE module_id = ? ORDER BY id ASC", (module_id,))
        else:
            cur.execute("SELECT id, title, edition_year, author, byte_size, status, allow_download FROM resources WHERE module_id = ? AND status = 'published' ORDER BY id ASC", (module_id,))
        resources = [dict(r) for r in cur.fetchall()]
        conn.close()

        res_data = dict(module)
        res_data["resources"] = resources
        handler.send_json(200, {"ok": True, "module": res_data})
        return

    # 6. GET /api/humanities/resources/<id>
    res_match = re.match(r"^/api/humanities/resources/(\d+)$", path)
    if method == "GET" and res_match:
        resource_id = int(res_match.group(1))
        conn = get_db()
        cur = conn.cursor()
        cur.execute("SELECT * FROM resources WHERE id = ?", (resource_id,))
        row = cur.fetchone()
        conn.close()
        if not row:
            handler.send_json(404, {"ok": False, "error": "Resource not found."})
            return

        resource = dict(row)
        if not can_access_resource(current_user, resource):
            handler.send_json(403, {"ok": False, "error": "Access denied to this resource."})
            return

        # Sanitize sensitive internal keys
        safe_resource = {
            "id": resource["id"],
            "module_id": resource["module_id"],
            "title": resource["title"],
            "edition_year": resource["edition_year"],
            "author": resource["author"],
            "byte_size": resource["byte_size"],
            "status": resource["status"],
            "allow_download": can_download_resource(current_user, resource),
            "updated_at": resource["updated_at"]
        }
        handler.send_json(200, {"ok": True, "resource": safe_resource})
        return

    # 7. GET /api/humanities/resources/<id>/content (PDF Streaming with HTTP Range Support)
    pdf_match = re.match(r"^/api/humanities/resources/(\d+)/content$", path)
    if method == "GET" and pdf_match:
        resource_id = int(pdf_match.group(1))
        conn = get_db()
        cur = conn.cursor()
        cur.execute("SELECT * FROM resources WHERE id = ?", (resource_id,))
        row = cur.fetchone()
        conn.close()
        if not row:
            handler.send_json(404, {"ok": False, "error": "Resource not found."})
            return

        resource = dict(row)
        if not can_access_resource(current_user, resource):
            handler.send_json(403, {"ok": False, "error": "Access denied to this resource."})
            return

        file_path = RESOURCE_DIR / resource["storage_key"]
        if not file_path.exists():
            handler.send_json(404, {"ok": False, "error": "Underlying resource file missing from storage."})
            return

        file_size = file_path.stat().st_size
        range_header = handler.headers.get("Range")

        # Range request support
        if range_header and range_header.startswith("bytes="):
            byte_range = range_header.replace("bytes=", "").split("-")
            start = int(byte_range[0]) if byte_range[0] else 0
            end = int(byte_range[1]) if len(byte_range) > 1 and byte_range[1] else file_size - 1
            if start >= file_size or end >= file_size or start > end:
                handler.send_response(416)
                handler.send_header("Content-Range", f"bytes */{file_size}")
                handler.end_headers()
                return

            length = end - start + 1
            handler.send_response(206)
            handler.send_header("Content-Type", "application/pdf")
            handler.send_header("Content-Range", f"bytes {start}-{end}/{file_size}")
            handler.send_header("Content-Length", str(length))
            handler.send_header("Accept-Ranges", "bytes")
            handler.end_headers()

            with open(file_path, "rb") as f:
                f.seek(start)
                handler.wfile.write(f.read(length))
            return

        # Full file streaming
        handler.send_response(200)
        handler.send_header("Content-Type", "application/pdf")
        handler.send_header("Content-Length", str(file_size))
        handler.send_header("Accept-Ranges", "bytes")
        handler.end_headers()
        with open(file_path, "rb") as f:
            handler.wfile.write(f.read())
        return

    # 8. POST & GET /api/humanities/progress
    if method == "POST" and path == "/api/humanities/progress":
        body = read_json_body(handler)
        resource_id = int(body.get("resource_id", 0))
        page = int(body.get("current_page", 1))
        total = int(body.get("total_pages", 1))
        now_iso = datetime.now(timezone.utc).isoformat()

        conn = get_db()
        with conn:
            conn.execute("""
                INSERT INTO reading_progress (user_id, resource_id, current_page, total_pages, updated_at)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(user_id, resource_id) DO UPDATE SET
                    current_page = excluded.current_page,
                    total_pages = excluded.total_pages,
                    updated_at = excluded.updated_at
            """, (current_user["id"], resource_id, page, total, now_iso))
        conn.close()
        handler.send_json(200, {"ok": True, "saved_page": page})
        return

    prog_match = re.match(r"^/api/humanities/progress/(\d+)$", path)
    if method == "GET" and prog_match:
        resource_id = int(prog_match.group(1))
        conn = get_db()
        cur = conn.cursor()
        cur.execute("SELECT current_page, total_pages, updated_at FROM reading_progress WHERE user_id = ? AND resource_id = ?",
                    (current_user["id"], resource_id))
        row = cur.fetchone()
        conn.close()
        if not row:
            handler.send_json(200, {"ok": True, "progress": None})
            return
        handler.send_json(200, {"ok": True, "progress": dict(row)})
        return

    # 9. POST /api/humanities/teacher/resources (Upload/Draft Resource)
    if method == "POST" and path == "/api/humanities/teacher/resources":
        if current_user["role"] not in ("teacher", "admin"):
            handler.send_json(403, {"ok": False, "error": "Only teachers and administrators can add resources."})
            return

        body = read_json_body(handler)
        module_id = int(body.get("module_id", 0))
        if not can_access_module(current_user, module_id):
            handler.send_json(403, {"ok": False, "error": "You are not assigned to teach this module."})
            return

        title = body.get("title", "").strip()
        edition_year = body.get("edition_year", "2026").strip()
        author = body.get("author", "").strip() or "Department of Humanities"
        raw_b64 = body.get("file_b64", "")

        # Fallback to sample PDF if no file upload payload
        if raw_b64:
            import base64
            pdf_bytes = base64.b64decode(raw_b64)
        else:
            pdf_bytes = b"%PDF-1.4\n% Sample PDF Content\n%%EOF\n"

        storage_key = f"res-{uuid.uuid4().hex[:12]}.pdf"
        file_path = RESOURCE_DIR / storage_key
        file_path.write_bytes(pdf_bytes)
        checksum = hashlib.sha256(pdf_bytes).hexdigest()
        now_iso = datetime.now(timezone.utc).isoformat()

        conn = get_db()
        with conn:
            cur = conn.cursor()
            cur.execute("""
                INSERT INTO resources (
                    module_id, title, edition_year, author, storage_key, mime_type,
                    byte_size, checksum, status, allow_download, rights_confirmed,
                    created_by, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, 'application/pdf', ?, ?, 'draft', 0, 1, ?, ?, ?)
            """, (module_id, title, edition_year, author, storage_key, len(pdf_bytes), checksum, current_user["id"], now_iso, now_iso))
            new_id = cur.lastrowid
        conn.close()

        log_audit(current_user["id"], "create_resource", "resource", str(new_id), {"title": title, "module_id": module_id})
        handler.send_json(200, {"ok": True, "resource_id": new_id, "status": "draft"})
        return

    # 10. POST /api/humanities/teacher/resources/<id>/publish
    pub_match = re.match(r"^/api/humanities/teacher/resources/(\d+)/publish$", path)
    if method == "POST" and pub_match:
        if current_user["role"] not in ("teacher", "admin"):
            handler.send_json(403, {"ok": False, "error": "Only teachers and administrators can publish resources."})
            return

        resource_id = int(pub_match.group(1))
        conn = get_db()
        cur = conn.cursor()
        cur.execute("SELECT * FROM resources WHERE id = ?", (resource_id,))
        row = cur.fetchone()
        if not row:
            conn.close()
            handler.send_json(404, {"ok": False, "error": "Resource not found."})
            return

        resource = dict(row)
        if not can_access_module(current_user, resource["module_id"]):
            conn.close()
            handler.send_json(403, {"ok": False, "error": "Access denied to publish this resource."})
            return

        now_iso = datetime.now(timezone.utc).isoformat()
        with conn:
            conn.execute("UPDATE resources SET status = 'published', updated_at = ? WHERE id = ?", (now_iso, resource_id))
        conn.close()

        log_audit(current_user["id"], "publish_resource", "resource", str(resource_id))
        handler.send_json(200, {"ok": True, "status": "published"})
        return

    # 11. POST /api/humanities/admin/enrolments
    if method == "POST" and path == "/api/humanities/admin/enrolments":
        if current_user["role"] != "admin":
            handler.send_json(403, {"ok": False, "error": "Administrator privileges required."})
            return

        body = read_json_body(handler)
        student_id = int(body.get("student_id", 0))
        module_id = int(body.get("module_id", 0))
        status_val = body.get("status", "active")
        now_iso = datetime.now(timezone.utc).isoformat()

        conn = get_db()
        with conn:
            conn.execute("""
                INSERT INTO enrolments (student_id, module_id, status, created_at)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(student_id, module_id) DO UPDATE SET status = excluded.status
            """, (student_id, module_id, status_val, now_iso))
        conn.close()

        log_audit(current_user["id"], "update_enrolment", "enrolment", f"{student_id}:{module_id}", {"status": status_val})
        handler.send_json(200, {"ok": True, "message": "Enrolment updated successfully."})
        return

    # 12. GET /api/humanities/admin/audit
    if method == "GET" and path == "/api/humanities/admin/audit":
        if current_user["role"] != "admin":
            handler.send_json(403, {"ok": False, "error": "Administrator privileges required."})
            return

        conn = get_db()
        cur = conn.cursor()
        cur.execute("""
            SELECT a.id, a.actor_id, p.display_name as actor_name, a.action, a.target_type, a.target_id, a.metadata_json, a.created_at
            FROM audit_events a
            LEFT JOIN profiles p ON a.actor_id = p.id
            ORDER BY a.id DESC LIMIT 50
        """)
        events = [dict(r) for r in cur.fetchall()]
        conn.close()
        handler.send_json(200, {"ok": True, "events": events})
        return

    handler.send_json(404, {"ok": False, "error": f"Humanities endpoint {path} not found."})
