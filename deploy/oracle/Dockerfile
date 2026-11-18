# Persistent Chromium for ZOOKA-AI, ARM64 first (Oracle Always Free Ampere A1).
#
# Chromium runs as a plain process, not inside Playwright: the application talks CDP directly, so this
# image only has to provide a browser and a supervisor. No GPU, no paid base image.
FROM debian:12-slim

ENV DEBIAN_FRONTEND=noninteractive \
    CHROME_BIN=/usr/bin/chromium \
    CHROME_USER_DATA=/var/lib/zooka-browser \
    CDP_PORT=9222

# Chromium on aarch64 is a native Debian build: no emulation, no x86 translation.
RUN apt-get update && apt-get install -y --no-install-recommends \
      chromium ca-certificates fonts-dejavu-core fonts-noto-color-emoji tini \
    && find /var/lib/apt/lists -mindepth 1 -delete

# The browser must never run as root: a renderer exploit inside a root container is a host problem.
RUN groupadd --gid 10001 zooka \
    && useradd --uid 10001 --gid 10001 --create-home --shell /usr/sbin/nologin zooka \
    && mkdir -p "$CHROME_USER_DATA" \
    && chown -R 10001:10001 "$CHROME_USER_DATA"

COPY --chown=10001:10001 cdp-gateway.mjs /opt/zooka/cdp-gateway.mjs
COPY --chown=10001:10001 start-browser.sh /opt/zooka/start-browser.sh
RUN chmod +x /opt/zooka/start-browser.sh

USER 10001:10001
EXPOSE 9222 8787

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.CDP_PORT||9222)+'/json/version').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/usr/bin/tini", "--", "/opt/zooka/start-browser.sh"]
