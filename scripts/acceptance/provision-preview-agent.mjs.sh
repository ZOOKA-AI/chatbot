#!/usr/bin/env bash
# Creates an isolated, side-effect-free n8n webhook for ZOOKA Preview acceptance.
# It echoes the incoming message, calls no model, touches no database, and cannot
# reach any production action. The shared secret is checked by an httpHeaderAuth
# credential so the endpoint is not open.
set -euo pipefail

KEY_FILE=/app/conversations/6a59a371c2ba4e8b61701eff/.preview_agent_key
if [ ! -f "$KEY_FILE" ]; then
  head -c 24 /dev/urandom | base64 | tr -d '\n=+/' | cut -c1-32 > "$KEY_FILE"
  chmod 600 "$KEY_FILE"
fi
SECRET=$(cat "$KEY_FILE")

# The env file stores this value inside a shell $'...' wrapper; unwrap it rather
# than editing the auto-generated file.
TOKEN=$(python3 - <<'EOF'
for line in open('/app/.agents/.env'):
    if line.startswith('export N8N_MCP_TOKEN='):
        v = line.split('=', 1)[1].strip()
        if v.startswith("$'") and v.endswith("'"):
            v = v[2:-1]
        elif v.startswith("'") and v.endswith("'"):
            v = v[1:-1]
        print(v)
        break
EOF
)
BASE=https://helmyharoon817979.n8n-wsk.com/api/v1
H_AUTH="X-N8N-API-KEY: $TOKEN"

echo "== 1. headerAuth credential =="
CRED_BODY=$(python3 -c "
import json,sys
print(json.dumps({'name':'ZOOKA Preview Agent Guard','type':'httpHeaderAuth','data':{'name':'x-solas-key','value':sys.argv[1]}}))" "$SECRET")
CRED=$(curl -s -X POST "$BASE/credentials" -H "$H_AUTH" -H 'content-type: application/json' -d "$CRED_BODY")
CRED_ID=$(python3 -c "
import json,sys
d=json.loads(sys.argv[1] or '{}')
print(d.get('id') or d.get('data',{}).get('id') or '')" "$CRED")
echo "credential id: ${CRED_ID:-NONE}"
[ -n "$CRED_ID" ] || { echo "credential creation failed:"; echo "$CRED" | head -c 300; }

echo "== 2. workflow =="
WF=$(python3 - "$CRED_ID" <<'PY'
import json, sys
cred_id = sys.argv[1]
nodes = [
 {"parameters": {"httpMethod": "POST", "path": "zooka-preview-agent-test",
                 "responseMode": "responseNode", "options": {}},
  "id": "wh-preview", "name": "Preview Webhook",
  "type": "n8n-nodes-base.webhook", "typeVersion": 2,
  "position": [0, 0], "webhookId": "zooka-preview-agent-test"},
 {"parameters": {"respondWith": "json", "responseBody":
   "={{ { ok: true, steps: 1, provider: 'n8n-preview-test', reply: 'preview-test-agent: ' + ($json.body.message || '') } }}",
   "options": {}},
  "id": "resp-preview", "name": "Respond",
  "type": "n8n-nodes-base.respondToWebhook", "typeVersion": 1.1,
  "position": [240, 0]},
]
if cred_id:
    nodes[0]["parameters"]["authentication"] = "headerAuth"
    nodes[0]["credentials"] = {"httpHeaderAuth": {"id": cred_id, "name": "ZOOKA Preview Agent Guard"}}
wf = {"name": "ZOOKA Preview Agent — Isolated Test Webhook",
      "nodes": nodes,
      "connections": {"Preview Webhook": {"main": [[{"node": "Respond", "type": "main", "index": 0}]]}},
      "settings": {"executionOrder": "v1"}}
print(json.dumps(wf))
PY
)
CREATED=$(curl -s -X POST "$BASE/workflows" -H "$H_AUTH" -H 'content-type: application/json' -d "$WF")
WF_ID=$(python3 -c "
import json,sys
d=json.loads(sys.argv[1] or '{}')
print(d.get('id') or d.get('data',{}).get('id') or '')" "$CREATED")
echo "workflow id: ${WF_ID:-NONE}"
[ -n "$WF_ID" ] || { echo "$CREATED" | head -c 400; exit 1; }

echo "== 3. activate =="
curl -s -X POST "$BASE/workflows/$WF_ID/activate" -H "$H_AUTH" | python3 -c "
import json,sys
d=json.load(sys.stdin); print('active:', d.get('active'))"

echo "== 4. verify =="
URL=https://helmyharoon817979.n8n-wsk.com/webhook/zooka-preview-agent-test
echo "with key: $(curl -s -o /tmp/n8n_ok.json -w '%{http_code}' -X POST "$URL" -H 'content-type: application/json' -H "x-solas-key: $SECRET" -d '{"userId":"preview:probe","message":"hello"}')"
head -c 200 /tmp/n8n_ok.json; echo
echo "without key: $(curl -s -o /dev/null -w '%{http_code}' -X POST "$URL" -H 'content-type: application/json' -d '{"message":"hello"}')"
echo "WF_ID=$WF_ID CRED_ID=$CRED_ID"
