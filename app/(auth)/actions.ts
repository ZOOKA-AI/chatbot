"use server";

import { cookies } from "next/headers";
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

const authFormSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

export type LoginActionState = {
  status: "idle" | "in_progress" | "success" | "failed" | "invalid_data";
};

export const login = async (
  _: LoginActionState,
  formData: FormData
): Promise<LoginActionState> => {
  try {
    const validatedData = authFormSchema.parse({
      email: formData.get("email"),
      password: formData.get("password"),
    });

    await signIn("credentials", {
      email: validatedData.email,
      password: validatedData.password,
      redirect: false,
    });

    return { status: "success" };
  } catch (error) {
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
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!z.string().email().safeParse(email).success) {
    return { status: "invalid" };
  }
  try {
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
