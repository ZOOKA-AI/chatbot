import { NextResponse } from "next/server";
import { z } from "zod";
import { getWorkspaceContext } from "@/lib/auth/workspace";
import {
  appendAgentMessage,
  getAgentHistory,
  getWorkspaceBilling,
} from "@/lib/db/queries";
import { readHub } from "@/lib/integration-hub/server";
import {
  commandIds,
  readCommands,
  reportPriorities,
} from "@/lib/operations/catalog";

const reply = (data: unknown, status = 200) =>
  NextResponse.json(data, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
async function authorized() {
  const context = await getWorkspaceContext();
  return context?.user.type === "regular" &&
    ["owner", "admin"].includes(context.role)
    ? context
    : null;
}
const lane = (userId: string) => `operations:${userId}`;
export async function GET() {
  try {
    const context = await authorized();
    if (!context) {
      return reply({ error: "WORKSPACE_ADMIN_REQUIRED" }, 403);
    }
    return reply({
      history: await getAgentHistory(
        context.organizationId,
        lane(context.user.id),
        10
      ),
      scope: "current-user-current-workspace",
    });
  } catch {
    return reply({ error: "OPERATION_HISTORY_UNAVAILABLE" }, 503);
  }
}
export async function POST(request: Request) {
  try {
    const context = await authorized();
    if (!context) {
      return reply({ error: "WORKSPACE_ADMIN_REQUIRED" }, 403);
    }
    if (request.headers.get("origin") !== new URL(request.url).origin) {
      return reply({ error: "INVALID_ORIGIN" }, 403);
    }
    const parsed = z
      .object({ command: z.enum(commandIds) })
      .strict()
      .safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return reply({ error: "INVALID_COMMAND" }, 400);
    }
    if (!readCommands.has(parsed.data.command)) {
      return reply({ error: "COMMAND_NOT_IMPLEMENTED", executed: false }, 422);
    }
    const command = parsed.data.command;
    const generatedAt = new Date().toISOString();
    const needBilling = command !== "/integrations";
    const needHub = command !== "/cost";
    const [billingResult, hubResult] = await Promise.allSettled([
      needBilling
        ? getWorkspaceBilling(context.organizationId)
        : Promise.resolve(null),
      needHub ? readHub(context.organizationId) : Promise.resolve(null),
    ]);
    const billing =
      billingResult.status === "fulfilled" ? billingResult.value : null;
    const providers = hubResult.status === "fulfilled" ? hubResult.value : null;
    // Discard account identities and granted scopes from stored operational reports.
    const checks =
      providers?.map((p) => ({
        provider: p.id,
        state: p.state,
        checkedAt: p.checkedAt,
        code: p.code,
      })) ?? null;
    const failedChecks =
      checks?.filter((p) => p.state === "ERROR" || p.state === "EXPIRED")
        .length ?? 0;
    const report = {
      version: 1,
      command,
      generatedAt,
      scope: "current-workspace",
      status:
        (needBilling && !billing) || (needHub && !checks)
          ? "PARTIAL"
          : "READ_COMPLETE",
      whatWasDone: [
        "Read authorized workspace evidence only.",
        "No inference, provider probe, shell, deployment or payment was executed.",
      ],
      whatIsWorking: {
        billingRead: needBilling ? Boolean(billing) : null,
        integrationMetadataRead: needHub ? Boolean(checks) : null,
      },
      whatIsBroken: [
        ...(needBilling && !billing ? ["BILLING_READ_UNAVAILABLE"] : []),
        ...(needHub && !checks ? ["INTEGRATION_METADATA_UNAVAILABLE"] : []),
        ...(failedChecks ? ["FAILED_OR_EXPIRED_PROVIDER_EVIDENCE"] : []),
      ],
      billing: billing
        ? {
            plan: billing.subscription?.plan ?? "free",
            subscriptionStatus: billing.subscription?.status ?? null,
            usage: billing.usage,
            providerCost: null,
          }
        : null,
      integrations: checks,
      needsApproval: [
        "Production deployment/migrations/rollback",
        "New external-account permissions",
        "Paid generation or outbound publishing",
      ],
      nextPriorities: reportPriorities({
        billingAvailable: !needBilling || Boolean(billing),
        integrationsAvailable: !needHub || Boolean(checks),
        failedChecks,
      }),
      dailySchedule: {
        enabled: false,
        note: "On-demand report only; no daily scheduler is configured.",
      },
      infrastructure: {
        build: null,
        deployment: null,
        runtimeErrors: null,
        databaseHealth: "Not a connectivity or integrity certification",
        tests: null,
      },
      cost: {
        newProviderRequests: 0,
        actualProviderCost: null,
        note: "No model/provider calls in this command. Database/hosting operations may incur cost.",
      },
    };
    let recorded = false;
    try {
      await appendAgentMessage({
        organizationId: context.organizationId,
        userId: context.user.id,
        conversationKey: lane(context.user.id),
        role: "assistant",
        content: JSON.stringify(report),
      });
      recorded = true;
    } catch {
      /* Never claim an unpersisted report was recorded. */
    }
    return reply({
      report,
      recorded,
      warning: recorded ? null : "REPORT_NOT_PERSISTED",
    });
  } catch {
    return reply({ error: "OPERATION_UNAVAILABLE", executed: false }, 503);
  }
}
