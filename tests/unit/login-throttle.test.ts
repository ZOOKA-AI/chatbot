import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

import { loginAttemptAllowed, loginSucceeded } from "@/lib/auth/throttle";

describe("password sign-in throttle", () => {
  it("stops the 11th attempt on one address and recovers after a success", () => {
    const email = `probe-${Date.now()}@example.test`;
    for (let i = 0; i < 10; i++) expect(loginAttemptAllowed(email, `10.0.0.${i}`)).toBe(true);
    expect(loginAttemptAllowed(email, "10.0.1.1")).toBe(false);
    expect(loginAttemptAllowed(email.toUpperCase(), "10.0.1.2")).toBe(false);
    loginSucceeded(email);
    expect(loginAttemptAllowed(email, "10.0.1.3")).toBe(true);
  });

  it("caps one source IP across many addresses", () => {
    const ip = `198.51.100.${Date.now() % 250}`;
    for (let i = 0; i < 50; i++) expect(loginAttemptAllowed(`a${i}-${Date.now()}@x.test`, ip)).toBe(true);
    expect(loginAttemptAllowed(`late-${Date.now()}@x.test`, ip)).toBe(false);
  });

  it("is wired into the credentials provider before the user lookup", () => {
    const source = readFileSync("app/(auth)/auth.ts", "utf8");
    const authorize = source.slice(source.indexOf("Credentials({"));
    expect(authorize.indexOf("loginAttemptAllowed(")).toBeGreaterThan(-1);
    expect(authorize.indexOf("loginAttemptAllowed(")).toBeLessThan(authorize.indexOf("getUser(email)"));
  });
});
