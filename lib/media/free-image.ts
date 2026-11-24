/**
 * Free-tier image generation providers.
 *
 * Two providers with a real, recurring free allowance, tried in order:
 *
 * 1. Cloudflare Workers AI, FLUX.1 [schnell] (Apache-2.0). 10,000 Neurons a day free per account,
 *    reset at 00:00 UTC; a 1024px image at 4 steps is about 58 Neurons. Needs CLOUDFLARE_ACCOUNT_ID
 *    and CLOUDFLARE_AI_TOKEN (a token with the Workers AI permission).
 * 2. OVHcloud AI Endpoints, Stable Diffusion XL (OpenRAIL++), listed at no cost. Anonymous calls are
 *    limited to one per IP, which a shared serverless IP has already spent, so it needs
 *    OVH_AI_ENDPOINTS_ACCESS_TOKEN. OVHcloud marks this model as retiring on 2027-02-10.
 *
 * Nothing here bills: when a free allowance is used up the provider answers with an error and the
 * next one is tried. When every provider is unconfigured or refuses, the caller gets the reasons and
 * must say so; no placeholder image is ever returned.
 */

export type Env = Record<string, string | undefined>;

export type FreeImageProviderId = "cloudflare-workers-ai" | "ovhcloud-sdxl";

export type FreeImageSuccess = {
  ok: true;
  provider: FreeImageProviderId;
  model: string;
  bytes: Buffer;
  mimeType: "image/jpeg" | "image/png" | "image/webp";
  seconds: number;
};

export type FreeImageFailure = {
  ok: false;
  /** One entry per provider, in the order they were considered. */
  attempts: Array<{ provider: FreeImageProviderId; code: string; detail: string | null }>;
};

export type FreeImageStatus = {
  provider: FreeImageProviderId;
  model: string;
  configured: boolean;
  missing: string[];
  note: string;
};

export const CLOUDFLARE_MODEL = "@cf/black-forest-labs/flux-1-schnell";
export const OVH_MODEL = "stable-diffusion-xl-base-v10";
const OVH_URL = "https://oai.endpoints.kepler.ai.cloud.ovh.net/v1/images/generations";
const MAX_BYTES = 10 * 1024 * 1024;

function cloudflareCredentials(env: Env) {
  const accountId = env.CLOUDFLARE_ACCOUNT_ID?.trim() || null;
  const token = env.CLOUDFLARE_AI_TOKEN?.trim() || env.CLOUDFLARE_API_TOKEN?.trim() || null;
  return { accountId, token };
}

function ovhToken(env: Env) {
  return env.OVH_AI_ENDPOINTS_ACCESS_TOKEN?.trim() || null;
}

export function freeImageStatuses(env: Env = process.env): FreeImageStatus[] {
  const cf = cloudflareCredentials(env);
  const ovh = ovhToken(env);
  return [
    {
      provider: "cloudflare-workers-ai",
      model: CLOUDFLARE_MODEL,
      configured: Boolean(cf.accountId && cf.token),
      missing: [
        ...(cf.accountId ? [] : ["CLOUDFLARE_ACCOUNT_ID"]),
        ...(cf.token ? [] : ["CLOUDFLARE_AI_TOKEN"]),
      ],
      note: "FLUX.1 schnell, 10,000 free Neurons a day (about 170 images at 1024px), reset 00:00 UTC",
    },
    {
      provider: "ovhcloud-sdxl",
      model: OVH_MODEL,
      configured: Boolean(ovh),
      missing: ovh ? [] : ["OVH_AI_ENDPOINTS_ACCESS_TOKEN"],
      note: "Stable Diffusion XL, free and rate limited; OVHcloud retires it on 2027-02-10",
    },
  ];
}

export function anyFreeImageProvider(env: Env = process.env): boolean {
  return freeImageStatuses(env).some((status) => status.configured);
}

/** The JPEG/PNG/WebP signature, so a JSON error body is never stored as a picture. */
export function sniffImage(bytes: Buffer): FreeImageSuccess["mimeType"] | null {
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length > 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return "image/png";
  }
  if (bytes.length > 12 && bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP") {
    return "image/webp";
  }
  return null;
}

function classifyStatus(status: number): string {
  if (status === 401 || status === 403) return "credential_rejected";
  if (status === 429) return "free_allowance_exhausted";
  if (status >= 500) return "provider_unavailable";
  return `http_${status}`;
}

type Attempt = FreeImageFailure["attempts"][number];

async function callCloudflare(
  prompt: string,
  env: Env,
  fetchImpl: typeof fetch,
  signal: AbortSignal
): Promise<FreeImageSuccess | Attempt> {
  const { accountId, token } = cloudflareCredentials(env);
  if (!(accountId && token)) {
    return { provider: "cloudflare-workers-ai", code: "not_configured", detail: "CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_AI_TOKEN" };
  }
  if (!/^[a-f0-9]{32}$/i.test(accountId)) {
    return { provider: "cloudflare-workers-ai", code: "invalid_account_id", detail: null };
  }
  const started = Date.now();
  const response = await fetchImpl(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${CLOUDFLARE_MODEL}`,
    {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ prompt: prompt.slice(0, 2048), steps: 4 }),
      signal,
    }
  );
  if (!response.ok) {
    return { provider: "cloudflare-workers-ai", code: classifyStatus(response.status), detail: `HTTP ${response.status}` };
  }
  const body = (await response.json().catch(() => null)) as { result?: { image?: string }; success?: boolean } | null;
  const encoded = body?.result?.image;
  if (!encoded) return { provider: "cloudflare-workers-ai", code: "empty_output", detail: null };
  const bytes = Buffer.from(encoded, "base64");
  const mimeType = sniffImage(bytes);
  if (!mimeType || bytes.length > MAX_BYTES) {
    return { provider: "cloudflare-workers-ai", code: "invalid_output", detail: null };
  }
  return {
    ok: true,
    provider: "cloudflare-workers-ai",
    model: CLOUDFLARE_MODEL,
    bytes,
    mimeType,
    seconds: Math.round((Date.now() - started) / 100) / 10,
  };
}

async function callOvh(
  prompt: string,
  env: Env,
  fetchImpl: typeof fetch,
  signal: AbortSignal
): Promise<FreeImageSuccess | Attempt> {
  const token = ovhToken(env);
  if (!token) return { provider: "ovhcloud-sdxl", code: "not_configured", detail: "OVH_AI_ENDPOINTS_ACCESS_TOKEN" };
  const started = Date.now();
  const response = await fetchImpl(OVH_URL, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ model: OVH_MODEL, prompt: prompt.slice(0, 2000), response_format: "b64_json" }),
    signal,
  });
  if (!response.ok) {
    return { provider: "ovhcloud-sdxl", code: classifyStatus(response.status), detail: `HTTP ${response.status}` };
  }
  const body = (await response.json().catch(() => null)) as { data?: Array<{ b64_json?: string }> } | null;
  const encoded = body?.data?.[0]?.b64_json;
  if (!encoded) return { provider: "ovhcloud-sdxl", code: "empty_output", detail: null };
  const bytes = Buffer.from(encoded, "base64");
  const mimeType = sniffImage(bytes);
  if (!mimeType || bytes.length > MAX_BYTES) return { provider: "ovhcloud-sdxl", code: "invalid_output", detail: null };
  return {
    ok: true,
    provider: "ovhcloud-sdxl",
    model: OVH_MODEL,
    bytes,
    mimeType,
    seconds: Math.round((Date.now() - started) / 100) / 10,
  };
}

/**
 * Generates one image from the first free provider that succeeds.
 *
 * `only` restricts the chain to a single provider, which the studio panel uses when it reports one
 * provider's own health.
 */
export async function generateFreeImage(
  prompt: string,
  options: { env?: Env; fetchImpl?: typeof fetch; timeoutMs?: number; only?: FreeImageProviderId } = {}
): Promise<FreeImageSuccess | FreeImageFailure> {
  const env = options.env ?? process.env;
  const fetchImpl = options.fetchImpl ?? fetch;
  const chain: Array<[FreeImageProviderId, typeof callCloudflare]> = [
    ["cloudflare-workers-ai", callCloudflare],
    ["ovhcloud-sdxl", callOvh],
  ];
  const attempts: Attempt[] = [];
  for (const [id, call] of chain) {
    if (options.only && options.only !== id) continue;
    const signal = AbortSignal.timeout(options.timeoutMs ?? 60_000);
    try {
      const outcome = await call(prompt, env, fetchImpl, signal);
      if ("ok" in outcome) return outcome;
      attempts.push(outcome);
    } catch (error) {
      attempts.push({
        provider: id,
        code: error instanceof Error && error.name === "TimeoutError" ? "timeout" : "network_error",
        detail: error instanceof Error ? error.name : null,
      });
    }
  }
  return { ok: false, attempts };
}

/** Plan-based daily cap per workspace, counted in UTC days. The free allowance is shared, so it is small. */
export const FREE_IMAGE_DAILY_LIMIT = { free: 5, pro: 50, business: 200 } as const;

export function dailyImageLimit(plan: string): number {
  return plan in FREE_IMAGE_DAILY_LIMIT
    ? FREE_IMAGE_DAILY_LIMIT[plan as keyof typeof FREE_IMAGE_DAILY_LIMIT]
    : FREE_IMAGE_DAILY_LIMIT.free;
}
