import { beforeEach, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  createPasswordResetToken: vi.fn(),
  sendPasswordResetEmail: vi.fn(),
  consumePasswordResetToken: vi.fn(),
  deferred: [] as Array<() => unknown>,
}));

vi.mock("server-only", () => ({}));
vi.mock("@/app/(auth)/auth", () => ({ signIn: vi.fn() }));
vi.mock("next/headers", () => ({
  cookies: vi.fn(),
  headers: async () => new Headers({ "x-forwarded-for": "198.51.100.9" }),
}));
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: (task: () => unknown) => {
    mocks.deferred.push(task);
  },
}));
vi.mock("@/lib/affiliate", () => ({ REFERRAL_COOKIE: "referral", recordReferralEvent: vi.fn() }));
vi.mock("@/lib/db/queries", () => ({
  getUser: mocks.getUser,
  createUser: vi.fn(),
  consumePasswordResetToken: mocks.consumePasswordResetToken,
  createPasswordResetToken: mocks.createPasswordResetToken,
}));
vi.mock("@/lib/email/send", () => ({
  sendWelcomeEmail: vi.fn(),
  sendPasswordResetEmail: mocks.sendPasswordResetEmail,
  sendVerificationEmail: vi.fn(),
  sendExistingAccountNotice: vi.fn(),
}));

import { requestPasswordReset, resetPassword } from "@/app/(auth)/actions";

function form(email: string) {
  const data = new FormData();
  data.set("email", email);
  return data;
}

async function flush() {
  for (const task of mocks.deferred.splice(0)) await task();
}

beforeEach(() => {
  mocks.getUser.mockReset();
  mocks.createPasswordResetToken.mockReset();
  mocks.sendPasswordResetEmail.mockReset();
  mocks.deferred.length = 0;
});

test("reset request answers before any account lookup, so timing cannot reveal the address", async () => {
  mocks.getUser.mockResolvedValue([{ id: "u1" }]);
  const state = await requestPasswordReset({ status: "idle" }, form("known@example.test"));
  expect(state).toEqual({ status: "sent" });
  // Nothing account-dependent ran on the response path.
  expect(mocks.getUser).not.toHaveBeenCalled();
  expect(mocks.createPasswordResetToken).not.toHaveBeenCalled();
  await flush();
  expect(mocks.getUser).toHaveBeenCalledWith("known@example.test");
  expect(mocks.createPasswordResetToken).toHaveBeenCalledTimes(1);
  // Only the hash is stored; the raw token goes to mail only.
  const [, storedHash] = mocks.createPasswordResetToken.mock.calls[0];
  const [, mailedToken] = mocks.sendPasswordResetEmail.mock.calls[0];
  expect(storedHash).toMatch(/^[0-9a-f]{64}$/);
  expect(storedHash).not.toBe(mailedToken);
});

test("unknown and known addresses get the identical answer", async () => {
  mocks.getUser.mockResolvedValueOnce([]);
  const unknown = await requestPasswordReset({ status: "idle" }, form("nobody@example.test"));
  await flush();
  expect(unknown).toEqual({ status: "sent" });
  expect(mocks.createPasswordResetToken).not.toHaveBeenCalled();
  expect(mocks.sendPasswordResetEmail).not.toHaveBeenCalled();
});

test("a failing mail relay never changes the answer", async () => {
  mocks.getUser.mockResolvedValue([{ id: "u2" }]);
  mocks.sendPasswordResetEmail.mockRejectedValue(new Error("relay down"));
  const state = await requestPasswordReset({ status: "idle" }, form("relay@example.test"));
  await expect(flush()).resolves.toBeUndefined();
  expect(state).toEqual({ status: "sent" });
});

test("a database outage during reset answers 'unavailable' instead of crashing the page", async () => {
  mocks.consumePasswordResetToken.mockRejectedValueOnce(new Error("connect ECONNREFUSED"));
  const data = new FormData();
  data.set("token", "a".repeat(64));
  data.set("password", "new-password-123");
  expect(await resetPassword({ status: "idle" }, data)).toEqual({ status: "unavailable" });
});

test("an unknown, expired or already-used token is refused", async () => {
  mocks.consumePasswordResetToken.mockResolvedValueOnce(false);
  const data = new FormData();
  data.set("token", "b".repeat(64));
  data.set("password", "new-password-123");
  expect(await resetPassword({ status: "idle" }, data)).toEqual({ status: "invalid_token" });
});
