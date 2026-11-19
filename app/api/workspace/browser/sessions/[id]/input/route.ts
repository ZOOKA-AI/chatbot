import { z } from "zod";

import { callerOrganizationId, json, resolveCaller, unauthorized } from "@/lib/agents/auth";
import { withCommanderTenant } from "@/lib/agents/commander-scope";
import { applyInput, BrowserControlError, type Caller } from "@/lib/browser/sessions";

/**
 * A person touching the live page.
 *
 * The route carries the caller's identity and nothing else that matters: whether this person may
 * drive this session, and whether they currently hold control, is decided against the stored row. If
 * the agent holds control the request is refused, because two actors driving one page is how a
 * customer loses track of what their agent did.
 */

const InputSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("click"), x: z.number().min(0).max(4000), y: z.number().min(0).max(4000) }),
  z.object({ kind: z.literal("type"), text: z.string().max(500), submit: z.boolean().optional() }),
  z.object({ kind: z.literal("scroll"), deltaY: z.number().min(-4000).max(4000) }),
  z.object({ kind: z.literal("navigate"), url: z.string().url().max(2048) }),
]);

async function POSTHandler(request: Request, context: { params: Promise<{ id: string }> }) {
  const caller = await resolveCaller(request);
  if (!caller || caller.kind !== "owner") return unauthorized();

  const parsed = InputSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return json({ error: "invalid_command" }, 400);

  const { id } = await context.params;
  const scoped: Caller = { userId: caller.userId, organizationId: callerOrganizationId(caller), role: caller.role };

  try {
    const result = await applyInput({
      caller: scoped,
      sessionId: id,
      command: parsed.data as Parameters<typeof applyInput>[0]["command"],
    });
    return json({ session: result.session, executed: result.executed });
  } catch (error) {
    if (error instanceof BrowserControlError) {
      const status =
        error.code === "session_not_found"
          ? 404
          : error.code === "not_session_owner"
            ? 403
            : error.code === "agent_has_control"
              ? 409
              : 409;
      return json({ error: error.code }, status);
    }
    return json({ error: "input_failed" }, 500);
  }
}

export const POST = withCommanderTenant(POSTHandler);
