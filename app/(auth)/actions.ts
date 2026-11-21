"use server";

import { cookies } from "next/headers";
import { z } from "zod";

import { REFERRAL_COOKIE, recordReferralEvent } from "@/lib/affiliate";
import type { Attribution } from "@/lib/growth/attribution";
import { ATTRIBUTION_COOKIE, deserializeAttribution } from "@/lib/growth/attribution";
import {
  consumePasswordResetToken,
  createPasswordResetToken,
  createUser,
  getUser,
} from "@/lib/db/queries";
import { sendPasswordResetEmail, sendWelcomeEmail } from "@/lib/email/send";
import { createHash, randomBytes } from "node:crypto";

import { headers } from "next/headers";
import { after } from "next/server";

import {
  NEUTRAL_SIGNUP_STATUS,
  isTokenShape,
  normalizeEmail,
  planRegistration,
} from "@/lib/auth/registration";
import { issueVerificationToken } from "@/lib/auth/verification";
import { ipThrottle, resetThrottle, signupThrottle } from "@/lib/auth/throttle";
import { generateHashedPassword } from "@/lib/db/utils";
import { sendExistingAccountNotice, sendVerificationEmail } from "@/lib/email/send";

import { signIn } from "./auth";
import { isDatabaseUnavailable } from "@/lib/db/diagnostics";
import { award, getOrCreateReferralCode, resolveReferralCode } from "@/lib/growth/referrals";

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
    | "unavailable";
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
  status: "idle" | "in_progress" | "check_email" | "unavailable" | "invalid_data";
};

/** Verification mail is sent only when the flow has been switched on. */
function verificationEnabled() {
  return process.env.AUTH_EMAIL_VERIFICATION === "on";
}

function clientIp(forwarded: string | null) {
  const first = (forwarded ?? "").split(",")[0]?.trim();
  return first && first.length > 0 ? first : "unknown";
}

/**
 * Registration answers with one neutral status, in both branches.
 *
 * A new address and an already-registered one produce the same state, the same
 * wording, and comparable work: the registered branch runs a bcrypt hash it
 * throws away, because returning in microseconds while the other branch spends
 * ~100ms hashing is an oracle even when the text matches. The account is not
 * signed in here; that is what makes "is this address taken?" unanswerable.
 */
export const register = async (
  _: RegisterActionState,
  formData: FormData
): Promise<RegisterActionState> => {
  const email = normalizeEmail(formData.get("email"));
  const password = String(formData.get("password") ?? "");

  if (!email || password.length < 6) {
    return { status: "invalid_data" };
  }

  // Abuse protection. A throttled attempt stays neutral on purpose: refusing
  // loudly would leak that the address is being probed.
  const ip = clientIp((await headers()).get("x-forwarded-for"));
  if (!ipThrottle.check(`signup:${ip}`).allowed) {
    return { status: NEUTRAL_SIGNUP_STATUS };
  }
  if (!signupThrottle.check(`signup:${email}`).allowed) {
    return { status: NEUTRAL_SIGNUP_STATUS };
  }

  // First-touch channel, captured by the proxy on the visitor's first landing.
  // Read before the insert because the account row is written in one shot. It stays
  // optional in the strongest sense: a cookie store that is unavailable (no request
  // scope) or a value that cannot be parsed records no channel, and never stops the
  // sign-up. Without this the promise in this comment was not kept, and a throwing
  // cookie store took the whole registration down with it.
  let attribution: Attribution | null = null;
  try {
    attribution = deserializeAttribution(
      (await cookies()).get(ATTRIBUTION_COOKIE)?.value
    );
  } catch {
    attribution = null;
  }

  try {
    const [existingUser] = await getUser(email);
    let plan = planRegistration({ existing: Boolean(existingUser) });

    if (plan.equalizeWork) {
      // Same cost as creating an account, discarded.
      generateHashedPassword(password);
    }

    let createdUserId: string | null = null;

    if (plan.createAccount) {
      try {
        await createUser(email, password, attribution);
        const [created] = await getUser(email);
        createdUserId = created?.id ?? null;
        if (!createdUserId) {
          return { status: "unavailable" };
        }
      } catch (error) {
        if (isDatabaseUnavailable(error)) {
          return { status: "unavailable" };
        }
        // A unique violation means the address was registered between the read
        // and the insert: the race collapses into the neutral existing branch.
        const message = error instanceof Error ? error.message : String(error);
        if (/duplicate key|unique constraint|User_email/i.test(message)) {
          plan = planRegistration({ existing: true, createFailedOnConflict: true });
          generateHashedPassword(password);
        } else {
          console.error("registration failed", message.slice(0, 200));
          return { status: "unavailable" };
        }
      }
    }

    if (createdUserId) {
      // Launch testing program: first successful registrations claim a free
      // slot. Best effort on purpose — a claim must never fail a sign-up, and a
      // failed registration never reaches this point so it cannot burn a slot.
      try {
        const { claimLaunchSlot } = await import("@/lib/billing/launch-program");
        await claimLaunchSlot(createdUserId);
      } catch (error) {
        console.error("launch slot claim skipped", (error as Error)?.message);
      }
      if (verificationEnabled()) {
        try {
          const { token } = await issueVerificationToken(createdUserId);
          await sendVerificationEmail(email, token, "ar");
        } catch (error) {
          // A mail or table outage must not fail the sign-up itself, and must
          // not change the answer.
          console.error("verification mail skipped", (error as Error)?.message);
        }
      }
      try {
        const cookieStore = await cookies();
        const refCode = cookieStore.get(REFERRAL_COOKIE)?.value ?? null;
        if (refCode) {
          await recordReferralEvent({ code: refCode, event: "signup", userId: createdUserId });
        }
        // Referral rewards: welcome points for the new account (released on
        // verification) and the referrer's reward, also pending until then.
        // Rewards never fail a sign-up.
        await getOrCreateReferralCode(createdUserId);
        await award({
          userId: createdUserId,
          kind: "welcome_registration",
          points: 20,
          idempotencyKey: `welcome:${createdUserId}`,
        });
        if (refCode) {
          const referrerId = await resolveReferralCode(refCode);
          if (referrerId && referrerId !== createdUserId) {
            await award({
              userId: referrerId,
              kind: "referrer_verified_signup",
              points: 50,
              idempotencyKey: `referrer_signup:${createdUserId}`,
              referredUserId: createdUserId,
            });
          }
        }
      } catch (error) {
        console.error("Referral reward skipped", (error as Error)?.message);
      }
    } else if (verificationEnabled()) {
      // Tell the real owner their address was used, never the caller.
      // after(), not a bare void promise: on serverless the function can be
      // frozen as soon as the response is sent, dropping the notice.
      after(async () => {
        try {
          await sendExistingAccountNotice(email, "ar");
        } catch (error) {
          console.error("existing-account notice skipped", (error as Error)?.message);
        }
      });
    }

    return { status: NEUTRAL_SIGNUP_STATUS };
  } catch (error) {
    if (isDatabaseUnavailable(error)) {
      return { status: "unavailable" };
    }
    if (error instanceof z.ZodError) {
      return { status: "invalid_data" };
    }
    console.error("registration error", (error as Error)?.message);
    return { status: "unavailable" };
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
    const ip = clientIp((await headers()).get("x-forwarded-for"));
    if (
      !ipThrottle.check(`reset:${ip}`).allowed ||
      !resetThrottle.check(`reset:${email}`).allowed
    ) {
      // Neutral: a throttle refusal must not confirm the address either.
      return { status: "sent" };
    }
    // The lookup, token insert and mail send run after the response is sent.
    // Awaiting them here made a registered address answer measurably slower
    // than an unknown one (DB write + mail relay round trip), which is an
    // enumeration oracle even though the text is identical.
    after(async () => {
      try {
        const [existing] = await getUser(email);
        if (!existing) {
          return;
        }
        const token = randomBytes(32).toString("hex");
        const tokenHash = createHash("sha256").update(token).digest("hex");
        await createPasswordResetToken(existing.id, tokenHash);
        await sendPasswordResetEmail(email, token, "ar");
      } catch (error) {
        console.error("password reset delivery failed", (error as Error)?.message);
      }
    });
  } catch (error) {
    console.error("password reset request failed", error);
  }
  // Same answer whether or not the account exists (no user enumeration).
  return { status: "sent" };
};

export type ResetPasswordState = {
  status: "idle" | "success" | "invalid_token" | "invalid_data" | "unavailable";
};

export const resetPassword = async (
  _: ResetPasswordState,
  formData: FormData
): Promise<ResetPasswordState> => {
  const token = String(formData.get("token") ?? "");
  const password = String(formData.get("password") ?? "");
  if (!isTokenShape(token) || password.length < 6) {
    return { status: "invalid_data" };
  }
  const tokenHash = createHash("sha256").update(token).digest("hex");
  try {
    const ok = await consumePasswordResetToken(tokenHash, password);
    return { status: ok ? "success" : "invalid_token" };
  } catch (error) {
    // A database outage must not crash the page: the link stays unused and the
    // person can retry once service is back.
    console.error("password reset failed", (error as Error)?.message);
    return { status: "unavailable" };
  }
};
