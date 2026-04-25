#!/bin/bash
set -e

DISPLAY_NUM=${DISPLAY_NUM:-1}
DOLPHIN_BIN="/opt/Dolphin Anty/dolphin_anty"

# ─── Kill existing Dolphin process ────────────────────────────────────────────
if pgrep -f "dolphin_anty" > /dev/null 2>&1; then
  echo "[dolphin] Stopping existing Dolphin process..."
  pkill -f "dolphin_anty" || true
  sleep 2
fi

# ─── Kill existing Xvfb on target display ─────────────────────────────────────
if pgrep -f "Xvfb :${DISPLAY_NUM}" > /dev/null 2>&1; then
  echo "[dolphin] Stopping Xvfb on :${DISPLAY_NUM}..."
  pkill -f "Xvfb :${DISPLAY_NUM}" || true
  sleep 1
fi

# ─── Clean up stale X display locks and sockets ───────────────────────────────
echo "[dolphin] Cleaning up display :${DISPLAY_NUM} artifacts..."
rm -f "/tmp/.X${DISPLAY_NUM}-lock"
rm -f "/tmp/.X11-unix/X${DISPLAY_NUM}"

# ─── Start Xvfb ───────────────────────────────────────────────────────────────
echo "[dolphin] Starting Xvfb on :${DISPLAY_NUM}..."
Xvfb ":${DISPLAY_NUM}" -screen 0 1024x768x24 &
XVFB_PID=$!

# Wait for Xvfb to be ready
for i in $(seq 1 10); do
  if [ -S "/tmp/.X11-unix/X${DISPLAY_NUM}" ] || ss -x 2>/dev/null | grep -q "X${DISPLAY_NUM}"; then
    echo "[dolphin] Xvfb ready."
    break
  fi
  sleep 0.5
done

# ─── Launch Dolphin ───────────────────────────────────────────────────────────
echo "[dolphin] Launching Dolphin Anty..."
DISPLAY=":${DISPLAY_NUM}" "$DOLPHIN_BIN" --no-sandbox &
DOLPHIN_PID=$!

echo "[dolphin] Dolphin PID: ${DOLPHIN_PID}"
echo "[dolphin] Waiting for API on port 3001..."

for i in $(seq 1 20); do
  if curl -s http://localhost:3001 > /dev/null 2>&1; then
    echo "[dolphin] API is up."
    break
  fi
  sleep 1
done

echo "[dolphin] Done. Xvfb PID: ${XVFB_PID}, Dolphin PID: ${DOLPHIN_PID}"
