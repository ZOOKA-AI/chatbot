import assert from "node:assert/strict";
import { afterEach, test, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("next-auth/jwt", () => ({ getToken: vi.fn().mockResolvedValue(null) }));

import { authConfig } from "@/app/(auth)/auth.config";
import { proxy } from "@/proxy";

afterEach(() => {
  vi.unstubAllEnvs();
});

test("production auth routes redirect to the canonical host with method and query intact", async () => {
  vi.stubEnv("VERCEL_ENV", "production");
  for (const host of ["www.zooka-ai.com", "chatbot-seven-lilac-41.vercel.app", "other.vercel.app"]) {
    for (const path of ["/login", "/register", "/api/auth", "/api/auth/callback/google"]) {
      const response = await proxy(
        new NextRequest(`https://${host}${path}?code=a%2Bb&state=xyz`, {
          method: "POST",
        })
      );
      assert.equal(response.status, 307);
      assert.equal(
        response.headers.get("location"),
        `https://zooka-ai.com${path}?code=a%2Bb&state=xyz`
      );
    }
  }
});

test("canonical, preview, and unrelated routes are not canonicalized", async () => {
  vi.stubEnv("VERCEL_ENV", "production");
  for (const url of [
    "https://zooka-ai.com/api/auth/callback/google?code=abc",
    "https://other.vercel.app/api/authentication",
    "https://other.vercel.app/pricing",
  ]) {
    const response = await proxy(new NextRequest(url));
    assert.equal(response.headers.get("location"), null);
  }
  for (const env of ["preview", "development", ""]) {
    vi.stubEnv("VERCEL_ENV", env);
    const response = await proxy(
      new NextRequest("https://preview.vercel.app/api/auth/callback/google")
    );
    assert.equal(response.headers.get("location"), null);
  }
});

test("Auth.js trusts Vercel and uses its secure host-only cookie defaults outside development", () => {
  assert.equal(authConfig.trustHost, true);
  assert.equal(authConfig.useSecureCookies, process.env.NODE_ENV !== "development");
  assert.equal(authConfig.pages.error, "/login");
});
