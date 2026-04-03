#!/bin/bash
set -e

# ─── Start Xvfb virtual display ───────────────────────────────────────────────
# This provides a virtual display for headed browser sessions (manual logins)

export DISPLAY=:99

Xvfb :99 -screen 0 1280x800x24 -ac &
XVFB_PID=$!
echo "[entrypoint] Xvfb started (PID $XVFB_PID)"

# Give Xvfb a moment to initialize
sleep 1

# Start a minimal window manager so browser windows render correctly
openbox --config-file /dev/null &
WM_PID=$!
echo "[entrypoint] Openbox started (PID $WM_PID)"

# ─── Start x11vnc (VNC server) ────────────────────────────────────────────────

x11vnc -display :99 \
       -forever \
       -nopw \
       -quiet \
       -rfbport 5900 \
       -shared &
VNC_PID=$!
echo "[entrypoint] x11vnc started (PID $VNC_PID)"

# ─── Start noVNC / websockify ─────────────────────────────────────────────────

VNC_PORT=${VNC_PORT:-6080}

websockify --web /usr/share/novnc \
           --wrap-mode=ignore \
           ${VNC_PORT} \
           localhost:5900 &
NOVNC_PID=$!
echo "[entrypoint] noVNC WebSocket proxy started on port ${VNC_PORT} (PID $NOVNC_PID)"

# ─── Cleanup on exit ──────────────────────────────────────────────────────────

cleanup() {
    echo "[entrypoint] Shutting down..."
    kill $NOVNC_PID 2>/dev/null || true
    kill $VNC_PID 2>/dev/null || true
    kill $WM_PID 2>/dev/null || true
    kill $XVFB_PID 2>/dev/null || true
}
trap cleanup EXIT SIGTERM SIGINT

# ─── Launch main process ──────────────────────────────────────────────────────

echo "[entrypoint] Starting: $*"
exec "$@"
