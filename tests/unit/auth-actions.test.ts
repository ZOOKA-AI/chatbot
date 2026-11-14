import { beforeEach, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  signIn: vi.fn(),
  getUser: vi.fn(),
  createUser: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/app/(auth)/auth", () => ({ signIn: mocks.signIn }));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("@/lib/affiliate", () => ({
  REFERRAL_COOKIE: "referral",
  recordReferralEvent: vi.fn(),
}));
vi.mock("@/lib/db/queries", () => ({
  getUser: mocks.getUser,
  createUser: mocks.createUser,
  consumePasswordResetToken: vi.fn(),
  createPasswordResetToken: vi.fn(),
}));
vi.mock("@/lib/email/send", () => ({
  sendWelcomeEmail: vi.fn(),
  sendPasswordResetEmail: vi.fn(),
}));

import { login, register } from "@/app/(auth)/actions";
import { DatabaseUnavailableError } from "@/lib/db/diagnostics";

function form(email = " User@Example.Test ") {
  const data = new FormData();
  data.set("email", email);
  data.set("password", "valid-password");
  return data;
}
beforeEach(() => vi.resetAllMocks());
test("login trims email and keeps password errors separate from database outages", async () => {
  mocks.signIn.mockResolvedValueOnce(undefined);
  expect(await login({ status: "idle" }, form())).toEqual({
    status: "success",
  });
  expect(mocks.signIn).toHaveBeenCalledWith("credentials", {
    email: "User@Example.Test",
    password: "valid-password",
    redirect: false,
  });
  mocks.signIn.mockRejectedValueOnce(new Error("CredentialsSignin"));
  expect(await login({ status: "idle" }, form())).toEqual({ status: "failed" });
  mocks.signIn.mockRejectedValueOnce({
    cause: { err: new DatabaseUnavailableError() },
  });
  expect(await login({ status: "idle" }, form())).toEqual({
    status: "unavailable",
  });
});
test("registration reports database unavailability without attempting login", async () => {
  mocks.getUser.mockRejectedValueOnce(new DatabaseUnavailableError());
  expect(await register({ status: "idle" }, form())).toEqual({
    status: "unavailable",
  });
  expect(mocks.signIn).not.toHaveBeenCalled();
});
test("oversized account emails fail validation before database access", async () => {
  expect(
    await login({ status: "idle" }, form(`${"a".repeat(65)}@example.test`))
  ).toEqual({ status: "invalid_data" });
  expect(mocks.signIn).not.toHaveBeenCalled();
});
