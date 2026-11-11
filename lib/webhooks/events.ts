import { captureException } from "@sentry/nextjs";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/queries";
import { webhookEvent } from "@/lib/db/schema";

/**
 * Records a webhook delivery exactly once. Returns true when this delivery is the
 * first one (process it), false when it is a duplicate (acknowledge and skip).
 * Fails open: a storage problem must never block billing or messaging.
 */
export async function claimWebhookEvent(input: {
  provider: string;
  externalId: string;
  payload?: unknown;
}): Promise<boolean> {
  try {
    const inserted = await db
      .insert(webhookEvent)
      .values({
        provider: input.provider,
        externalId: input.externalId,
        payload: (input.payload ?? null) as never,
      })
      .onConflictDoNothing({
        target: [webhookEvent.provider, webhookEvent.externalId],
      })
      .returning({ id: webhookEvent.id });
    return inserted.length > 0;
  } catch (error) {
    captureException(error, { tags: { area: "webhook-idempotency" } });
    return true;
  }
}

/** Frees a claim so the provider retry can be processed again. */
export async function releaseWebhookEvent(input: {
  provider: string;
  externalId: string;
}): Promise<void> {
  try {
    await db
      .delete(webhookEvent)
      .where(
        and(
          eq(webhookEvent.provider, input.provider),
          eq(webhookEvent.externalId, input.externalId)
        )
      );
  } catch (error) {
    captureException(error, { tags: { area: "webhook-idempotency" } });
  }
}
