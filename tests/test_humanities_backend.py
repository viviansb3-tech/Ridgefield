#!/usr/bin/env python3
"""
Test suite for Humanities Learning Portal Backend (scripts/humanities_backend.py & scripts/local_server.py).
Tests:
- Anonymous user access denial (401)
- Authentication and session creation
- Student enrolled module listing and resource reading
- Student unenrolled access prevention (403)
- Reading progress persistence and retrieval
- Teacher draft creation and publishing workflow
- Teacher unassigned module modification restriction (403)
- Teacher role privilege separation (no admin actions)
- Administrator enrolment and module assignment
- Direct filesystem path traversal and storage file access prevention (403)
- Audit log persistence
"""

import unittest
import json
import io
import sys
from pathlib import Path

# Add scripts directory
scripts_dir = Path(__file__).resolve().parent.parent / "scripts"
sys.path.insert(0, str(scripts_dir))
import local_server
import humanities_backend

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


class HumanitiesBackendTestCase(unittest.TestCase):
    @classmethod
    def tearDownClass(cls):
        import glob, os
        for p in glob.glob(str(humanities_backend.RESOURCE_DIR / "res-*.pdf")):
            try: os.remove(p)
            except Exception: pass

    def setUp(self):
        conn = humanities_backend.get_db()
        with conn:
            conn.execute("DELETE FROM enrolments WHERE student_id = 4")
            conn.execute("DELETE FROM resources WHERE id > 1")
            conn.execute("INSERT OR IGNORE INTO enrolments (student_id, module_id, status, created_at) VALUES (3, 1, 'active', '2026-10-25T21:00:00Z')")
        conn.close()

    def dispatch_request(self, method: str, path: str, headers: dict = None, body: bytes = b"", token: str = None):
        if headers is None:
            headers = {}
        headers.setdefault("Host", "localhost")
        if token:
            headers["Authorization"] = f"Bearer {token}"
        if body and "Content-Length" not in headers:
            headers["Content-Length"] = str(len(body))

        header_lines = [f"{method} {path} HTTP/1.1"]
        for k, v in headers.items():
            header_lines.append(f"{k}: {v}")
        header_lines.append("")
        header_lines.append("")

        raw_request = "\r\n".join(header_lines).encode("utf-8") + body
        sock = MockSocket(raw_request)

        class QuietHandler(local_server.RidgefieldRequestHandler):
            def log_message(self, format, *args):
                pass

        QuietHandler(sock, ("127.0.0.1", 54321), None)
        raw_output = sock.output.getvalue()

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

    def login(self, email: str, password: str):
        payload = json.dumps({"email": email, "password": password}).encode("utf-8")
        headers = {"Content-Type": "application/json"}
        status, _, _, res = self.dispatch_request("POST", "/api/humanities/auth/login", headers=headers, body=payload)
        self.assertEqual(status, 200, f"Login failed for {email}")
        return res["token"], res["user"]

    def test_anonymous_access_denied(self):
        status, _, _, _ = self.dispatch_request("GET", "/api/humanities/modules")
        self.assertEqual(status, 401)
        status, _, _, _ = self.dispatch_request("GET", "/api/humanities/resources/1/content")
        self.assertEqual(status, 401)

    def test_invalid_login(self):
        payload = json.dumps({"email": "student@humanities.test", "password": "WrongPassword!"}).encode("utf-8")
        headers = {"Content-Type": "application/json"}
        status, _, _, res = self.dispatch_request("POST", "/api/humanities/auth/login", headers=headers, body=payload)
        self.assertEqual(status, 401)
        self.assertFalse(res.get("ok"))

    def test_student_enrolled_access_and_unenrolled_rejection(self):
        # 1. Enrolled student (Lerato)
        token_enrolled, user_enrolled = self.login("student@humanities.test", "StudentPass2026!")
        self.assertEqual(user_enrolled["role"], "student")

        status, _, _, res = self.dispatch_request("GET", "/api/humanities/modules", token=token_enrolled)
        self.assertEqual(status, 200)
        codes = [m["code"] for m in res["modules"]]
        self.assertIn("EARH3724", codes)
        self.assertNotIn("EPFM3724", codes)

        # Enrolled student can read published resource
        status, headers, body, _ = self.dispatch_request("GET", "/api/humanities/resources/1/content", token=token_enrolled)
        self.assertEqual(status, 200)
        self.assertEqual(headers.get("content-type"), "application/pdf")
        self.assertTrue(body.startswith(b"%PDF-"))

        # 2. Unenrolled student (Thabo)
        token_unenrolled, _ = self.login("student2@humanities.test", "Student2Pass2026!")
        status, _, _, res2 = self.dispatch_request("GET", "/api/humanities/modules", token=token_unenrolled)
        self.assertEqual(status, 200)
        self.assertEqual(len(res2["modules"]), 0)

        # Unenrolled student gets 403 on resource content
        status, _, _, _ = self.dispatch_request("GET", "/api/humanities/resources/1/content", token=token_unenrolled)
        self.assertEqual(status, 403)

    def test_reading_progress_persistence(self):
        token, _ = self.login("student@humanities.test", "StudentPass2026!")
        progress_payload = json.dumps({"resource_id": 1, "current_page": 7, "total_pages": 42}).encode("utf-8")
        headers = {"Content-Type": "application/json"}

        # Save progress
        status, _, _, res = self.dispatch_request("POST", "/api/humanities/progress", headers=headers, body=progress_payload, token=token)
        self.assertEqual(status, 200)
        self.assertEqual(res["saved_page"], 7)

        # Retrieve progress
        status, _, _, get_res = self.dispatch_request("GET", "/api/humanities/progress/1", token=token)
        self.assertEqual(status, 200)
        self.assertEqual(get_res["progress"]["current_page"], 7)
        self.assertEqual(get_res["progress"]["total_pages"], 42)

    def test_teacher_workflow_and_privilege_isolation(self):
        teacher_token, teacher_user = self.login("teacher@humanities.test", "TeacherPass2026!")
        self.assertEqual(teacher_user["role"], "teacher")

        # Assigned module is EARH3724 (id: 1)
        # Create draft resource
        payload = json.dumps({
            "module_id": 1,
            "title": "Unit 2 Qualitative Methodologies Guide",
            "edition_year": "2026",
            "author": "Dr. Femi Chapola"
        }).encode("utf-8")
        status, _, _, res = self.dispatch_request("POST", "/api/humanities/teacher/resources",
                                                  headers={"Content-Type": "application/json"},
                                                  body=payload, token=teacher_token)
        self.assertEqual(status, 200)
        self.assertTrue(res["ok"])
        new_resource_id = res["resource_id"]
        self.assertEqual(res["status"], "draft")

        # Student should NOT be able to access draft resource
        student_token, _ = self.login("student@humanities.test", "StudentPass2026!")
        status, _, _, _ = self.dispatch_request("GET", f"/api/humanities/resources/{new_resource_id}/content", token=student_token)
        self.assertEqual(status, 403)

        # Teacher publishes the resource
        status, _, _, pub_res = self.dispatch_request("POST", f"/api/humanities/teacher/resources/{new_resource_id}/publish", token=teacher_token)
        self.assertEqual(status, 200)
        self.assertEqual(pub_res["status"], "published")

        # Now student CAN access the published resource
        status, _, body, _ = self.dispatch_request("GET", f"/api/humanities/resources/{new_resource_id}/content", token=student_token)
        self.assertEqual(status, 200)

        # Teacher cannot modify unassigned module (EPFM3724 - id: 3)
        unassigned_payload = json.dumps({"module_id": 3, "title": "Unauthorized Book"}).encode("utf-8")
        status, _, _, unassigned_res = self.dispatch_request("POST", "/api/humanities/teacher/resources",
                                                            headers={"Content-Type": "application/json"},
                                                            body=unassigned_payload, token=teacher_token)
        self.assertEqual(status, 403)

        # Teacher cannot perform admin operations (enrolments)
        enrol_payload = json.dumps({"student_id": 4, "module_id": 1, "status": "active"}).encode("utf-8")
        status, _, _, _ = self.dispatch_request("POST", "/api/humanities/admin/enrolments",
                                                headers={"Content-Type": "application/json"},
                                                body=enrol_payload, token=teacher_token)
        self.assertEqual(status, 403)

    def test_administrator_enrolment_and_audit(self):
        admin_token, admin_user = self.login("admin@humanities.test", "AdminPass2026!")
        self.assertEqual(admin_user["role"], "admin")

        # Admin enrols student 2 (Thabo, id: 4) into EARH3724 (id: 1)
        enrol_payload = json.dumps({"student_id": 4, "module_id": 1, "status": "active"}).encode("utf-8")
        status, _, _, enrol_res = self.dispatch_request("POST", "/api/humanities/admin/enrolments",
                                                        headers={"Content-Type": "application/json"},
                                                        body=enrol_payload, token=admin_token)
        self.assertEqual(status, 200)
        self.assertTrue(enrol_res["ok"])

        # Now student 2 can see EARH3724 and read resource 1
        s2_token, _ = self.login("student2@humanities.test", "Student2Pass2026!")
        status, _, _, s2_modules = self.dispatch_request("GET", "/api/humanities/modules", token=s2_token)
        self.assertEqual(status, 200)
        self.assertIn("EARH3724", [m["code"] for m in s2_modules["modules"]])

        status, _, _, _ = self.dispatch_request("GET", "/api/humanities/resources/1/content", token=s2_token)
        self.assertEqual(status, 200)

        # Admin checks audit log
        status, _, _, audit_res = self.dispatch_request("GET", "/api/humanities/admin/audit", token=admin_token)
        self.assertEqual(status, 200)
        self.assertTrue(audit_res["ok"])
        self.assertGreaterEqual(len(audit_res["events"]), 1)

    def test_storage_path_protection(self):
        for path in ["/storage/humanities/humanities.sqlite3", "/storage/humanities/resources/earh3724-study-guide-sample.pdf"]:
            status, _, _, _ = self.dispatch_request("GET", path)
            self.assertEqual(status, 403)

if __name__ == "__main__":
    unittest.main()
