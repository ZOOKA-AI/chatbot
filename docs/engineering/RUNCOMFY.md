# RunComfy Cloud — the optional paid generation provider

Status: implemented and wired, credential not configured. No paid inference has ever been submitted from
this codebase, and nothing here claims a real generated image until one completes with an owner's token.

## What was verified, and where

Every path and field below was read from the official documentation on 16 November 2026 at
`https://docs.runcomfy.com` (index: `/llms.txt`). Nothing is guessed: if a field is not in the table it is
not used in code.

| Purpose | Method and path | Documented fields used |
|---|---|---|
| Discover models and prices | `GET https://model-api.runcomfy.net/v1/models` | `models[]`, `total`, `model_id`, `categories`, `base_price_usd`, `price_unit`, `pricing_note`, `required_inputs`, `supported_batch_size` |
| One model's input schema | `GET /v1/models/{model_id}` | full model record |
| Categories | `GET /v1/models/categories` | documented, not needed by this integration |
| Submit inference (billable) | `POST /v1/models/{model_id}` | returns `request_id`, `status_url`, `result_url`, `cancel_url` |
| Poll status | `GET /v1/requests/{request_id}/status` | `status` ∈ `in_queue`, `in_progress`, `completed`, `cancelled`; `queue_position` |
| Retrieve result | `GET /v1/requests/{request_id}/result?include_cost=true` | `status` ∈ `succeeded`, `failed`, `in_queue`, `in_progress`, `cancelled`; `output`, `cost`, `created_at`, `finished_at` |
| Cancel | `POST /v1/requests/{request_id}/cancel` | `outcome` ∈ `cancelled`, `not_cancellable` |
| Account balance | `GET https://api.runcomfy.net/prod/v2/balance` | `balance_microdollars`, `balance_usd`, `currency` |

Error codes, as documented: `400001` invalid resource, `400002` insufficient balance, `400004` account or
token invalid, `403001` permission denied, `404001` not found.

Authentication is `Authorization: Bearer <token>` on every call. The token comes from
`https://www.runcomfy.com/profile` (avatar menu → API Token) and is entered by the owner into the server's
secret store, never into chat.

Pricing model, quoted: billed **per request**, no idle GPUs, no deployments. `base_price_usd` is a base
rate, not a final price; the billing unit is `output` or `second`. The only authoritative charge is `cost`
on the result when `include_cost=true`, which is why the report shows that figure rather than the estimate.

## Configuration

| Variable | Server-side | Meaning |
|---|---|---|
| `RUNCOMFY_API_TOKEN` | yes, never public | the bearer token; absent today |
| `PAID_GENERATION_ENABLED` | yes | `"true"` is the only value that enables billable inference. Default off |
| `RUNCOMFY_MAX_SPEND_USD` | yes | per-job and per-run cap, default `0.50` |
| `RUNCOMFY_POLL_BUDGET_MS` | yes | how long a job may be polled, default `120000` |
| `RUNCOMFY_DEFAULT_VIDEO_SECONDS` | yes | duration used to price a per-second video model, default `5` |

`STUDIO_ALLOW_PAID_PROVIDERS=1` is accepted as an alias of the switch so the older studio ladder and this
provider cannot disagree. There is exactly one read of that switch: `lib/studio/paid-switch.ts`.

## The gate, in order

`lib/agents/worker-tools/studio-ai-generate.ts` refuses before it spends, and each refusal names itself:

1. credential present (`not_configured` otherwise, and no network call is made)
2. prompt present (`prompt_required`)
3. model chosen from the live catalogue for the capability (`model_wrong_capability`, `no_model_available`)
4. estimate from the documented pricing model (`cost_unknown` when the unit or rate is unknown)
5. wallet read (`balance_not_checked` when it cannot be read)
6. operator switch, per-job approval, cap, running limit, balance (`spend_not_authorized` with the reasons)

Only after all six does `submitRequest` run. A submit is never retried: the provider answers 200 with a
request id, so a blind retry is a second bill for the same picture.

## What is blocked, exactly

`CREDENTIAL_REQUIRED`: `RUNCOMFY_API_TOKEN` is not set in this environment. Reported by
`GET /api/studio/runcomfy/status` as `{ configured: false, blocker: "RUNCOMFY_API_TOKEN is not set on the
server" }`, and by the provider panel as `credential_missing`.

Because no credential exists, these were **not** done and are not claimed: authenticated connectivity
against the live API, model discovery for this account, and any real generation. The asynchronous
lifecycle is instead proven end to end against the documented wire format with mocked responses
(`tests/unit/runcomfy-lifecycle.test.ts`, 8 cases).

## Exact requirements for the first paid test

1. Owner creates a token at RunComfy → Profile → API Token, named for this purpose, and enters it through
   the agent's secret form as `RUNCOMFY_API_TOKEN`. It is never shown in chat or committed.
2. Owner confirms the wallet covers the test: the account held **$0.50** and automatic top-up is off.
3. A model is chosen from the live catalogue with a known `base_price_usd` and `price_unit`. At $0.06 per
   image the cheapest image test costs about **$0.06**; a per-second video model costs more, and the
   estimate is displayed before approval.
4. `PAID_GENERATION_ENABLED=true` and `RUNCOMFY_MAX_SPEND_USD` set to the test ceiling, for example `0.10`.
5. One job, one approval reference, one prompt. The approval is recorded against that job only.

Until all five exist, the studio's deterministic path (edit, cutout, narration, render, promo film) is
what runs, and it needs none of this.

## Licence and exposure notes

- Model licences vary per model and per publisher. Nothing in the catalogue is assumed commercially usable:
  the model's own page is the authority, and a licence must be checked before customer work uses it.
- The token is held server-side only. `lib/studio/runcomfy.ts` redacts it from every error message before
  the text leaves the module, and the status route returns only probe fields.
- No GPU was purchased, no deployment was created, no automatic top-up was enabled, and ComfyUI remains
  unreachable until an owner runs one.
