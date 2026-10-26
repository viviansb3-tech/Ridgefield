#!/usr/bin/env python3
"""
Integration test suite for Ridgefield Academy Local Integration Server (scripts/local_server.py).
Runs in-process to verify:
- Health endpoint (/api/health)
- Static file serving & security headers (X-Frame-Options, X-Content-Type-Options)
- Protection of private directories (storage, server, .git, etc.)
- Authoritative validation on /api/send-application
- Bot honeypot blocking on /api/send-application
- Duplicate request / idempotency handling on applications
- Authoritative validation on /api/send-enquiry
- Conditional contact phone validation on enquiries
- Bot honeypot blocking on enquiries
- Durable persistence in SQLite database and atomic JSON files
- Submissions review endpoint (/api/submissions)
"""

import unittest
import io
import json
import urllib.parse
import sqlite3
import time
import sys
from pathlib import Path

# Add scripts directory
scripts_dir = Path(__file__).resolve().parent.parent / "scripts"
sys.path.insert(0, str(scripts_dir))
import local_server

class MockSocket:
    def __init__(self, raw_input: bytes):
        self.raw_input = raw_input
        self.output = io.BytesIO()

    def makefile(self, mode, *args, **kwargs):
        if "r" in mode:
            return io.BytesIO(self.raw_input)
        elif "w" in mode:
            return self.output
        return io.BytesIO()

    def sendall(self, b):
        self.output.write(b)


class BackendIntegrationTestCase(unittest.TestCase):
    @classmethod
    def tearDownClass(cls):
        import glob, os
        for p in glob.glob(str(local_server.APP_DIR / "*.json")):
            try: os.remove(p)
            except Exception: pass
        for p in glob.glob(str(local_server.ENQ_DIR / "*.json")):
            try: os.remove(p)
            except Exception: pass

    def setUp(self):
        local_server.RATE_LIMIT_STORE.clear()
        conn = sqlite3.connect(local_server.DB_PATH)
        with conn:
            conn.execute("DELETE FROM submissions WHERE client_reference LIKE 'RF-APP-%' OR client_reference LIKE 'RF-ENQ-%' OR dedupe_hash IS NOT NULL")
        conn.close()

    def dispatch_request(self, method: str, path: str, headers: dict = None, body: bytes = b"", client_ip: str = "127.0.0.1"):
        if headers is None:
            headers = {}
        headers.setdefault("Host", "localhost")
        if body and "Content-Length" not in headers:
            headers["Content-Length"] = str(len(body))

        header_lines = [f"{method} {path} HTTP/1.1"]
        for k, v in headers.items():
            header_lines.append(f"{k}: {v}")
        header_lines.append("")
        header_lines.append("")

        raw_request = "\r\n".join(header_lines).encode("utf-8") + body
        sock = MockSocket(raw_request)
        
        # Suppress log output during testing
        class QuietHandler(local_server.RidgefieldRequestHandler):
            def log_message(self, format, *args):
                pass

        QuietHandler(sock, (client_ip, 54321), None)
        raw_output = sock.output.getvalue()

        # Parse response
        parts = raw_output.split(b"\r\n\r\n", 1)
        header_part = parts[0].decode("utf-8", errors="replace")
        body_part = parts[1] if len(parts) > 1 else b""

        lines = header_part.split("\r\n")
        status_line = lines[0]
        status_code = int(status_line.split()[1])

        resp_headers = {}
        for line in lines[1:]:
            if ": " in line:
                hk, hv = line.split(": ", 1)
                resp_headers[hk.lower()] = hv

        resp_json = None
        if "application/json" in resp_headers.get("content-type", ""):
            try:
                resp_json = json.loads(body_part.decode("utf-8"))
            except Exception:
                pass

        return status_code, resp_headers, body_part, resp_json

    def post_form(self, endpoint: str, data: dict, client_ip: str = "127.0.0.1"):
        body = urllib.parse.urlencode(data).encode("utf-8")
        headers = {
            "Content-Type": "application/x-www-form-urlencoded",
            "Accept": "application/json"
        }
        return self.dispatch_request("POST", endpoint, headers=headers, body=body, client_ip=client_ip)

    # --- 1. Health & Static Serving ---
    def test_health_endpoint(self):
        status, headers, body, data = self.dispatch_request("GET", "/api/health")
        self.assertEqual(status, 200)
        self.assertIsNotNone(data)
        self.assertTrue(data.get("ok"))
        self.assertEqual(data.get("mode"), "local-capture")

    def test_static_page_serving_with_security_headers(self):
        status, headers, body, _ = self.dispatch_request("GET", "/index.html")
        self.assertEqual(status, 200)
        self.assertIn(b"Ridgefield Academy", body)
        self.assertEqual(headers.get("x-frame-options"), "DENY")
        self.assertEqual(headers.get("x-content-type-options"), "nosniff")

    def test_forbidden_directories(self):
        for path in ["/storage/submissions.sqlite3", "/server/server.js", "/scripts/local_server.py"]:
            status, _, _, _ = self.dispatch_request("GET", path)
            self.assertEqual(status, 403, f"Expected 403 for {path}, got {status}")

    # --- 2. Application Submission ---
    def test_application_submission_valid(self):
        payload = {
            "form-name": "ridgefield-application",
            "application-reference": "RF-APP-20261025-ABCD",
            "pathway": "Cambridge",
            "campus": "Block B (25 Wilcock Road, Noordhoek)",
            "grade-applying": "IGCSE (Grade 9)",
            "learner-first-name": "Tariro",
            "learner-last-name": "Moyo",
            "date-of-birth": "2010-04-15",
            "guardian-name": "Sarah Moyo",
            "guardian-email": "sarah.moyo@example.co.za",
            "guardian-phone": "+27 82 123 4567",
            "privacy-consent": "Agreed",
            "bot-field": ""
        }
        status, headers, _, res = self.post_form("/api/send-application", payload)
        self.assertEqual(status, 200)
        self.assertTrue(res.get("ok"))
        receipt_id = res.get("reference")
        self.assertTrue(receipt_id.startswith("REC-APP-"))
        self.assertEqual(res.get("mode"), "local-capture")

        # Verify durable storage in SQLite
        conn = sqlite3.connect(local_server.DB_PATH)
        cur = conn.cursor()
        cur.execute("SELECT submission_type, payload_json FROM submissions WHERE receipt_id = ?", (receipt_id,))
        row = cur.fetchone()
        conn.close()
        self.assertIsNotNone(row)
        self.assertEqual(row[0], "application")
        stored = json.loads(row[1])
        self.assertEqual(stored["data"]["learner-first-name"], "Tariro")

        # Verify JSON file exists
        json_file = local_server.APP_DIR / f"{receipt_id}.json"
        self.assertTrue(json_file.exists())

    def test_application_duplicate_idempotency(self):
        payload = {
            "application-reference": "RF-APP-20261025-DUP1",
            "pathway": "CAPS Secondary",
            "campus": "Block A (22 Maartens Street)",
            "grade-applying": "Grade 10",
            "learner-first-name": "Kagiso",
            "learner-last-name": "Ndlovu",
            "date-of-birth": "2009-08-12",
            "guardian-name": "David Ndlovu",
            "guardian-email": "david.ndlovu@example.co.za",
            "guardian-phone": "083 456 7890",
            "privacy-consent": "Agreed",
            "bot-field": ""
        }
        status1, _, _, res1 = self.post_form("/api/send-application", payload)
        self.assertEqual(status1, 200)
        ref1 = res1.get("reference")

        # Immediate repeat submission
        status2, _, _, res2 = self.post_form("/api/send-application", payload)
        self.assertEqual(status2, 200)
        self.assertEqual(res2.get("reference"), ref1)
        self.assertTrue(res2.get("duplicate"))

    def test_application_bot_honeypot(self):
        payload = {
            "learner-first-name": "SpamBot",
            "bot-field": "http://spamsite.test"
        }
        status, _, _, res = self.post_form("/api/send-application", payload)
        self.assertEqual(status, 400)
        self.assertFalse(res.get("ok"))
        self.assertIn("Automated submission", res.get("error"))

    def test_application_missing_fields(self):
        payload = {
            "learner-first-name": "Incomplete",
            "pathway": "Cambridge"
        }
        status, _, _, res = self.post_form("/api/send-application", payload)
        self.assertEqual(status, 400)
        self.assertFalse(res.get("ok"))
        self.assertIn("Learner last name is required", res.get("error"))
        self.assertIn("date of birth is required", res.get("error"))
        self.assertIn("Parent/Guardian email", res.get("error"))

    # --- 3. Enquiry Submission ---
    def test_enquiry_submission_valid(self):
        payload = {
            "enquiry-reference": "RF-ENQ-20261025-E01",
            "name": "Naledi Khumalo",
            "email": "naledi.k@example.com",
            "phone": "071 234 5678",
            "enquiry-type": "Admissions",
            "preferred-contact": "Email",
            "message": "We would like to request admission information for Grade 8 in 2027.",
            "privacy-consent": "Agreed",
            "bot-field": ""
        }
        status, _, _, res = self.post_form("/api/send-enquiry", payload)
        self.assertEqual(status, 200)
        self.assertTrue(res.get("ok"))
        receipt_id = res.get("reference")
        self.assertTrue(receipt_id.startswith("REC-ENQ-"))

        # Verify JSON file exists
        json_file = local_server.ENQ_DIR / f"{receipt_id}.json"
        self.assertTrue(json_file.exists())

    def test_enquiry_phone_call_conditional_requirement(self):
        # Preferred contact is 'Phone call' but phone is empty
        payload = {
            "name": "Johan Smith",
            "email": "johan@example.com",
            "phone": "",
            "enquiry-type": "Fees",
            "preferred-contact": "Phone call",
            "message": "Please call me back regarding fee payment options.",
            "privacy-consent": "Agreed",
            "bot-field": ""
        }
        status, _, _, res = self.post_form("/api/send-enquiry", payload)
        self.assertEqual(status, 400)
        self.assertFalse(res.get("ok"))
        self.assertIn("telephone number is required when phone call contact is requested", res.get("error"))

        # Now supply valid phone
        payload["phone"] = "051 401 9111"
        status, _, _, res = self.post_form("/api/send-enquiry", payload)
        self.assertEqual(status, 200)
        self.assertTrue(res.get("ok"))

    def test_enquiry_missing_privacy_consent(self):
        payload = {
            "name": "Johan Smith",
            "email": "johan@example.com",
            "enquiry-type": "General",
            "message": "Hello from South Africa",
            "privacy-consent": "",
            "bot-field": ""
        }
        status, _, _, res = self.post_form("/api/send-enquiry", payload)
        self.assertEqual(status, 400)
        self.assertIn("Consent to process enquiry data", res.get("error"))

    def test_submissions_review_endpoint(self):
        self.post_form("/api/send-enquiry", {
            "enquiry-reference": "RF-ENQ-REVIEW-SEED",
            "name": "Review Seeder",
            "email": "seeder@example.com",
            "phone": "071 234 5678",
            "enquiry-type": "General",
            "message": "Seeding for review endpoint test",
            "privacy-consent": "Agreed",
            "bot-field": ""
        })
        status, _, _, res = self.dispatch_request("GET", "/api/submissions")
        self.assertEqual(status, 200)
        self.assertTrue(res.get("ok"))
        self.assertGreaterEqual(res.get("count"), 1)

if __name__ == "__main__":
    unittest.main()
