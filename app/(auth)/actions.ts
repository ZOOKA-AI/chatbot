"use server";

import { cookies, headers } from "next/headers";
import { z } from "zod";

import { REFERRAL_COOKIE, recordReferralEvent } from "@/lib/affiliate";
import {
  consumePasswordResetToken,
  createPasswordResetToken,
  createUser,
  getUser,
} from "@/lib/db/queries";
import { sendPasswordResetEmail, sendWelcomeEmail } from "@/lib/email/send";
import { createHash, randomBytes } from "node:crypto";

import { signIn } from "./auth";
import { isDatabaseUnavailable } from "@/lib/db/diagnostics";
import {
  allowAuthAction,
  clientAddress,
  readLoginLock,
} from "@/lib/auth/login-guard";
import { getThrottleStore } from "@/lib/auth/throttle";

const authFormSchema = z.object({
  email: z.string().trim().email().max(64),
  password: z.string().min(6),
});

export type LoginActionState = {
  status:
    | "idle"
    | "in_progress"
    | "success"
    | "failed"
    | "invalid_data"
    | "unavailable"
    | "rate_limited";
  /** Present with "rate_limited": seconds until the lock ends. */
  retryAfterSeconds?: number;
};

/**
 * A lock applies to unknown accounts exactly as to real ones, so telling the
 * caller "try again in N seconds" does not disclose whether the account exists.
 */
async function currentLoginLock(email: string) {
  try {
    const address = clientAddress(new Headers(await headers()));
    return await readLoginLock(getThrottleStore(), email, address);
  } catch {
    return { locked: false as const };
  }
}

export const login = async (
  _: LoginActionState,
  formData: FormData
): Promise<LoginActionState> => {
  try {
    const validatedData = authFormSchema.parse({
      email: formData.get("email"),
      password: formData.get("password"),
    });

    const lock = await currentLoginLock(validatedData.email);
    if (lock.locked) {
      return { status: "rate_limited", retryAfterSeconds: lock.retryAfterSeconds };
    }

    await signIn("credentials", {
      email: validatedData.email,
      password: validatedData.password,
      redirect: false,
    });

    return { status: "success" };
  } catch (error) {
    if (isDatabaseUnavailable(error)) {
      return { status: "unavailable" };
    }
    if (error instanceof z.ZodError) {
      return { status: "invalid_data" };
    }

    return { status: "failed" };
  }
};

export type RegisterActionState = {
  status:
    | "idle"
    | "in_progress"
    | "success"
    | "failed"
    | "unavailable"
    | "user_exists"
    | "invalid_data";
};

export const register = async (
  _: RegisterActionState,
  formData: FormData
): Promise<RegisterActionState> => {
  try {
    const validatedData = authFormSchema.parse({
      email: formData.get("email"),
      password: formData.get("password"),
    });

    const [user] = await getUser(validatedData.email);

    if (user) {
      return { status: "user_exists" } as RegisterActionState;
    }
    await createUser(validatedData.email, validatedData.password);
    // Fire and forget: a mail outage must never block signup.
    void sendWelcomeEmail(validatedData.email, "ar");

    try {
      const cookieStore = await cookies();
      const refCode = cookieStore.get(REFERRAL_COOKIE)?.value ?? null;
      if (refCode) {
        const [createdUser] = await getUser(validatedData.email);
        if (createdUser) {
          await recordReferralEvent({
            code: refCode,
            event: "signup",
            userId: createdUser.id,
          });
        }
      }
    } catch (error) {
      console.error("Failed to record referral signup", error);
    }

    await signIn("credentials", {
      email: validatedData.email,
      password: validatedData.password,
      redirect: false,
    });

    return { status: "success" };
  } catch (error) {
    if (isDatabaseUnavailable(error)) {
      return { status: "unavailable" };
    }
    if (error instanceof z.ZodError) {
      return { status: "invalid_data" };
    }

    return { status: "failed" };
  }
};

export type ForgotPasswordState = { status: "idle" | "sent" | "invalid" };

export const requestPasswordReset = async (
  _: ForgotPasswordState,
  formData: FormData
): Promise<ForgotPasswordState> => {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  if (!z.string().email().safeParse(email).success) {
    return { status: "invalid" };
  }
  try {
    // Three reset emails an hour per address book entry, ten per client. Over
    // the allowance the answer is the same "sent", so the limit discloses
    // nothing and nobody's inbox can be flooded through this form.
    const store = getThrottleStore();
    const hour = 60 * 60 * 1000;
    const address = clientAddress(new Headers(await headers()));
    const allowed =
      (await allowAuthAction(store, "reset-email", email, 3, hour)) &&
      (address === "unknown" ||
        (await allowAuthAction(store, "reset-address", address, 10, hour)));
    if (!allowed) {
      return { status: "sent" };
    }
    const [existing] = await getUser(email);
    if (existing) {
      const token = randomBytes(32).toString("hex");
      const tokenHash = createHash("sha256").update(token).digest("hex");
      await createPasswordResetToken(existing.id, tokenHash);
      await sendPasswordResetEmail(email, token, "ar");
    }
  } catch (error) {
    console.error("password reset request failed", error);
  }
  // Same answer whether or not the account exists (no user enumeration).
  return { status: "sent" };
};

export type ResetPasswordState = {
  status: "idle" | "success" | "invalid_token" | "invalid_data";
};

export const resetPassword = async (
  _: ResetPasswordState,
  formData: FormData
): Promise<ResetPasswordState> => {
  const token = String(formData.get("token") ?? "");
  const password = String(formData.get("password") ?? "");
  if (!/^[a-f0-9]{64}$/.test(token) || password.length < 6) {
    return { status: "invalid_data" };
  }
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const ok = await consumePasswordResetToken(tokenHash, password);
  return { status: ok ? "success" : "invalid_token" };
};
