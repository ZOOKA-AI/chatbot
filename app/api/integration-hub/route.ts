import { NextResponse } from "next/server";
import { z } from "zod";
import { getWorkspaceContext } from "@/lib/auth/workspace";
import { hubProviders } from "@/lib/integration-hub/catalog";
import { readHub, testHub } from "@/lib/integration-hub/server";

const reply = (data: unknown, status = 200) =>
  NextResponse.json(data, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
export async function GET() {
  try {
    const context = await getWorkspaceContext();
    if (!context || context.user.type !== "regular") {
      return reply({ error: "SIGN_IN_REQUIRED" }, 401);
    }
    return reply({
      providers: await readHub(context.organizationId),
      canManage: ["owner", "admin"].includes(context.role),
    });
  } catch {
    return reply({ error: "INTEGRATION_DATABASE_UNAVAILABLE" }, 503);
  }
}
export async function POST(request: Request) {
  try {
    const context = await getWorkspaceContext();
    if (!context || context.user.type !== "regular") {
      return reply({ error: "SIGN_IN_REQUIRED" }, 401);
    }
    if (!["owner", "admin"].includes(context.role)) {
      return reply({ error: "ADMIN_REQUIRED" }, 403);
    }
    if (request.headers.get("origin") !== new URL(request.url).origin) {
      return reply({ error: "INVALID_ORIGIN" }, 403);
    }
    const parsed = z
      .object({ provider: z.string().max(64) })
      .strict()
      .safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return reply({ error: "INVALID_INPUT" }, 400);
    }
    const provider = hubProviders.find(
      (item) => item.id === parsed.data.provider
    );
    if (!provider?.canTest) {
      return reply({ error: "TEST_NOT_IMPLEMENTED" }, 422);
    }
    const result = await testHub(context.organizationId, provider.id);
    return reply(result, result.code === "CHECK_RATE_LIMIT" ? 429 : 200);
  } catch {
    return reply({ error: "INTEGRATION_DATABASE_UNAVAILABLE" }, 503);
  }
}
