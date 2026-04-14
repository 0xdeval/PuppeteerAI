#!/bin/bash
set -e

# ─── Start Xvfb virtual display ───────────────────────────────────────────────
# Chromium requires a display even in headless mode on some Linux configurations

export DISPLAY=:99

Xvfb :99 -screen 0 1280x800x24 -ac &
XVFB_PID=$!
echo "[entrypoint] Xvfb started (PID $XVFB_PID)"

sleep 1

# ─── Cleanup on exit ──────────────────────────────────────────────────────────

cleanup() {
    echo "[entrypoint] Shutting down..."
    kill $XVFB_PID 2>/dev/null || true
}
trap cleanup EXIT SIGTERM SIGINT

# ─── Launch main process ──────────────────────────────────────────────────────

echo "[entrypoint] Starting: $*"
exec "$@"
