#!/usr/bin/env python3
"""
Ridgefield Academy - Local Integration Server
Serves static site files and handles local application/enquiry endpoints:
- POST /api/send-application
- POST /api/send-enquiry
- GET  /api/health
- GET  /api/submissions (internal test review endpoint)

Captures submissions durably in private storage (storage/submissions.sqlite3 and JSON files)
without attempting email transmission in local development mode.
"""

import http.server
import socketserver
import urllib.parse
import json
import os
import sys
import re
import time
import uuid
import hashlib
import sqlite3
import mimetypes
from datetime import datetime, timezone
from pathlib import Path

try:
    import humanities_backend
except ImportError:
    humanities_backend = None

# Paths
BASE_DIR = Path(__file__).resolve().parent.parent
STORAGE_DIR = BASE_DIR / "storage"
APP_DIR = STORAGE_DIR / "submissions" / "applications"
ENQ_DIR = STORAGE_DIR / "submissions" / "enquiries"
DB_PATH = STORAGE_DIR / "submissions.sqlite3"

STORAGE_DIR.mkdir(parents=True, exist_ok=True)
APP_DIR.mkdir(parents=True, exist_ok=True)
ENQ_DIR.mkdir(parents=True, exist_ok=True)

# Rate limiting dictionary: { ip: [timestamp1, timestamp2, ...] }
RATE_LIMIT_STORE = {}
RATE_LIMIT_WINDOW = 60  # seconds
RATE_LIMIT_MAX = 15     # max requests per window

# Validation constants
EMAIL_REGEX = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
PHONE_REGEX = re.compile(r"^[\d\s\+\-\(\)]{7,25}$")
DATE_REGEX = re.compile(r"^\d{4}-\d{2}-\d{2}$")

VALID_PATHWAYS = {"Cambridge", "CAPS Secondary", "Primary"}
VALID_ENQUIRY_TYPES = {
    "Admissions", "Fees", "Academics", "Cambridge", 
    "CAPS Secondary", "Primary", "Book Lists", "General",
    "General Enquiries", "Campus Tours & Visits"
}

FORBIDDEN_PREFIXES = (
    "storage", "database", ".git", "scripts", "tests", 
    "server", "node_modules", ".env", "deploy-manifest.json"
)

def init_db():
    conn = sqlite3.connect(DB_PATH)
    with conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS submissions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                receipt_id TEXT UNIQUE NOT NULL,
                submission_type TEXT NOT NULL,
                client_reference TEXT,
                dedupe_hash TEXT,
                created_at TEXT NOT NULL,
                status TEXT NOT NULL,
                ip TEXT,
                payload_json TEXT NOT NULL
            );
        """)
        conn.execute("CREATE INDEX IF NOT EXISTS idx_submissions_dedupe ON submissions (dedupe_hash, created_at);")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_submissions_type ON submissions (submission_type, created_at);")
    conn.close()

init_db()

def is_rate_limited(ip: str) -> bool:
    now = time.time()
    timestamps = RATE_LIMIT_STORE.get(ip, [])
    # keep only within window
    timestamps = [t for t in timestamps if now - t < RATE_LIMIT_WINDOW]
    if len(timestamps) >= RATE_LIMIT_MAX:
        RATE_LIMIT_STORE[ip] = timestamps
        return True
    timestamps.append(now)
    RATE_LIMIT_STORE[ip] = timestamps
    return False

def check_duplicate(submission_type: str, dedupe_hash: str, window_seconds: int = 60):
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("""
        SELECT receipt_id, created_at FROM submissions 
        WHERE submission_type = ? AND dedupe_hash = ?
        ORDER BY id DESC LIMIT 1
    """, (submission_type, dedupe_hash))
    row = cursor.fetchone()
    conn.close()
    if not row:
        return None
    receipt_id, created_at_iso = row
    try:
        created_dt = datetime.fromisoformat(created_at_iso)
        if (datetime.now(timezone.utc) - created_dt).total_seconds() < window_seconds:
            return receipt_id
    except Exception:
        pass
    return None

def persist_submission(submission_type: str, client_ref: str, dedupe_hash: str, data: dict, ip: str) -> str:
    now_iso = datetime.now(timezone.utc).isoformat()
    rand_hex = uuid.uuid4().hex[:8].upper()
    date_str = datetime.now(timezone.utc).strftime("%Y%m%d")
    prefix = "REC-APP" if submission_type == "application" else "REC-ENQ"
    receipt_id = f"{prefix}-{date_str}-{rand_hex}"

    payload = {
        "receipt_id": receipt_id,
        "submission_type": submission_type,
        "client_reference": client_ref,
        "submitted_at": now_iso,
        "client_ip": ip,
        "mode": "local-capture",
        "email_delivery": "none_captured_locally_for_test",
        "data": data
    }

    # 1. Atomic write to SQLite
    conn = sqlite3.connect(DB_PATH, timeout=10)
    with conn:
        conn.execute("""
            INSERT INTO submissions (receipt_id, submission_type, client_reference, dedupe_hash, created_at, status, ip, payload_json)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            receipt_id,
            submission_type,
            client_ref,
            dedupe_hash,
            now_iso,
            "captured_local",
            ip,
            json.dumps(payload, ensure_ascii=False)
        ))
    conn.close()

    # 2. Atomic write to JSON file
    target_dir = APP_DIR if submission_type == "application" else ENQ_DIR
    target_file = target_dir / f"{receipt_id}.json"
    temp_file = target_dir / f"{receipt_id}.json.tmp.{uuid.uuid4().hex[:6]}"
    
    with open(temp_file, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2, ensure_ascii=False)
    temp_file.replace(target_file)

    return receipt_id


class RidgefieldRequestHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(BASE_DIR), **kwargs)

    def end_headers(self):
        # Security headers matching _headers
        self.send_header("X-Frame-Options", "DENY")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "strict-origin-when-cross-origin")
        super().end_headers()

    def send_json(self, status_code: int, data: dict):
        body = json.dumps(data).encode("utf-8")
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        # Health endpoint
        if path == "/api/health":
            self.send_json(200, {
                "ok": True,
                "service": "Ridgefield Academy Local Integration Server",
                "mode": "local-capture",
                "time": datetime.now(timezone.utc).isoformat()
            })
            return

        # Humanities API GET routes
        if path.startswith("/api/humanities/") and humanities_backend:
            humanities_backend.dispatch_humanities_api(self, "GET", path, self.client_address[0])
            return

        # Local submission review endpoint for test verification
        if path == "/api/submissions":
            conn = sqlite3.connect(DB_PATH)
            cursor = conn.cursor()
            cursor.execute("SELECT receipt_id, submission_type, client_reference, created_at, status FROM submissions ORDER BY id DESC LIMIT 50")
            rows = cursor.fetchall()
            conn.close()
            records = [
                {"receipt_id": r[0], "type": r[1], "client_reference": r[2], "created_at": r[3], "status": r[4]}
                for r in rows
            ]
            self.send_json(200, {"ok": True, "count": len(records), "submissions": records})
            return

        # Security check: Block private and internal directories
        clean_path = path.lstrip("/").replace("\\", "/")
        for forbidden in FORBIDDEN_PREFIXES:
            if clean_path == forbidden or clean_path.startswith(forbidden + "/"):
                self.send_error(403, "Access to private resources is forbidden.")
                return

        # Serve static files as default
        super().do_GET()

    def do_POST(self):
        client_ip = self.client_address[0]
        if is_rate_limited(client_ip):
            self.send_json(429, {"ok": False, "error": "Too many requests. Please wait before submitting again."})
            return

        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        # Humanities API POST routes
        if path.startswith("/api/humanities/") and humanities_backend:
            humanities_backend.dispatch_humanities_api(self, "POST", path, client_ip)
            return

        content_length_str = self.headers.get("Content-Length", "0")
        try:
            content_length = int(content_length_str)
        except ValueError:
            self.send_json(400, {"ok": False, "error": "Invalid Content-Length header."})
            return

        if content_length > 65536:  # 64 KB limit
            self.send_json(413, {"ok": False, "error": "Submission payload exceeds allowed size limit."})
            return

        raw_body = self.rfile.read(content_length).decode("utf-8", errors="replace")
        form_data = urllib.parse.parse_qs(raw_body, keep_blank_values=True)
        # flatten single values
        data = {k: v[0] if len(v) == 1 else v for k, v in form_data.items()}

        if path == "/api/send-application":
            self.handle_send_application(data, client_ip)
        elif path == "/api/send-enquiry":
            self.handle_send_enquiry(data, client_ip)
        else:
            self.send_json(404, {"ok": False, "error": f"Endpoint {path} not found."})

    def handle_send_application(self, data: dict, ip: str):
        # Honeypot validation
        bot_field = data.get("bot-field", "").strip()
        if bot_field:
            self.send_json(400, {"ok": False, "error": "Automated submission detected."})
            return

        # Authoritative field validation
        first_name = data.get("learner-first-name", "").strip()
        last_name = data.get("learner-last-name", "").strip()
        dob = data.get("date-of-birth", "").strip()
        guardian_name = data.get("guardian-name", "").strip()
        guardian_email = data.get("guardian-email", "").strip()
        guardian_phone = data.get("guardian-phone", "").strip()
        pathway = data.get("pathway", "").strip()
        campus = data.get("campus", "").strip()
        grade = data.get("grade-applying", "").strip()
        privacy = data.get("privacy-consent", "").strip().lower()
        client_ref = data.get("application-reference", "").strip()

        errors = []
        if not first_name or len(first_name) > 100:
            errors.append("Learner first name is required (max 100 characters).")
        if not last_name or len(last_name) > 100:
            errors.append("Learner last name is required (max 100 characters).")
        if not dob or not DATE_REGEX.match(dob):
            errors.append("Learner date of birth is required in YYYY-MM-DD format.")
        if not guardian_name or len(guardian_name) > 120:
            errors.append("Parent/Guardian name is required (max 120 characters).")
        if not guardian_email or not EMAIL_REGEX.match(guardian_email) or len(guardian_email) > 150:
            errors.append("A valid Parent/Guardian email address is required.")
        if not guardian_phone or not PHONE_REGEX.match(guardian_phone):
            errors.append("A valid contact telephone number is required.")
        if pathway not in VALID_PATHWAYS:
            errors.append(f"Invalid pathway '{pathway}'. Must be Cambridge, CAPS Secondary, or Primary.")
        if not campus:
            errors.append("Campus assignment is required.")
        if not grade:
            errors.append("Grade applying for is required.")
        if privacy not in ("agreed", "yes", "true", "on", "1"):
            errors.append("Consent to process admissions data under POPIA is required.")

        if errors:
            self.send_json(400, {"ok": False, "error": " ".join(errors)})
            return

        # Idempotency dedupe check
        dedupe_str = f"{guardian_email.lower()}:{first_name.lower()}:{last_name.lower()}:{pathway}:{grade}"
        dedupe_hash = hashlib.sha256(dedupe_str.encode("utf-8")).hexdigest()
        existing_receipt = check_duplicate("application", dedupe_hash, window_seconds=60)
        if existing_receipt:
            self.send_json(200, {
                "ok": True,
                "reference": existing_receipt,
                "duplicate": True,
                "mode": "local-capture",
                "message": "Application already captured recently. Existing receipt returned."
            })
            return

        # Atomic durable write
        try:
            receipt_id = persist_submission("application", client_ref, dedupe_hash, data, ip)
        except Exception as e:
            self.send_json(500, {"ok": False, "error": "Internal storage error while saving application."})
            return

        self.send_json(200, {
            "ok": True,
            "reference": receipt_id,
            "mode": "local-capture",
            "message": "Captured locally for testing. No email delivered in test mode."
        })

    def handle_send_enquiry(self, data: dict, ip: str):
        # Honeypot validation
        bot_field = data.get("bot-field", "").strip()
        if bot_field:
            self.send_json(400, {"ok": False, "error": "Automated submission detected."})
            return

        name = data.get("name", "").strip()
        email = data.get("email", "").strip()
        phone = data.get("phone", "").strip()
        enquiry_type = data.get("enquiry-type", "").strip()
        preferred_contact = data.get("preferred-contact", "").strip()
        message = data.get("message", "").strip()
        privacy = data.get("privacy-consent", "").strip().lower()
        client_ref = data.get("enquiry-reference", "").strip()

        errors = []
        if not name or len(name) > 120:
            errors.append("Name is required (max 120 characters).")
        if not email or not EMAIL_REGEX.match(email) or len(email) > 150:
            errors.append("A valid email address is required.")
        if enquiry_type not in VALID_ENQUIRY_TYPES:
            errors.append(f"Invalid enquiry type '{enquiry_type}'.")
        if preferred_contact == "Phone call" and (not phone or not PHONE_REGEX.match(phone)):
            errors.append("A valid telephone number is required when phone call contact is requested.")
        elif phone and not PHONE_REGEX.match(phone):
            errors.append("Provided telephone number format is invalid.")
        if not message or len(message) < 5 or len(message) > 3000:
            errors.append("Message must be between 5 and 3000 characters.")
        if privacy not in ("agreed", "yes", "true", "on", "1"):
            errors.append("Consent to process enquiry data under POPIA is required.")

        if errors:
            self.send_json(400, {"ok": False, "error": " ".join(errors)})
            return

        # Idempotency dedupe check
        dedupe_str = f"{email.lower()}:{enquiry_type}:{message[:100]}"
        dedupe_hash = hashlib.sha256(dedupe_str.encode("utf-8")).hexdigest()
        existing_receipt = check_duplicate("enquiry", dedupe_hash, window_seconds=60)
        if existing_receipt:
            self.send_json(200, {
                "ok": True,
                "reference": existing_receipt,
                "duplicate": True,
                "mode": "local-capture",
                "message": "Enquiry already captured recently. Existing receipt returned."
            })
            return

        # Atomic durable write
        try:
            receipt_id = persist_submission("enquiry", client_ref, dedupe_hash, data, ip)
        except Exception as e:
            self.send_json(500, {"ok": False, "error": "Internal storage error while saving enquiry."})
            return

        self.send_json(200, {
            "ok": True,
            "reference": receipt_id,
            "mode": "local-capture",
            "message": "Captured locally for testing. No email delivered in test mode."
        })


def run_server(port=8080, host="127.0.0.1"):
    server_address = (host, port)
    # Allow reuse of socket address
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(server_address, RidgefieldRequestHandler) as httpd:
        print(f"Ridgefield Academy Local Integration Server running at http://{host}:{port}/")
        print(f"Storage path: {STORAGE_DIR}")
        print("Mode: local-capture (No external emails sent; submissions stored locally)")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nShutting down server.")

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Ridgefield Academy Local Integration Server")
    parser.add_argument("--port", type=int, default=8080, help="Port to listen on (default: 8080)")
    parser.add_argument("--host", type=str, default="127.0.0.1", help="Host interface (default: 127.0.0.1)")
    args = parser.parse_args()
    run_server(port=args.port, host=args.host)
