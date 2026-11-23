import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The phone form must never be shown to users because a credential merely
 * exists. A Twilio trial account has valid credentials and still refuses every
 * UAE recipient, so the switch is deliberate and separate.
 */
const ENV_KEYS = [
  "TWILIO_ACCOUNT_SID",
  "TWILIO_AUTH_TOKEN",
  "TWILIO_FROM_NUMBER",
  "UNIFONIC_APP_SID",
  "PHONE_LOGIN_ENABLED",
] as const;

const saved: Record<string, string | undefined> = {};

async function loadModule() {
  vi.resetModules();
  return await import("@/lib/auth/sms");
}

describe("phone login gate", () => {
  beforeEach(() => {
    for (const key of ENV_KEYS) saved[key] = process.env[key];
    for (const key of ENV_KEYS) delete process.env[key];
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });

  it("stays off when no provider is configured", async () => {
    const { phoneLoginEnabled, smsProvider } = await loadModule();
    expect(smsProvider).toBeNull();
    expect(phoneLoginEnabled).toBe(false);
  });

  it("stays off with Twilio credentials alone", async () => {
    process.env.TWILIO_ACCOUNT_SID = "AC00000000000000000000000000000000";
    process.env.TWILIO_AUTH_TOKEN = "token";
    process.env.TWILIO_FROM_NUMBER = "+14782538426";
    const { phoneLoginEnabled, smsProvider } = await loadModule();
    expect(smsProvider).toBe("twilio");
    expect(phoneLoginEnabled).toBe(false);
  });

  it("stays off with Unifonic credentials alone", async () => {
    process.env.UNIFONIC_APP_SID = "app-sid";
    const { phoneLoginEnabled, smsProvider } = await loadModule();
    expect(smsProvider).toBe("unifonic");
    expect(phoneLoginEnabled).toBe(false);
  });

  it("turns on only with both a provider and the explicit switch", async () => {
    process.env.UNIFONIC_APP_SID = "app-sid";
    process.env.PHONE_LOGIN_ENABLED = "on";
    const { phoneLoginEnabled } = await loadModule();
    expect(phoneLoginEnabled).toBe(true);
  });

  it("ignores any value of the switch other than on", async () => {
    process.env.UNIFONIC_APP_SID = "app-sid";
    process.env.PHONE_LOGIN_ENABLED = "true";
    const { phoneLoginEnabled } = await loadModule();
    expect(phoneLoginEnabled).toBe(false);
  });
});
