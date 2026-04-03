FROM node:20-slim

# ─── System dependencies ──────────────────────────────────────────────────────
# Install Playwright Chromium runtime deps, Xvfb, x11vnc, and noVNC/websockify

RUN apt-get update && apt-get install -y --no-install-recommends \
    # Chromium runtime dependencies
    libnss3 \
    libnspr4 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libdbus-1-3 \
    libxkbcommon0 \
    libatspi2.0-0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libasound2 \
    libpango-1.0-0 \
    libcairo2 \
    # X11 / VNC stack for headed login sessions
    xvfb \
    x11vnc \
    novnc \
    websockify \
    openbox \
    xterm \
    # Utilities
    curl \
    ca-certificates \
    procps \
    && rm -rf /var/lib/apt/lists/*

# ─── App setup ────────────────────────────────────────────────────────────────

WORKDIR /app

# Copy package files first so Docker can cache the npm install layer
COPY package.json package-lock.json* ./

# Install Node dependencies.
# Prefer deterministic installs when a lockfile exists, and fall back otherwise.
RUN if [ -f package-lock.json ]; then \
      npm ci --omit=dev; \
    else \
      npm install --omit=dev; \
    fi

# Install Playwright Chromium browser binary
RUN npx playwright install chromium

# Copy application source
COPY . .

# ─── Data volume ──────────────────────────────────────────────────────────────

# /app/data is expected to be a Docker volume for persistence
RUN mkdir -p /app/data/profiles /app/data/debug \
    && echo '{"profiles":{}}' > /app/data/registry.json

VOLUME ["/app/data"]

# ─── Ports ────────────────────────────────────────────────────────────────────

# Express REST API
EXPOSE 3001

# noVNC WebSocket proxy (for manual login sessions)
EXPOSE 6080

# ─── Entrypoint ───────────────────────────────────────────────────────────────

COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["node", "server.js"]
