import "server-only";

import { and, eq, gte, sql } from "drizzle-orm";
import { db } from "@/lib/db/queries";
import { base44AgentSession, usageEvent } from "@/lib/db/schema";
import { createBase44Conversation } from "./agent";

/** Usage events that the metered Base44 agent writes. */
export const BASE44_TURN_EVENT = "base44_turn";
/** Credits are stored as hundredths so the counter stays an integer. */
export const BASE44_CREDIT_EVENT = "base44_credit";

export type Base44Metering = {
  conversationId: string;
  turns: number;
  credits: number;
};

export async function getBase44Session(
  userId: string
): Promise<Base44Metering | null> {
  const [row] = await db
    .select()
    .from(base44AgentSession)
    .where(eq(base44AgentSession.userId, userId))
    .limit(1);

  if (!row) {
    return null;
  }

  return {
    conversationId: row.conversationId,
    turns: row.turns,
    credits: row.credits,
  };
}

/**
 * Returns the member's conversation, opening one on Base44 the first time so
 * every user keeps their own thread and their own consumption.
 */
export async function ensureBase44Session({
  userId,
  organizationId,
}: {
  userId: string;
  organizationId: string;
}): Promise<Base44Metering> {
  const existing = await getBase44Session(userId);
  if (existing) {
    return existing;
  }

  const conversationId = await createBase44Conversation();
  const [row] = await db
    .insert(base44AgentSession)
    .values({ userId, organizationId, conversationId })
    .onConflictDoUpdate({
      target: base44AgentSession.userId,
      set: { organizationId, updatedAt: new Date() },
    })
    .returning();

  return {
    conversationId: row?.conversationId ?? conversationId,
    turns: row?.turns ?? 0,
    credits: row?.credits ?? 0,
  };
}

/** Records one answered turn and the credits Base44 charged for it. */
export async function recordBase44Turn({
  userId,
  organizationId,
  creditsCharged,
}: {
  userId: string;
  organizationId: string;
  creditsCharged: number;
}) {
  const creditHundredths = Math.max(0, Math.round(creditsCharged * 100));

  await db
    .insert(base44AgentSession)
    .values({
      userId,
      organizationId,
      conversationId: "pending",
      turns: 1,
      credits: creditHundredths,
    })
    .onConflictDoUpdate({
      target: base44AgentSession.userId,
      set: {
        turns: sql`${base44AgentSession.turns} + 1`,
        credits: sql`${base44AgentSession.credits} + ${creditHundredths}`,
        updatedAt: new Date(),
      },
    });

  await db.insert(usageEvent).values([
    { organizationId, userId, event: BASE44_TURN_EVENT, quantity: 1 },
    {
      organizationId,
      userId,
      event: BASE44_CREDIT_EVENT,
      quantity: creditHundredths,
    },
  ]);
}

/** Month-to-date credit consumption for one member, in credits (not cents). */
export async function getBase44UsageThisMonth(userId: string) {
  const monthStart = new Date(
    Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1)
  );
  const [row] = await db
    .select({
      turns: sql<number>`coalesce(sum(case when ${usageEvent.event} = ${BASE44_TURN_EVENT} then ${usageEvent.quantity} else 0 end), 0)`,
      creditHundredths: sql<number>`coalesce(sum(case when ${usageEvent.event} = ${BASE44_CREDIT_EVENT} then ${usageEvent.quantity} else 0 end), 0)`,
    })
    .from(usageEvent)
    .where(
      and(
        eq(usageEvent.userId, userId),
        gte(usageEvent.createdAt, monthStart)
      )
    );

  return {
    turns: Number(row?.turns ?? 0),
    credits: Number(row?.creditHundredths ?? 0) / 100,
  };
}
