#!/bin/bash
set -e

log() { echo "[entrypoint] $*"; }

# ─── SSH setup ────────────────────────────────────────────────────────────────
# SSH_PRIVATE_KEY must be injected as an environment variable (e.g. from n8n).
# The key should be the raw PEM content (including header/footer lines).

if [ -z "$SSH_PRIVATE_KEY" ]; then
    log "ERROR: SSH_PRIVATE_KEY environment variable is not set."
    exit 1
fi

log "Setting up SSH keys..."
mkdir -p /root/.ssh
chmod 700 /root/.ssh
printf '%s\n' "$SSH_PRIVATE_KEY" > /root/.ssh/id_rsa
chmod 600 /root/.ssh/id_rsa
ssh-keyscan -H github.com >> /root/.ssh/known_hosts 2>/dev/null
log "SSH configured."

# ─── Clone or update the application repo ────────────────────────────────────
# node_modules was pre-installed in the image at /app/node_modules.
# We clone source files alongside it without overwriting node_modules.

REPO="git@github.com:0xdeval/puppeteer.git"

if [ -d "/app/.git" ]; then
    log "Repo already cloned — pulling latest changes..."
    git -C /app pull --ff-only
else
    log "Cloning repo into /tmp/puppeteer-src ..."
    git clone "$REPO" /tmp/puppeteer-src

    log "Syncing source files into /app (preserving pre-installed node_modules)..."
    rsync -a --exclude=node_modules /tmp/puppeteer-src/ /app/
    rm -rf /tmp/puppeteer-src

    log "Running npm install to pick up any new dependencies..."
    cd /app && npm install --omit=dev
fi

log "Repo ready."

# ─── Create .env file ─────────────────────────────────────────────────────────
log "Writing /app/.env ..."
cat > /app/.env <<EOF
API_SECRET=${API_SECRET:-}
LLM_PROVIDER=${LLM_PROVIDER:-ollama}
LLM_BASE_URL=${LLM_BASE_URL:-http://localhost:11434}
LLM_MODEL_PRIMARY=${LLM_MODEL_PRIMARY:-llama3.2-vision:11b}
LLM_MODEL_FALLBACK=${LLM_MODEL_FALLBACK:-llama3.2-vision:11b}
PORT=${PORT:-3001}
VNC_PORT=${VNC_PORT:-6080}
DATA_DIR=${DATA_DIR:-/app/data}
EOF
log ".env written."

# ─── Start virtual display (needed by Playwright headed mode) ─────────────────
export DISPLAY=:99
Xvfb :99 -screen 0 1280x800x24 -ac &
XVFB_PID=$!
log "Xvfb started (PID $XVFB_PID)"
sleep 1

# ─── Start Ollama ─────────────────────────────────────────────────────────────
export OLLAMA_HOST=0.0.0.0:11434
export OLLAMA_MODELS=/ollama-models

log "Starting Ollama..."
ollama serve &
OLLAMA_PID=$!
log "Ollama starting (PID $OLLAMA_PID)"

until ollama list >/dev/null 2>&1; do
    log "Waiting for Ollama to be ready..."
    sleep 2
done
log "Ollama ready. Loaded models:"
ollama list

# Pull model if not already present (fallback if it wasn't baked into the image)
MODEL="${LLM_MODEL_PRIMARY:-llama3.2-vision:11b}"
if ! ollama list | grep -q "$MODEL"; then
    log "Model $MODEL not found — pulling now (this may take a while)..."
    ollama pull "$MODEL"
    log "Model $MODEL pulled successfully."
fi

# ─── Cleanup on container exit ────────────────────────────────────────────────
cleanup() {
    log "Shutting down..."
    kill $OLLAMA_PID 2>/dev/null || true
    kill $XVFB_PID 2>/dev/null || true
}
trap cleanup EXIT SIGTERM SIGINT

# ─── Start application ────────────────────────────────────────────────────────
log "Starting Node.js application..."
cd /app
exec npm run start
