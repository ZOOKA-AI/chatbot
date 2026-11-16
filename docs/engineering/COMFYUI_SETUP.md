# Connecting an owner-controlled ComfyUI to ZOOKA

ZOOKA never talks to a customer's ComfyUI, and a customer never reaches one. There is exactly one
relationship: the owner runs an instance, ZOOKA holds the credentials, and every generation is executed
server-side and filed into the asking workspace.

## 1. Run the instance somewhere private

A GPU host is the honest requirement; a CPU instance works but is slow. The instance must listen on a
private address reachable by the ZOOKA server only. Do not expose `:8188` to the internet as-is: ComfyUI
has no user accounts, so a public port is an open queue that anyone can submit work to and read results
from.

Two acceptable arrangements:

- **Private network.** The ZOOKA host and the GPU host on the same VPC, with the port reachable only
  from the ZOOKA host's address.
- **Reverse proxy with a token.** If it must cross the internet, put nginx or Caddy in front, require a
  bearer token and TLS, and allow only the ZOOKA host's IP. `COMFYUI_API_TOKEN` is sent as
  `Authorization: Bearer <token>` on every call.

The adapter refuses anything that is not an `http(s)` URL, so a `file://` or `gpu.local:8188` value is
ignored rather than half-used.

## 2. Install a model and export a workflow

Install at least one checkpoint into `models/checkpoints`. ZOOKA checks this: `/object_info/CheckpointLoaderSimple`
is read at health time, and an instance that answers but lists no checkpoint is reported as
`no_models_installed` instead of appearing ready.

Build a workflow in the ComfyUI interface, then use **Save (API format)**. That JSON is what ZOOKA
submits. Wrap it with the two node ids that matter:

```json
{
  "graph": { "6": { "class_type": "CLIPTextEncode", "inputs": { "text": "" } }, "9": { "class_type": "SaveImage", "inputs": {} } },
  "promptNodeId": "6",
  "outputNodeId": "9"
}
```

`promptNodeId` is the node whose `inputs.text` receives the customer's prompt. If that node also has
`width`/`height` inputs, the requested size is written into them.

Do not enable partner nodes. They bill a third party per run, and this studio must stay usable without
paid providers.

## 3. Configure ZOOKA

| Variable | Meaning |
|---|---|
| `COMFYUI_ENDPOINT` | `https://gpu.internal:8188` — the private base URL |
| `COMFYUI_API_TOKEN` | bearer token if a proxy enforces one; omit on a private network |
| `COMFYUI_WORKFLOW_FILE` | absolute path to the wrapper JSON above |
| `COMFYUI_POLL_MS` | poll cadence, default 1500 |
| `COMFYUI_TIMEOUT_MS` | hard deadline per job, default 90000 |

## 4. What happens on a request

1. `/api/studio/providers` reports health. A blocked state is one of `endpoint_not_configured`,
   `workflow_not_configured`, `workflow_invalid_graph`, `workflow_missing_nodes`, `endpoint_unreachable`,
   `no_models_installed`.
2. `/api/studio/generate` selects a provider only if it is both `generative` and ready. The local ffmpeg
   provider is deliberately not generative, so it can never be chosen to answer a prompt.
3. The prompt is written into the configured node, submitted with `client_id = organizationId`, and the
   job is polled until it finishes or the deadline passes.
4. The output is fetched from `/view`, stored through the tenant-scoped media layer, and appears in that
   workspace's library with `label: generated:comfyui`.
5. Failures are named: `submit_failed`, `job_failed`, `output_unavailable`, `empty_output`, `timeout`.

## 5. Licences to check before commercial use

- **ComfyUI** — GPL-3.0. Running it as a separate service is fine; shipping its code inside a product
  needs compliance.
- **Checkpoints and LoRAs** — each has its own licence, and many popular ones forbid commercial output.
  Record the licence next to the model you install.
- Nothing in ZOOKA's deterministic path (resize, crop, text, logo, cutout, MP4, narration) depends on
  this instance.
