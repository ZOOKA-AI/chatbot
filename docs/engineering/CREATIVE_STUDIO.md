# ZOOKA Creative Studio — how it works, and what it cannot do

Real files. Every capability below produces bytes that `ffprobe` can read back, and every one of them
works without a paid provider.

## Storage

`StudioAsset` (migration 0044) is the index: workspace, optional project, kind (`image|video|audio`),
source (`upload|derived`), a storage path computed from the row, measured width/height/duration, the
operation that produced it, and `parentAssetId` for lineage. RLS plus a tenant policy; a composite key
`(projectId, organizationId)` to `AgentProject` means a row cannot name one workspace and belong to
another.

Bytes live in private Vercel Blob under `<organizationId>/studio-media/<assetId>-<suffix>.<ext>`, the
same store chat images use; the row records `blob:<pathname>` (`lib/studio/storage.ts`). A serverless
filesystem does not survive a redeploy or a cold start, so nothing is persisted locally: ffmpeg, Piper
and rembg work on scratch copies that are deleted when the operation ends, and
`assertDurableStoragePath` refuses to record any path that is not a Blob pathname. Without
`BLOB_READ_WRITE_TOKEN` a write is refused with `storage_not_configured`. Rows written before this
change still carry a local path; reading one whose file is gone answers 410 `asset_bytes_missing`.
The path is never taken from a request, so another workspace's id resolves to nothing. Quota: `STUDIO_QUOTA_BYTES` (2 GB default),
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

## Background removal

`rembg` (MIT) runs in a short-lived Python subprocess so a slow segmenter cannot take the web process
with it. The model is the legal question, so the model is an allowlist that carries each licence:

| Model | Licence | Commercial | Used by default |
|---|---|---|---|
| `u2net` | Apache-2.0 | yes | **yes** |
| `isnet-general-use` | Apache-2.0 | yes | no |
| `bria-rmbg` | CC-BY-NC-4.0 | **no** | refused |

`rembg` 2.x defaults to the BRIA model, which is non-commercial. Naming it in a request returns **403
`license_not_commercial`** unless an operator sets `STUDIO_ALLOW_NONCOMMERCIAL_MODEL=1`, and the licence
that was used is written into the asset's `operation` so a cutout can always be traced to its model.

Transparency is verified rather than assumed: the corner alpha must be near zero and the centre near
opaque, and a cutout without transparency is an error, not a re-encode.

## Arabic narration

Piper (MIT) synthesises speech offline on the CPU — no key, no account, no per-character cost. The voice
is a separate file (`STUDIO_PIPER_VOICE`, used here with `ar_JO-kareem-medium`, 63 MB, 22.05 kHz). The
engine's licence is MIT; **the voice model's licence is on its model card and must be checked before
commercial distribution**, which the status endpoint says out loud.

The script is cleaned first (diacritics and markup removed, bounded to 1200 characters) and Latin-only
text is refused with `not_arabic`, because an Arabic voice reading English produces nonsense. Output is
AAC in an MP4 container, mux-ready for a render.

## The agent surface

Six worker tools, registered and named in `INTERNAL_WRITE_TOOLS` because they write files and rows:

| Tool | Writes | Purpose |
|---|---|---|
| `studio_asset_list` | no | what the workspace holds |
| `studio_image_edit` | yes | resize, crop, text, logo |
| `studio_background_remove` | yes | cutout with licence recorded |
| `studio_video_render` | yes | 1–12 scenes to MP4 |
| `studio_narration` | yes | Arabic speech |
| `studio_audio_edit` | yes | trim, gain, voiceover mix |

Four catalog actions sit on them (`studio_image_edit`, `studio_background_remove`,
`studio_video_render`, `studio_narration`), in a `creative` category, all `executable` because
`executable` is derived from the tool registry rather than declared.

`matchActionsForRequest` maps a plain Arabic sentence to **one** action, in priority order background →
video → narration → image, and returns nothing for a request the studio cannot serve. It is a keyword
map, not a model, so the reason for a choice is inspectable; the tests caught two real defects in it
(returning every keyword hit, and a stripped wildcard matching every asset).

Assets are referenced by id or by the label the customer typed, resolved inside their own workspace only.

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
| `BLOB_READ_WRITE_TOKEN` | the private Blob store the bytes live in (shared with chat images) |
| `STUDIO_QUOTA_BYTES` | workspace storage ceiling |
| `STUDIO_FONT_FILE` | a TTF that can shape the scripts you need; without it, text is refused |
| `COMFYUI_ENDPOINT`, `COMFYUI_API_TOKEN`, `COMFYUI_WORKFLOW_FILE` | optional generation |
| `COMFYUI_POLL_MS`, `COMFYUI_TIMEOUT_MS` | polling cadence and deadline |

ffmpeg must exist on the host. Serverless functions are a poor fit for video: no persistent disk, short
duration limits, and `ffprobe` on every upload. A worker host with a volume is the honest requirement.

## What is verified, and what is not

Verified by `scripts/acceptance/studio-acceptance.mjs` (40/40 on real files): upload with server-side
measurement, resize to 1080×1920, crop to 600×600, PNG download of 103,989 bytes, 9:16 render
(45,894-byte MP4, H.264 1080×1920, 4.00 s, audio muxed), audio gain (AAC, 2.02 s), voiceover mix, 1:1
render with title and fades (1080×1080 H.264), provider status telling the truth, generation refused
with blockers, cross-tenant 404 on file/list/edit, and persistence across logout/login.

Also verified: a real cutout whose downloaded corner alpha is 0 and centre is opaque, a non-commercial
model refused with 403, 6.84 s of Arabic narration downloaded as AAC, and Latin text refused by the
Arabic voice.

Not built: AI generation (blocked, no endpoint), transition types beyond cut and fade, voice cloning, and
interactive timeline scrubbing in the panel.
