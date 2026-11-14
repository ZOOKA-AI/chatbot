import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import Google from "next-auth/providers/google";
import { NextRequest } from "next/server";
import { afterEach, test, vi } from "vitest";
import {
  googleLoginChecks,
  withGoogleTransactionCookies,
} from "@/lib/auth/google-transaction";
import { proxy } from "@/proxy";

vi.mock("next-auth/jwt", () => ({ getToken: vi.fn().mockResolvedValue(null) }));

afterEach(() => {
  vi.unstubAllEnvs();
});

test("parallel Google sign-ins retain their own state and PKCE cookies on the canonical host", async () => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("VERCEL_ENV", "production");
  vi.stubEnv("AUTH_URL", "https://zooka-ai.com");
  vi.stubEnv("NEXTAUTH_URL", "");
  const verifiers: string[] = [];
  const authCorePath = createRequire(import.meta.resolve("next-auth")).resolve("@auth/core");
  const { Auth, customFetch } = await import(authCorePath);
  const config = {
    basePath: "/api/auth",
    secret: "test-secret-for-google-oauth-transaction",
    trustHost: true,
    useSecureCookies: true,
    logger: { error() {}, warn() {}, debug() {} },
    providers: [
      Google({
        clientId: "test-client",
        clientSecret: "test-client-secret",
        checks: googleLoginChecks,
        [customFetch]: async (input: RequestInfo | URL, init?: RequestInit) => {
          if (String(input).includes(".well-known")) {
            return Response.json({
              issuer: "https://accounts.google.com",
              authorization_endpoint: "https://accounts.google.com/o/oauth2/v2/auth",
              token_endpoint: "https://oauth2.googleapis.com/token",
              userinfo_endpoint: "https://openidconnect.googleapis.com/v1/userinfo",
              code_challenge_methods_supported: ["S256"],
            });
          }
          verifiers.push((init?.body as URLSearchParams).get("code_verifier") ?? "");
          return Response.json({ error: "invalid_grant" }, { status: 400 });
        },
      }),
    ],
  };
  const handler = (request: NextRequest) => Auth(request, config) as Promise<Response>;
  const get = withGoogleTransactionCookies(handler);
  const post = withGoogleTransactionCookies(handler);
  const csrfResponse = await get(new NextRequest("https://zooka-ai.com/api/auth/csrf"));
  const { csrfToken } = (await csrfResponse.json()) as { csrfToken: string };
  const csrfCookie = csrfResponse.headers.getSetCookie()[0].split(";")[0];

  async function start() {
    const response = await post(
      new NextRequest("https://zooka-ai.com/api/auth/signin/google", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Cookie: csrfCookie,
          "X-Auth-Return-Redirect": "1",
        },
        body: new URLSearchParams({ csrfToken, callbackUrl: "/" }),
      })
    );
    const authorization = new URL(response.headers.get("location") ?? "");
    const state = authorization.searchParams.get("state");
    const challenge = authorization.searchParams.get("code_challenge");
    assert.ok(state);
    assert.ok(challenge);
    const cookies = response.headers.getSetCookie().filter((cookie) =>
      /^__Secure-authjs\.(state|pkce\.code_verifier)\./.test(cookie)
    );
    assert.equal(cookies.length, 2);
    for (const cookie of cookies) {
      assert.match(cookie, /;\s*HttpOnly/i);
      assert.match(cookie, /;\s*Secure/i);
      assert.match(cookie, /;\s*SameSite=Lax/i);
      assert.match(cookie, /;\s*Path=\//i);
      assert.doesNotMatch(cookie, /;\s*Domain=/i);
    }
    return { state, challenge, cookies: cookies.map((cookie) => cookie.split(";")[0]) };
  }

  const [first, second] = await Promise.all([start(), start()]);
  assert.notEqual(first.state, second.state);
  const cookieHeader = [...first.cookies, ...second.cookies].join("; ");
  for (const attempt of [second, first]) {
    const alias = new NextRequest(
      `https://www.zooka-ai.com/api/auth/callback/google?code=code&state=${encodeURIComponent(attempt.state)}`,
      { headers: { Cookie: cookieHeader } }
    );
    const redirect = await proxy(alias);
    assert.equal(redirect.status, 307);
    const location = redirect.headers.get("location");
    assert.ok(location);
    assert.equal(new URL(location).origin, "https://zooka-ai.com");
    const response = await get(new NextRequest(location, { headers: { Cookie: cookieHeader } }));
    const cleared = response.headers.getSetCookie().filter((cookie) => /Max-Age=0/i.test(cookie));
    for (const cookie of attempt.cookies) {
      assert.ok(cleared.some((value) => value.startsWith(`${cookie.split("=")[0]}=`)));
    }
    const other = attempt === first ? second : first;
    for (const cookie of other.cookies) {
      assert.ok(cleared.every((value) => !value.startsWith(`${cookie.split("=")[0]}=`)));
    }
    const verifier = verifiers.at(-1);
    assert.ok(verifier);
    assert.equal(createHash("sha256").update(verifier).digest("base64url"), attempt.challenge);
  }
  assert.equal(verifiers.length, 2);

  const mismatchedCookies = first.cookies.map((cookie, index) =>
    `${cookie.split("=")[0]}=${second.cookies[index].split("=")[1]}`
  );
  await get(
    new NextRequest(
      `https://zooka-ai.com/api/auth/callback/google?code=code&state=${encodeURIComponent(first.state)}`,
      { headers: { Cookie: mismatchedCookies.join("; ") } }
    )
  );
  assert.equal(verifiers.length, 2);

  await get(
    new NextRequest(
      `https://zooka-ai.com/api/auth/callback/google?code=code&state=${encodeURIComponent(first.state)}`,
      { headers: { Cookie: second.cookies.join("; ") } }
    )
  );
  assert.equal(verifiers.length, 2);
});
