import { afterEach, describe, expect, test, vi } from "vitest";

import {
  MIN_PASSWORD_LENGTH,
  passwordProblem,
  passwordStrength,
} from "@/lib/auth/password-policy";
import {
  checkSessionVersion,
  credentialVersion,
} from "@/lib/auth/session-version";
import { generateHashedPassword } from "@/lib/db/utils";

vi.mock("server-only", () => ({}));

describe("sessions end when the password changes", () => {
  const before = generateHashedPassword("old-password-1");
  const after = generateHashedPassword("new-password-2");

  test("a fresh sign-in is stamped with the current credential", () => {
    expect(checkSessionVersion(undefined, { password: before })).toEqual({
      action: "stamp",
      version: credentialVersion(before),
    });
  });

  test("the same credential keeps the session", () => {
    expect(
      checkSessionVersion(credentialVersion(before), { password: before })
    ).toEqual({
      action: "keep",
    });
  });

  test("a reset on another device revokes the session", () => {
    expect(
      checkSessionVersion(credentialVersion(before), { password: after })
    ).toEqual({
      action: "revoke",
      reason: "password_changed",
    });
  });

  test("resetting to the same password text still revokes (new bcrypt salt)", () => {
    const again = generateHashedPassword("old-password-1");
    expect(
      checkSessionVersion(credentialVersion(before), { password: again }).action
    ).toBe("revoke");
  });

  test("a deleted account revokes the session", () => {
    expect(checkSessionVersion(credentialVersion(before), undefined)).toEqual({
      action: "revoke",
      reason: "account_missing",
    });
  });

  test("the stamp is a short digest, never the hash itself", () => {
    const version = credentialVersion(before);
    expect(version).toMatch(/^[0-9a-f]{16}$/);
    expect(before).not.toContain(version);
  });
});

describe("password policy for new passwords", () => {
  test("minimum length is 8", () => {
    expect(MIN_PASSWORD_LENGTH).toBe(8);
    expect(passwordProblem("Ab1!xyz")).toBe("too_short");
    expect(passwordProblem("Ab1!xyzq")).toBeNull();
  });

  test("common and single-character passwords are refused", () => {
    expect(passwordProblem("password123")).toBe("too_common");
    expect(passwordProblem("PASSWORD1")).toBe("too_common");
    expect(passwordProblem("12345678")).toBe("too_common");
    expect(passwordProblem("aaaaaaaaaa")).toBe("too_common");
  });

  test("bcrypt's 72-byte limit is enforced instead of silently truncating", () => {
    expect(passwordProblem("a1".repeat(36))).toBeNull();
    expect(passwordProblem(`${"a1".repeat(36)}x`)).toBe("too_long");
    // Arabic letters are two bytes each in UTF-8.
    expect(passwordProblem("كلمة".repeat(10))).toBe("too_long");
  });

  test("strength rises with length and variety", () => {
    expect(passwordStrength("short")).toBe(0);
    expect(passwordStrength("lowercase")).toBe(1);
    expect(passwordStrength("Mixed1Case")).toBe(2);
    expect(passwordStrength("Longer-Mixed-123")).toBe(4);
  });
});

describe("mail relay key", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  test("without ZOOKA_MAIL_KEY nothing is sent and no built-in key is used", async () => {
    vi.stubEnv("ZOOKA_MAIL_KEY", "");
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const errors = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const { sendMail } = await import("@/lib/email/send");
    expect(await sendMail("someone@example.test", "s", "<p>x</p>")).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(errors).toHaveBeenCalledWith(
      "mail not sent: ZOOKA_MAIL_KEY is not configured"
    );
    errors.mockRestore();
  });

  test("with ZOOKA_MAIL_KEY the configured key is the one sent", async () => {
    vi.stubEnv("ZOOKA_MAIL_KEY", "test-key-from-env");
    const fetchSpy = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchSpy);
    const { sendMail } = await import("@/lib/email/send");
    expect(await sendMail("someone@example.test", "s", "<p>x</p>")).toBe(true);
    const [, init] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(String(init.body));
    expect(body.key).toBe("test-key-from-env");
  });
});
