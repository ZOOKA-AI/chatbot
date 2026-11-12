import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { touchMcpKey, verifyMcpKey } from "@/lib/db/mcp-keys";
import { buildZookaMcpServer } from "@/lib/mcp/server";

/**
 * نقطة MCP العامة. المصادقة بمفتاح المساحة (Bearer) لا بجلسة المتصفح،
 * لأن عميل MCP ليس متصفحاً. بلا مفتاح صحيح لا يُنفَّذ أي أداة.
 */

function jsonError(status: number, error: string, extra?: HeadersInit) {
  return new Response(JSON.stringify({ error }), {
    headers: { "Content-Type": "application/json", ...extra },
    status,
  });
}

export async function POST(request: Request) {
  const header = request.headers.get("authorization") ?? "";
  const token = header.toLowerCase().startsWith("bearer ")
    ? header.slice(7).trim()
    : "";

  if (!token) {
    return jsonError(401, "missing_bearer_token", {
      "WWW-Authenticate": 'Bearer realm="Zooka AI MCP"',
    });
  }

  const key = await verifyMcpKey(token);
  if (!key) {
    return jsonError(401, "invalid_api_key", {
      "WWW-Authenticate": 'Bearer realm="Zooka AI MCP", error="invalid_token"',
    });
  }

  void touchMcpKey(key.keyId);

  const transport = new WebStandardStreamableHTTPServerTransport({
    enableJsonResponse: true,
    sessionIdGenerator: undefined,
  });
  const server = buildZookaMcpServer({
    organizationId: key.organizationId,
    userId: key.userId,
  });

  await server.connect(transport);
  return transport.handleRequest(request);
}

export function GET() {
  return jsonError(405, "method_not_allowed", { Allow: "POST" });
}

export function DELETE() {
  return jsonError(405, "method_not_allowed", { Allow: "POST" });
}
