import { NextResponse } from "next/server";
import { z } from "zod";
import { getWorkspaceContext } from "@/lib/auth/workspace";

const requestSchema = z
  .object({
    actionType: z.enum(["IMAGE", "VIDEO", "MAP_3D", "CARTOON"]),
    prompt: z.string().trim().min(1).max(2000),
  })
  .strict();

export function POST(request: Request) {
  return handle(request);
}

async function handle(request: Request) {
  const context = await getWorkspaceContext();
  if (!context) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  // No generation provider is wired yet. Return an explicit unavailable state
  // instead of a fabricated asset URL, and never record usage or charge quota.
  return NextResponse.json(
    {
      error:
        "Media generation provider is not configured. No asset was generated.",
      configured: false,
    },
    { status: 503 }
  );
}
