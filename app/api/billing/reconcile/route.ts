import { NextResponse } from "next/server";
import { getWorkspaceContext } from "@/lib/auth/workspace";

// Reconciliation must not enumerate account-wide invoices or reset balances.
// Keep writes disabled until invoice-period validation and workspace-scoped
// authorization/fulfillment are implemented and tested together.
export function GET() {
  return NextResponse.json(
    { error: "Method not allowed" },
    { status: 405, headers: { Allow: "POST", "Cache-Control": "no-store" } }
  );
}

export async function POST() {
  try {
    const context = await getWorkspaceContext();
    if (!context || context.user.type === "guest") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (context.role !== "owner" && context.role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.json(
      {
        error:
          "Reconciliation is disabled pending billing safety review. No balances were changed.",
      },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  } catch {
    return NextResponse.json(
      { error: "Unable to authorize reconciliation" },
      { status: 500 }
    );
  }
}
