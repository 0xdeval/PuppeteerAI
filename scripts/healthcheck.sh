#!/bin/bash
# Healthcheck script for Docker and local use.
# Curls the /health endpoint and exits 0 if the service is OK.

PORT=${PORT:-3001}
HOST=${HEALTHCHECK_HOST:-localhost}
URL="http://${HOST}:${PORT}/health"

RESPONSE=$(curl --silent --fail --max-time 5 "${URL}" 2>/dev/null)
EXIT_CODE=$?

if [ $EXIT_CODE -ne 0 ]; then
    echo "UNHEALTHY: Could not reach ${URL} (curl exit code: ${EXIT_CODE})"
    exit 1
fi

# Optionally check for "ok" in the response body
if echo "${RESPONSE}" | grep -q '"status":"ok"'; then
    echo "HEALTHY: ${RESPONSE}"
    exit 0
else
    echo "UNHEALTHY: Unexpected response: ${RESPONSE}"
    exit 1
fi
