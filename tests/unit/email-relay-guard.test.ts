import { afterEach, describe, expect, it, vi } from "vitest";

describe("mail relay credentials", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("refuses to send instead of falling back to a key from the source", async () => {
    vi.stubEnv("ZOOKA_MAIL_KEY", "");
    vi.resetModules();
    const { sendMail } = await import("@/lib/email/send");
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});

    const sent = await sendMail("someone@example.test", "s", "<p>b</p>");

    expect(sent).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(errors).toHaveBeenCalled();
    // Pinned to the unauthenticated call: the guard must run before any network.
    // (Defect: the source shipped a default key, so missing config still relayed.)
  });
});
