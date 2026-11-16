# ZOOKA AI Gateway

One interface in front of every way ZOOKA can produce media, so no single vendor can take the studio
down and no customer approves a price the system cannot substantiate.

Status: implemented and wired. No billable inference has been submitted anywhere, by design.

## The shape

```
Action catalogue / agent worker
        │
   routeGeneration()          chooses: capability → model → credential → health → cost → budget → speed → preference
        │
   GatewayProvider           the same nine answers for every vendor
        │
local-engines │ comfyui │ runcomfy-cloud │ fal-cloud
        │
   output stored in the tenant media library, under the chosen project
```

`lib/studio/gateway/providers.ts` holds the interface and the four providers.
`lib/studio/gateway/router.ts` holds the decision. `lib/studio/gateway/fal.ts` is the fal transport.
`lib/agents/worker-tools/studio-ai-generate.ts` is the only caller that can reach a billable submit.

## Providers and what is actually true about each

| Provider | Tier | Paid | Executes here | Readiness today | Evidence |
|---|---|---|---|---|---|
| `local-engines` | local | no | yes, synchronous | `ready` | ffmpeg, rembg, Piper on our CPU |
| `comfyui` | self-hosted | no | no (runs in `lib/studio/providers.ts`) | `endpoint_missing` | no `COMFYUI_ENDPOINT` configured |
| `runcomfy-cloud` | cloud | yes | yes | `credential_missing` | no `RUNCOMFY_API_TOKEN` |
| `fal-cloud` | cloud | yes | yes | `credential_missing` | no `FAL_KEY` |

`comfyui` is deliberately `executable: false`. Its client already exists in the self-hosted path; adding a
second one here would be two code paths guessing at one instance. The gateway reports its readiness so the
ladder and the panel are complete and honest.

## Verified endpoints

RunComfy (read from `https://docs.runcomfy.com`, 16 Nov 2026):

| Purpose | Endpoint |
|---|---|
| discovery | `GET https://model-api.runcomfy.net/v1/models?category=…` |
| submit (billable) | `POST https://model-api.runcomfy.net/v1/models/{model_id}` |
| status | `GET /v1/requests/{id}/status` → `in_queue`, `in_progress`, `completed`, `cancelled` |
| result | `GET /v1/requests/{id}/result?include_cost=true` → `succeeded`, `failed`, `cancelled`, `cost` |
| cancel | `POST /v1/requests/{id}/cancel` → `cancelled`, `not_cancellable` |
| balance | `GET https://api.runcomfy.net/prod/v2/balance` |

fal (read from `https://fal.ai/docs/documentation/model-apis/queue`, 16 Nov 2026):

| Purpose | Endpoint |
|---|---|
| submit (billable) | `POST https://queue.fal.run/{owner}/{app}[/{path}]` with `Authorization: Key <FAL_KEY>` |
| status | `GET <status_url from submit>` → `IN_QUEUE`, `IN_PROGRESS`, `COMPLETED` |
| result | `GET <response_url from submit>` |
| cancel | `POST <cancel_url from submit>` |

Two documented fal details are load-bearing and are asserted in tests: the status/result/cancel URLs use
only owner and app (a URL carrying the model path returns `405`), and fal itself re-queues a failed runner
up to ten times, so a timeout is not proof of failure and this client re-polls instead of re-submitting.

## Pricing, and where the numbers come from

- RunComfy: `base_price_usd` × the billing unit (`output` or `second`), from the live catalogue. The
  catalogue's own note says the base rate is not the final price, so the estimate is labelled as an
  estimate and the **actual** charge is read back from `cost` on the result.
- fal: **no public price feed on the Model API host.** A price exists only when an owner configures one
  (`FAL_PRICE_USD_<MODEL>`). An unpriced fal model yields `cost_unknown`, and the router refuses it. It
  never becomes a zero.
- Local: zero, and the reason is that no third party is involved.

## The decision, in the order it runs

1. `capability` — only providers that declare it are considered.
2. `model` — an explicitly requested model must be offered **by exact id**, or the answer is
   `requested_model_not_offered`. A cheaper model is never substituted.
3. `credential` — `readiness()` returns a code: `ready`, `credential_missing`, `credential_unverified`,
   `endpoint_missing`, `not_executable`, `paid_disabled`.
4. `health` — a provider that fails discovery is refused with its classified error and the others continue.
5. `cost` — unknown cost is a refusal.
6. `budget` — `over_budget` and `run_limit_exceeded` are refusals, not warnings.
7. `speed` — expressed as tier order: local, then the owner's hardware, then cloud.
8. `preference` — reorders candidates that already qualified; it can never admit a refused one.

## Financial control

`PAID_GENERATION_ENABLED` defaults off and is read in exactly one module (`lib/studio/paid-switch.ts`), so
the ladder and the cost gate cannot disagree. A paid job additionally needs an approval reference for that
job, an estimate inside the cap (`RUNCOMFY_MAX_SPEND_USD`, default 0.50), the run total inside the cap, and
a wallet that covers it where the provider documents a balance endpoint. fal documents none, so for fal the
cap and the approval are the controls and the gap is recorded in the tool's evidence as `balanceChecked:
false` rather than pretended away.

Duplicate protection is two-layered: the queue refuses an identical waiting request, and the worker tool
refuses an identical in-flight job by a hash of tenant + kind + model + prompt.

## Environment

| Variable | Purpose |
|---|---|
| `RUNCOMFY_API_TOKEN` | RunComfy bearer token (absent today) |
| `FAL_KEY` | fal API key (absent today) |
| `FAL_MODELS_IMAGE`, `FAL_MODELS_VIDEO` | the fal models this deployment may use, comma separated |
| `FAL_PRICE_USD_<MODEL>` | the owner's stated price for that model; without it the model is refused |
| `PAID_GENERATION_ENABLED` | `"true"` enables billable inference; default off |
| `RUNCOMFY_MAX_SPEND_USD` | per-job and per-run cap |
| `RUNCOMFY_POLL_BUDGET_MS`, `RUNCOMFY_POLL_INTERVAL_MS` | polling window |

## What acceptance proved

`scripts/acceptance/runcomfy-status-check.mjs`, 11/11 on a real server with a signed-in owner:
owner can read both the provider status and the gateway; a missing credential is named for both vendors;
paid generation is off with the cap stated; no key material appears in any response; both endpoints are
owner-only (307 for an anonymous caller); the gateway lists all four providers; the local engines are ready
and free; both cloud providers return a readiness **code**; the cap is reported.

Unit coverage: 15 adapter cases (documented fixtures, the 405 rule, no submit retry, key redaction,
unverified-key honesty) and 14 router cases (ladder, no-substitution, budget, unpriced refusal, outage
isolation, preference limits).

Gates: 890 passed / 6 skipped / 896 in 102 files, twice, same environment. `tsc` clean. `next build` 0.

## Blocked, and exactly what unblocks it

`CREDENTIAL_REQUIRED` for both paid providers. No real generation is claimed, because none has run.

To run the first real job, all of these, in this order:

1. Owner enters `RUNCOMFY_API_TOKEN` (or `FAL_KEY`) through the secret form, never in chat.
2. Owner sets `FAL_MODELS_IMAGE` and a price per model if fal is the chosen vendor.
3. Owner sets `PAID_GENERATION_ENABLED=true` and `RUNCOMFY_MAX_SPEND_USD` to the test ceiling.
4. The gateway's `/api/studio/gateway` then reports the provider ready, and the model count appears.
5. One job, one approval reference, one prompt. The estimate is displayed before approval, and the actual
   charge is recorded from the provider afterwards.

The RunComfy wallet stood at $0.50 with automatic top-up off; at the cheapest catalogue rate a single image
test is about $0.06. fal's price is whatever the model page states and the owner configures.
