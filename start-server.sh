#!/bin/bash
# Start Ridgefield Academy Full-Stack Server
export PATH="/Applications/OpenClaw.app/Contents/Resources/runtime/bin:$PATH"
PORT="${PORT:-4000}"
cd "$(dirname "$0")/server"
echo "Starting Ridgefield Academy Server on http://localhost:${PORT}"
echo "Frontend:  http://localhost:${PORT}/index.html"
echo "Admin CMS: http://localhost:${PORT}/admin.html"
echo "Portal:    http://localhost:${PORT}/student-portal.html"
exec bun server.js
