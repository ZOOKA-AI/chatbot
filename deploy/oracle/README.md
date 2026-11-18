# Deploying the persistent browser on Oracle Cloud Always Free (ARM64)

Nothing here creates a paid resource: the instance is Always Free eligible, the TLS tunnel is free, and
the application side is a Vercel environment variable. Creating the Oracle account itself needs a phone
number and a card for identity verification, so that step belongs to the owner, not the agent.

## 0. Before anything else

- The account must be **Always Free** (not upgraded to Pay-As-You-Go). An upgraded account starts billing.
- Know the tenancy's **home region**: it cannot be changed later, and Ampere A1 capacity is not available
  in every region at every moment.
- Have an SSH key pair ready to attach to the instance.

## 1. Instance

| Setting | Value | Why |
| --- | --- | --- |
| Shape | `VM.Standard.A1.Flex` | Ampere ARM64, Always Free eligible |
| OCPU / memory | 2 / 12 GB | The current Always Free allowance; the console is authoritative |
| Image | Canonical Ubuntu 22.04 (aarch64) | Chromium is a native arm64 package there |
| Boot volume | 50 GB | Within the 200 GB Always Free block storage |
| Public IPv4 | assigned | Needed to dial out; confirm it is not billed in your tenancy |

Confirm the instance page says **Always Free eligible** before going further. "Out of host capacity" in
one region is normal; the fix is a different availability domain or a home region that has A1 capacity.

## 2. Host preparation

```bash
sudo apt-get update && sudo apt-get install -y docker.io docker-compose-v2 unattended-upgrades
sudo systemctl enable --now unattended-upgrades      # OS security updates
sudo usermod -aG docker "$USER"                      # re-login afterwards
```

Firewall: **no inbound application ports**. Only SSH, and only from your own address:

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow from <your-ip> to any port 22 proto tcp
sudo ufw enable
```

In `/etc/ssh/sshd_config`: `PasswordAuthentication no`, `PermitRootLogin no`. In the OCI console keep the
security list to SSH from your address only.

## 3. Deploy

```bash
sudo mkdir -p /opt/zooka && sudo chown "$USER" /opt/zooka
# copy this directory's files into /opt/zooka, plus gateway/cdp-gateway.mjs
cd /opt/zooka && cp environment.template .env && chmod 600 .env
# edit .env: GATEWAY_TENANTS with one token per workspace (openssl rand -hex 32)
# the gateway imports `ws`; place it at ./ws (npm i --no-save ws && cp -r node_modules/ws .)
docker compose build && docker compose up -d
docker compose ps                        # both services running
curl -s http://127.0.0.1:8787/healthz    # {"ok":true,...}
```

Survive a reboot:

```bash
sudo cp zooka-browser.service /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now zooka-browser
```

## 4. TLS tunnel

Follow `tunnel-config.yml` with a Cloudflare Tunnel created for `browser.example.com`. The host never
opens a port; the tunnel dials out and terminates TLS. Then verify from the public internet **without** a
token, which must be refused:

```bash
curl -i https://browser.example.com/cdp?tenant=x      # expect 401, no upgrade
```

## 5. Point the application at it

Vercel → project `chatbot` → Environment Variables, **Preview first**:

- `BROWSER_CDP_URL = wss://browser.example.com/cdp?tenant=<workspace-id>&token=<token>`
- `BROWSER_HANDLE_KEY = <openssl rand -hex 32>`

Both are secrets. Redeploy the preview, open `/workspace/browser`, start a session, and confirm a frame
renders. A 409 with `engine_not_configured` means the variable never reached the deployment.

## 6. Recovery

| Symptom | Action |
| --- | --- |
| `502` from the gateway, `/healthz` dead | `docker compose restart gateway`; read `docker compose logs gateway` |
| Browser dead | `docker compose restart browser`; live sessions become non-resumable and are recreated on demand |
| Host rebooted | `systemctl status zooka-browser`; the unit starts compose |
| Disk filling | the profile volume grows with visited sites: `docker compose down && docker volume rm zooka-browser_browser-profile` (browser profiles are disposable) |
| Token leak suspected | rotate the workspace entry in `GATEWAY_TENANTS`, restart, update the Vercel variable, redeploy |
| Instance stopped while idle | Always Free reclaims instances idle for 7 days: keep a light health check hitting it and monitor |

## Cost

Instance, boot volume, outbound transfer and the tunnel stay inside Always Free limits on a tenancy that
is not upgraded. The risk is not a charge but **idle reclamation**, which stops the instance and therefore
kills the persistent browser. Treat a health check as part of the deployment, not an extra.
