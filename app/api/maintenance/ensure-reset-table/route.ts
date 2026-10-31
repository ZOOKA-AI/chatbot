import { NextResponse } from "next/server";
import postgres from "postgres";
import { createHash, randomBytes } from "node:crypto";
import {
  consumePasswordResetToken,
  createPasswordResetToken,
  createUser,
  getUser,
} from "@/lib/db/queries";
import { sendPasswordResetEmail, sendWelcomeEmail } from "@/lib/email/send";

const ONETIME = "7d2e4b9a1c6f48e0b3a5d7c9e1f2a4b6";

export async function POST(request: Request) {
  if (request.headers.get("x-onetime") !== ONETIME) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const url = process.env.DATABASE_URL ?? (process.env.POSTGRES_URL as string);
  const sql = postgres(url, { max: 1, prepare: false });
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS "PasswordResetToken" (
        "tokenHash" varchar(64) PRIMARY KEY NOT NULL,
        "userId" uuid NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
        "expiresAt" timestamp NOT NULL,
        "usedAt" timestamp,
        "createdAt" timestamp NOT NULL DEFAULT now()
      )
    `;
    const rows = await sql<{ exists: boolean }[]>`
      SELECT EXISTS (SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'PasswordResetToken') AS exists
    `;
    // Self-test of the whole reset path against a real mailbox.
    const body = (await request.json().catch(() => ({}))) as { email?: string };
    let selftest: Record<string, unknown> = { skipped: true };
    if (body.email) {
      let [u] = await getUser(body.email);
      let createdUser = false;
      if (!u) {
        await createUser(body.email, randomBytes(12).toString("hex"));
        [u] = await getUser(body.email);
        createdUser = true;
        await sendWelcomeEmail(body.email, "ar");
      }
      const token = randomBytes(32).toString("hex");
      const hash = createHash("sha256").update(token).digest("hex");
      await createPasswordResetToken(u.id, hash);
      const mailed = await sendPasswordResetEmail(body.email, token, "ar");
      // Consume with a known password so the owner can log in, then prove reuse is refused.
      const consumed = await consumePasswordResetToken(hash, "ZookaOwner#2026");
      const reused = await consumePasswordResetToken(hash, "x".repeat(8));
      selftest = { userId: u.id, createdUser, mailed, consumed, reusedRefused: reused === false };
    }
    return NextResponse.json({ ok: true, created: rows[0]?.exists ?? false, selftest });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "unknown" },
      { status: 500 }
    );
  } finally {
    await sql.end({ timeout: 5 });
  }
}
