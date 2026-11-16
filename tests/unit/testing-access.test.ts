import { describe, expect, it } from "vitest";
import {
  OWNER_TESTING_EMAILS,
  unlimitedTestingModeFlag,
  hasUnlimitedTestingAccess,
  isAgentRunLimitExempt,
  isTestingAccessEmail,
  isUnlimitedTestingEnabled,
  testingAccessLabel,
} from "@/lib/billing/testing-access";

const ON = { [unlimitedTestingModeFlag]: "on" } as Record<string, string | undefined>;
const OFF = { [unlimitedTestingModeFlag]: "off" } as Record<string, string | undefined>;

describe("owner testing access", () => {
  it("authorizes exactly the seven owner addresses", () => {
    expect(OWNER_TESTING_EMAILS).toHaveLength(7);
    for (const email of OWNER_TESTING_EMAILS) {
      expect(isTestingAccessEmail(email)).toBe(true);
    }
  });

  it("is case and whitespace insensitive", () => {
    expect(isTestingAccessEmail("  HelmyHaroon8@Gmail.com ")).toBe(true);
  });

  it("rejects everyone else, including lookalikes and empty input", () => {
    expect(isTestingAccessEmail("someone@else.com")).toBe(false);
    expect(isTestingAccessEmail("helmyharoon8@gmail.com.evil.com")).toBe(false);
    expect(isTestingAccessEmail("helmyharoon8@gmail.co")).toBe(false);
    expect(isTestingAccessEmail("")).toBe(false);
    expect(isTestingAccessEmail(null)).toBe(false);
    expect(isTestingAccessEmail(undefined)).toBe(false);
  });

  it("needs the deployment switch as well as the address", () => {
    expect(hasUnlimitedTestingAccess("helmyharoon8@gmail.com", ON)).toBe(true);
    expect(hasUnlimitedTestingAccess("helmyharoon8@gmail.com", OFF)).toBe(false);
    expect(hasUnlimitedTestingAccess("helmyharoon8@gmail.com", {})).toBe(false);
    expect(hasUnlimitedTestingAccess("helmyharoon8@gmail.com", { [unlimitedTestingModeFlag]: "yes" })).toBe(false);
  });

  it("defaults to off when the flag is missing or misspelled", () => {
    expect(isUnlimitedTestingEnabled({})).toBe(false);
    expect(isUnlimitedTestingEnabled({ unlimited_testing_mode: "on" })).toBe(false);
    expect(isUnlimitedTestingEnabled(ON)).toBe(true);
  });

  it("waives the agent cap only for allowlisted addresses with the switch on", () => {
    expect(isAgentRunLimitExempt("hzaam391@gmail.com", ON)).toBe(true);
    expect(isAgentRunLimitExempt("hzaam391@gmail.com", OFF)).toBe(false);
    expect(isAgentRunLimitExempt("random@customer.com", ON)).toBe(false);
  });

  it("labels access for the owner panel", () => {
    expect(testingAccessLabel("helmyharoon8@gmail.com", ON)).toBe("unlimited");
    expect(testingAccessLabel("random@customer.com", ON)).toBe("standard");
  });
});
