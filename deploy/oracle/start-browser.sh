#!/bin/sh
# Chromium on loopback only. Loopback is the security boundary: the DevTools endpoint grants full
# control of every browser context, so it must never be reachable from the network. Publishing happens
# through the gateway (wss) and a tunnel that terminates TLS.
set -eu
PORT="${CDP_PORT:-9222}"
PROFILE="${CHROME_USER_DATA:-/var/lib/zooka-browser}"
exec /usr/bin/chromium \
  --headless=new --no-sandbox --disable-dev-shm-usage --disable-gpu \
  --no-first-run --no-default-browser-check --disable-background-networking \
  --disable-features=Translate,BackForwardCache \
  --renderer-process-limit="${RENDERER_PROCESS_LIMIT:-4}" \
  --js-flags="--max-old-space-size=${JS_HEAP_MB:-512}" \
  --remote-debugging-address=127.0.0.1 \
  --remote-debugging-port="$PORT" \
  --user-data-dir="$PROFILE" \
  about:blank
