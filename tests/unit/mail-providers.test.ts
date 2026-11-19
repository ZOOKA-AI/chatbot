import { describe, expect, it } from "vitest";

import {
  getMailProvider,
  MAIL_PROVIDERS,
  MailProviderNotActivated,
  sendMessage,
} from "@/lib/mail/providers";

describe("mail provider adapters", () => {
  it("declares the three providers without overclaiming", () => {
    expect(MAIL_PROVIDERS.map((provider) => provider.id)).toEqual(["hosted", "gmail", "outlook"]);
  });

  it("marks hosted and Outlook as not activated, with the requirement spelled out", () => {
    for (const id of ["hosted", "outlook"]) {
      const provider = getMailProvider(id);
      expect(provider?.status).toBe("not_activated");
      expect(provider?.read).toBe(false);
      expect(provider?.send).toBe(false);
      expect((provider?.requirement ?? "").length).toBeGreaterThan(20);
    }
  });

  it("allows Gmail reads and refuses Gmail sends", () => {
    const gmail = getMailProvider("gmail");
    expect(gmail?.status).toBe("available");
    expect(gmail?.read).toBe(true);
    expect(gmail?.send).toBe(false);
  });

  it("returns null for an unknown provider rather than inventing one", () => {
    expect(getMailProvider("yahoo")).toBeNull();
  });

  it("throws a typed refusal instead of pretending to send", async () => {
    await expect(sendMessage()).rejects.toBeInstanceOf(MailProviderNotActivated);
    await expect(sendMessage()).rejects.toThrow(/not activated/i);
  });
});
