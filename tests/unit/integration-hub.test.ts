import { expect, test, vi } from "vitest";
import { connectionState, hubProviders } from "@/lib/integration-hub/catalog";
import { probeCredential, probeUrls } from "@/lib/integration-hub/probe";

test("a credential is never verified from configuration alone; success expires and invalidates on rotation", () => {
  const now = Date.now();
  const base = {
    configured: true,
    stored: false,
    expired: false,
    fingerprint: "a",
    now,
  };
  expect(connectionState(base)).toBe("CONFIGURED");
  expect(connectionState({ ...base, configured: false })).toBe(
    "NOT CONFIGURED"
  );
  expect(connectionState({ ...base, stored: true })).toBe("CONFIGURED");
  const verification = {
    state: "VERIFIED" as const,
    checkedAt: new Date(now).toISOString(),
    fingerprint: "a",
    code: "READ_OK",
  };
  expect(connectionState({ ...base, stored: true, verification })).toBe(
    "VERIFIED"
  );
  expect(
    connectionState({ ...base, stored: true, verification, fingerprint: "b" })
  ).toBe("CONFIGURED");
  expect(
    connectionState({ ...base, stored: true, verification, now: now + 900_001 })
  ).toBe("CONFIGURED");
  expect(
    connectionState({ ...base, stored: true, expired: true, verification })
  ).toBe("EXPIRED");
});
test("probes use fixed origins, no redirect, bounded timeout and discard account data", async () => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
    Response.json({
      id: 1,
      login: "private-account",
      email: "private@example.test",
    })
  );
  const result = await probeCredential("github", "unit-test-only", fetcher);
  expect(result).toEqual({ state: "VERIFIED", code: "READ_OK" });
  expect(JSON.stringify(result)).not.toContain("private");
  expect(fetcher.mock.calls[0][0]).toBe(probeUrls.github);
  expect(fetcher.mock.calls[0][1]?.redirect).toBe("error");
  expect(fetcher.mock.calls[0][1]?.signal).toBeTruthy();
  await probeCredential("https://evil.test", "unit-test-only", fetcher);
  expect(fetcher).toHaveBeenCalledTimes(1);
});
test("200 without expected provider schema does not count; auth/errors stay sanitized", async () => {
  for (const [status, body, state] of [
    [200, {}, "ERROR"],
    [401, { error: "SECRET" }, "EXPIRED"],
    [403, { error: "SECRET" }, "ERROR"],
    [429, { error: "SECRET" }, "ERROR"],
  ] as const) {
    const result = await probeCredential(
      "github",
      "test",
      vi.fn<typeof fetch>().mockResolvedValue(Response.json(body, { status }))
    );
    expect(result.state).toBe(state);
    expect(JSON.stringify(result)).not.toContain("SECRET");
  }
  const result = await probeCredential(
    "github",
    "test",
    vi.fn<typeof fetch>().mockRejectedValue(new Error("SECRET"))
  );
  expect(result).toEqual({ state: "ERROR", code: "PROVIDER_UNREACHABLE" });
});
test("each catalog entry has real help fields and unique id, unsupported publishers are not probed", () => {
  expect(new Set(hubProviders.map((p) => p.id)).size).toBe(hubProviders.length);
  for (const p of hubProviders) {
    expect(p.docs.startsWith("https://")).toBe(true);
    expect(p.auth).toBeTruthy();
    if (p.canTest) {
      expect(probeUrls[p.id]).toBeTruthy();
    }
  }
  for (const id of [
    "instagram",
    "facebook",
    "youtube",
    "tiktok",
    "pinterest",
  ]) {
    expect(hubProviders.find((p) => p.id === id)?.canTest).toBe(false);
  }
});
