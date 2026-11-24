import { describe, expect, it } from "vitest";
import {
  CLOUDFLARE_MODEL,
  dailyImageLimit,
  freeImageStatuses,
  generateFreeImage,
  sniffImage,
} from "@/lib/media/free-image";
import { selectEngine } from "@/lib/studio/engine-policy";
import { createFreeImageProvider } from "@/lib/studio/providers";

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const ACCOUNT = "0123456789abcdef0123456789abcdef";
const CF_ENV = { CLOUDFLARE_ACCOUNT_ID: ACCOUNT, CLOUDFLARE_AI_TOKEN: "cf-token" };
const BOTH_ENV = { ...CF_ENV, OVH_AI_ENDPOINTS_ACCESS_TOKEN: "ovh-token" };

type Call = { url: string; init: RequestInit };
function fakeFetch(responses: Array<() => Response>) {
  const calls: Call[] = [];
  const impl = (async (url: string, init: RequestInit) => {
    calls.push({ url: String(url), init });
    const next = responses.shift();
    if (!next) throw new Error("unexpected call");
    return next();
  }) as unknown as typeof fetch;
  return { impl, calls };
}

describe("free image providers", () => {
  it("reports exactly which variables are missing, and nothing is configured by default", () => {
    const statuses = freeImageStatuses({});
    expect(statuses.map((s) => [s.provider, s.configured])).toEqual([
      ["cloudflare-workers-ai", false],
      ["ovhcloud-sdxl", false],
    ]);
    expect(statuses[0].missing).toEqual(["CLOUDFLARE_ACCOUNT_ID", "CLOUDFLARE_AI_TOKEN"]);
    expect(statuses[1].missing).toEqual(["OVH_AI_ENDPOINTS_ACCESS_TOKEN"]);
  });

  it("with no keys it makes no network call and returns every reason", async () => {
    const { impl, calls } = fakeFetch([]);
    const outcome = await generateFreeImage("a red apple", { env: {}, fetchImpl: impl });
    expect(outcome.ok).toBe(false);
    expect(calls).toHaveLength(0);
    if (!outcome.ok) {
      expect(outcome.attempts.map((a) => a.code)).toEqual(["not_configured", "not_configured"]);
    }
  });

  it("calls Cloudflare's documented endpoint and decodes the base64 JPEG", async () => {
    const { impl, calls } = fakeFetch([
      () => Response.json({ success: true, result: { image: JPEG.toString("base64") } }),
    ]);
    const outcome = await generateFreeImage("a red apple", { env: CF_ENV, fetchImpl: impl });
    expect(outcome.ok).toBe(true);
    expect(calls[0].url).toBe(
      `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/ai/run/${CLOUDFLARE_MODEL}`
    );
    expect((calls[0].init.headers as Record<string, string>).authorization).toBe("Bearer cf-token");
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ prompt: "a red apple", steps: 4 });
    if (outcome.ok) {
      expect(outcome.mimeType).toBe("image/jpeg");
      expect(outcome.provider).toBe("cloudflare-workers-ai");
    }
  });

  it("falls back to OVHcloud when Cloudflare's daily allowance is spent", async () => {
    const { impl, calls } = fakeFetch([
      () => new Response("{}", { status: 429 }),
      () => Response.json({ data: [{ b64_json: PNG.toString("base64") }] }),
    ]);
    const outcome = await generateFreeImage("a red apple", { env: BOTH_ENV, fetchImpl: impl });
    expect(calls.map((c) => new URL(c.url).hostname)).toEqual([
      "api.cloudflare.com",
      "oai.endpoints.kepler.ai.cloud.ovh.net",
    ]);
    expect(outcome.ok && outcome.provider).toBe("ovhcloud-sdxl");
    expect(outcome.ok && outcome.mimeType).toBe("image/png");
  });

  it("never stores a non-image body as a picture", async () => {
    const { impl } = fakeFetch([
      () => Response.json({ result: { image: Buffer.from("not an image").toString("base64") } }),
    ]);
    const outcome = await generateFreeImage("x y z", { env: CF_ENV, fetchImpl: impl });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.attempts[0].code).toBe("invalid_output");
  });

  it("classifies a rejected key and a spent allowance distinctly", async () => {
    const { impl } = fakeFetch([
      () => new Response("{}", { status: 401 }),
      () => new Response("{}", { status: 429 }),
    ]);
    const outcome = await generateFreeImage("x y z", { env: BOTH_ENV, fetchImpl: impl });
    expect(!outcome.ok && outcome.attempts.map((a) => a.code)).toEqual([
      "credential_rejected",
      "free_allowance_exhausted",
    ]);
  });

  it("refuses a malformed account id before building a URL", async () => {
    const { impl, calls } = fakeFetch([]);
    const outcome = await generateFreeImage("x y z", {
      env: { CLOUDFLARE_ACCOUNT_ID: "../../evil", CLOUDFLARE_AI_TOKEN: "t" },
      fetchImpl: impl,
    });
    expect(calls).toHaveLength(0);
    expect(!outcome.ok && outcome.attempts[0].code).toBe("invalid_account_id");
  });

  it("sniffs only real image signatures", () => {
    expect(sniffImage(JPEG)).toBe("image/jpeg");
    expect(sniffImage(PNG)).toBe("image/png");
    expect(sniffImage(Buffer.from("{\"error\":1}"))).toBeNull();
  });

  it("daily limits follow the plan and unknown plans get the free limit", () => {
    expect(dailyImageLimit("free")).toBe(5);
    expect(dailyImageLimit("pro")).toBe(50);
    expect(dailyImageLimit("business")).toBe(200);
    expect(dailyImageLimit("mystery")).toBe(5);
  });
});

describe("studio wiring", () => {
  it("a configured free tier is chosen before any paid engine and needs no approval", () => {
    const decision = selectEngine({
      capability: "image_generate",
      env: { ...CF_ENV, RUNCOMFY_API_TOKEN: "x", PAID_GENERATION_ENABLED: "1" },
    });
    expect(decision.chosen).toBe("cloudflare-workers-ai");
    expect(decision.tier).toBe("free_api");
  });

  it("the studio provider reports the missing key, then generates when configured", async () => {
    const blocked = await createFreeImageProvider("cloudflare-workers-ai", { env: {} }).status();
    expect(blocked.ready).toBe(false);
    if (!blocked.ready) expect(blocked.blocked).toBe("credential_missing");

    const { impl } = fakeFetch([
      () => Response.json({ result: { image: JPEG.toString("base64") } }),
    ]);
    const provider = createFreeImageProvider("cloudflare-workers-ai", { env: CF_ENV, fetchImpl: impl });
    expect((await provider.status()).ready).toBe(true);
    const result = await provider.generate({ organizationId: "org-1", prompt: "a red apple", capability: "image" });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.meta.billed).toBe(false);
  });
});
