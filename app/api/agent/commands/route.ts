import { getWorkspaceContext } from "@/lib/auth/workspace";
import { commandCatalogue, runCommand } from "@/lib/agent/commands";
import { ChatbotError } from "@/lib/errors";

/**
 * Command endpoint for the workspace agent.
 *
 * One sentence in, one action out, always scoped to the caller's workspace.
 * Read this together with lib/agent/commands.ts: the catalogue is the
 * contract, and every handler enforces its own minimum role.
 */
export const maxDuration = 60;

export async function GET() {
  const context = await getWorkspaceContext();
  if (!context) {
    return new ChatbotError("forbidden:api").toResponse();
  }

  return Response.json(
    {
      role: context.role,
      commands: commandCatalogue(),
      configured: {
        googleIntegrations: Boolean(
          process.env.GOOGLE_OAUTH_CLIENT_ID ?? process.env.GOOGLE_DRIVE_CLIENT_ID
        ),
        imageGeneration: Boolean(process.env.AI_GATEWAY_API_KEY),
        blobStorage: Boolean(process.env.BLOB_READ_WRITE_TOKEN),
      },
    },
    { headers: { "cache-control": "no-store" } }
  );
}

export async function POST(request: Request) {
  const context = await getWorkspaceContext();
  if (!context) {
    return new ChatbotError("forbidden:api").toResponse();
  }

  let payload: { command?: unknown };
  try {
    payload = (await request.json()) as { command?: unknown };
  } catch {
    return new ChatbotError("bad_request:api").toResponse();
  }

  const command = typeof payload.command === "string" ? payload.command.trim() : "";
  if (!command || command.length > 2000) {
    return new ChatbotError("bad_request:api").toResponse();
  }

  const result = await runCommand({
    organizationId: context.organizationId,
    userId: context.user.id,
    role: context.role,
    text: command,
  });

  const status = result.ok
    ? 200
    : result.error === "forbidden_role"
      ? 403
      : result.error === "command_not_recognized" ||
          result.error === "missing_parameters" ||
          result.error === "invalid_parameters"
        ? 400
        : 502;

  return Response.json(result, {
    status,
    headers: { "cache-control": "no-store" },
  });
}
