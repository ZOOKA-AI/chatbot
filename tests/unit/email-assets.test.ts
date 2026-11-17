import { afterEach, expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});

test("email logo always loads from the public production origin, even when sent from a protected preview", async () => {
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
  delete process.env.NEXT_PUBLIC_APP_URL;
  vi.stubEnv("VERCEL_URL", "chatbot-abc123-zooka-ai1.vercel.app");
  const bodies: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: RequestInit) => {
      bodies.push(String(init?.body ?? ""));
      return new Response("{}", { status: 200 });
    })
  );
  const mod = await import("@/lib/email/send");
  expect(mod.EMAIL_ASSET_BASE).toBe("https://zooka-ai.com");
  await mod.sendPasswordResetEmail("someone@example.test", "a".repeat(64), "ar").catch(() => undefined);
  const sent = bodies.join("\n");
  expect(sent).toContain("https://zooka-ai.com/images/zooka-logo-120.png");
  expect(sent).not.toContain("chatbot-abc123-zooka-ai1.vercel.app/images/");
});
