// Adds the ZOOKA-AI platform skills to the workspace, once. Safe to call
// again: a skill that already exists is reported as skipped, not duplicated.
import { NextResponse } from "next/server";

import { ZOOKA_WHITE_LABEL_SKILLS } from "@/lib/base44/white-label-skills";
import { WhiteLabelError, createWorkspaceSkill, isWhiteLabelConfigured } from "@/lib/base44/white-label";
import { requirePlatformRole } from "@/lib/auth/platform-role";

export async function POST(request: Request) {
  const admin = await requirePlatformRole("admin", "api.white_label.skills");
  if (!admin) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  if (!isWhiteLabelConfigured()) {
    return NextResponse.json(
      {
        error: "not_configured",
        message: "Set WHITE_LABEL_TOKEN in the server environment, then call this again.",
      },
      { status: 503, headers: { "cache-control": "private, no-store" } }
    );
  }

  let wanted = ZOOKA_WHITE_LABEL_SKILLS;
  try {
    const payload = (await request.json()) as { skills?: string[] } | null;
    const names = payload?.skills;
    if (Array.isArray(names) && names.length > 0) {
      wanted = ZOOKA_WHITE_LABEL_SKILLS.filter((skill) => names.includes(skill.name));
    }
  } catch {
    // No body, or not JSON: add them all.
  }

  const results: Array<{ name: string; outcome: string; status: number }> = [];

  for (const skill of wanted) {
    try {
      const { status } = await createWorkspaceSkill(skill);
      const outcome =
        status === 200 || status === 201
          ? "created"
          : status === 409
            ? "already_exists"
            : status === 403
              ? "refused_by_plan_or_role"
              : "failed";
      results.push({ name: skill.name, outcome, status });
    } catch (error) {
      const status = error instanceof WhiteLabelError ? error.status : 500;
      results.push({
        name: skill.name,
        outcome: status === 401 ? "token_rejected" : "failed",
        status,
      });
    }
  }

  const created = results.filter((row) => row.outcome === "created").length;
  const existing = results.filter((row) => row.outcome === "already_exists").length;

  return NextResponse.json(
    { created, alreadyExisting: existing, results },
    { headers: { "cache-control": "private, no-store" } }
  );
}
