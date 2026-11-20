import { randomUUID } from "node:crypto";

import { z } from "zod";

import { getWorkspaceContext } from "@/lib/auth/workspace";
import { createAccessToken, readLiveConfig, roomNameFor } from "@/lib/live/token";

/**
 * Mint a room token for the signed-in member of this workspace.
 *
 * Three rules are load-bearing. The room is built from the session's workspace, never from the
 * request, so a member cannot ask for another tenant's room. The participant identity is unique
 * per connection, because the media server drops an existing participant when a second one joins
 * with the same identity - the same member on a phone and a laptop must not evict each other.
 * And when the media server is not configured the answer is 503 with `configured: false`,
 * because a client that receives a token-shaped object would draw a live session that does not
 * exist.
 */

export const maxDuration = 15;

const bodySchema = z
  .object({
    slug: z.string().trim().min(1).max(40),
  })
  .strict();

export async function POST(request: Request) {
  const context = await getWorkspaceContext();
  if (!context) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "invalid_request" }, { status: 400 });
  }

  const config = readLiveConfig();
  if (!config.configured) {
    return Response.json(
      { configured: false, reason: config.reason },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }

  let room: string;
  try {
    room = roomNameFor(context.organizationId, parsed.data.slug);
  } catch {
    return Response.json({ error: "invalid_room" }, { status: 400 });
  }

  const { token, expiresAt } = createAccessToken({
    apiKey: config.apiKey,
    apiSecret: config.apiSecret,
    room,
    // One connection, one identity: `${user}` alone would evict the same member's other device.
    identity: `${context.user.id}:${randomUUID().slice(0, 8)}`,
    name: context.user.name ?? context.user.email ?? undefined,
  });

  return Response.json(
    {
      configured: true,
      transport: "livekit",
      url: config.url,
      room,
      token,
      expiresAt,
    },
    { headers: { "cache-control": "no-store" } },
  );
}
