# ZOOKA Creative Studio — how it works, and what it cannot do

Real files. Every capability below produces bytes that `ffprobe` can read back, and every one of them
works without a paid provider.

## Storage

`StudioAsset` (migration 0044) is the index: workspace, optional project, kind (`image|video|audio`),
source (`upload|derived`), a storage path computed from the row, measured width/height/duration, the
operation that produced it, and `parentAssetId` for lineage. RLS plus a tenant policy; a composite key
`(projectId, organizationId)` to `AgentProject` means a row cannot name one workspace and belong to
another.

Bytes live under `STUDIO_MEDIA_DIR/<organizationId>/<assetId>.<ext>`. The path is never taken from a
request, so another workspace's id resolves to nothing. Quota: `STUDIO_QUOTA_BYTES` (2 GB default),
checked before the write.

## Image

Upload (`POST /api/studio/assets`, multipart, per-kind size limits), then deterministic edits through
ffmpeg (`POST /api/studio/edit`):

| Operation | Filter |
|---|---|
| `resize` | `scale=w:h:flags=lanczos` |
| `crop` | `crop=w:h:x:y` |
| `text` | `drawtext` with a real font file, refused when none is configured |
| `logo` | second input scaled to a ratio, `overlay` in the chosen corner |

Each edit is a new asset with `parentAssetId` set. The original is never overwritten.

## Video

`POST /api/studio/render` assembles 1–12 scenes into one MP4:

- each scene is a still (`-loop 1 -t n`) or a clip (`-t n`);
- every scene is scaled to fit the requested aspect and **padded**, so a portrait photo in a 16:9 film
  keeps its whole frame instead of being cropped;
- `fps=30`, `setsar=1`, then `concat`;
- optional per-scene title through `drawtext` (only with a configured font) and an optional fade
  transition (`fade=t=in/out`, 0.35 s);
- `libx264 -crf 23 -pix_fmt yuv420p -movflags +faststart`;
- the scenes decide the duration: a shorter music track ends rather than cutting the picture, which
  was a real defect caught by the acceptance run;
- the output is probed before the row is written; an unreadable render is an error, not a success.

Aspects: 9:16 (1080×1920), 1:1 (1080×1080), 16:9 (1920×1080).

## Audio

Upload mp3/wav/m4a, then `trim` (`-ss`, `-t`, `loudnorm`), `gain` (`volume=±NdB`), or `mix` (music
ducked by `gainDb`, voice at unity, `amix`, `alimiter`). All through ffmpeg; the result is a real AAC
`.m4a` with a measured duration.

Text-to-speech and AI voice are **not implemented**: they need a provider with rights-cleared voices,
and the studio does not pretend otherwise.

## Providers, and why generation is blocked

`lib/studio/providers.ts` defines one neutral interface with `kind: local | self_hosted | external_api`
and an explicit `generative` flag. That flag exists because "ready" is not "generative": the local
ffmpeg provider is ready and cannot invent a picture. `/api/studio/generate` only ever selects a
`generative` provider that answered its health check, and otherwise returns **409** with the exact
blockers.

The ComfyUI adapter speaks the documented queue API: `/system_stats` for health, `POST /prompt` for
submission, `/history/<id>` for polling, `/view` for bytes. It bounds every wait
(`COMFYUI_TIMEOUT_MS`, default 90 s), refuses a job with no tenant, never enables partner nodes, and
reports `endpoint_not_configured` / `workflow_not_configured` / `endpoint_unreachable` / `job_failed` /
`timeout` distinctly.

**Status today: BLOCKED.** No `COMFYUI_ENDPOINT` exists, so no image was generated and none is
displayed. The adapter is verified against fixtures (12 tests) including a full submit → poll → fetch
cycle, a workflow error, and a deadline that expires instead of hanging.

## Environment

| Variable | Purpose |
|---|---|
| `STUDIO_MEDIA_DIR` | where bytes live, per workspace |
| `STUDIO_QUOTA_BYTES` | workspace storage ceiling |
| `STUDIO_FONT_FILE` | a TTF that can shape the scripts you need; without it, text is refused |
| `COMFYUI_ENDPOINT`, `COMFYUI_API_TOKEN`, `COMFYUI_WORKFLOW_FILE` | optional generation |
| `COMFYUI_POLL_MS`, `COMFYUI_TIMEOUT_MS` | polling cadence and deadline |

ffmpeg must exist on the host. Serverless functions are a poor fit for video: no persistent disk, short
duration limits, and `ffprobe` on every upload. A worker host with a volume is the honest requirement.

## What is verified, and what is not

Verified by `scripts/acceptance/studio-acceptance.mjs` (30/30 on real files): upload with server-side
measurement, resize to 1080×1920, crop to 600×600, PNG download of 103,989 bytes, 9:16 render
(45,894-byte MP4, H.264 1080×1920, 4.00 s, audio muxed), audio gain (AAC, 2.02 s), voiceover mix, 1:1
render with title and fades (1080×1080 H.264), provider status telling the truth, generation refused
with blockers, cross-tenant 404 on file/list/edit, and persistence across logout/login.

Not built: AI generation (blocked, no endpoint), text-to-speech, background removal, transition types
beyond cut and fade, and interactive timeline scrubbing in the panel.
