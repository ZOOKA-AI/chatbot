// Setup check for Base44 white label, for the admin panel and for the setup
// run. Read-only: it reports what the workspace has and never changes it.
import { NextResponse } from "next/server";

import {
  WhiteLabelError,
  getWhiteLabelSettings,
  isWhiteLabelConfigured,
  listWorkspaceBrands,
  listWorkspaceSkills,
  resolveWorkspaceId,
} from "@/lib/base44/white-label";
import { requirePlatformRole } from "@/lib/auth/platform-role";

type Brand = { id?: string; title?: string | null; status?: string | null; is_default?: boolean };
type Skill = { name?: string; description?: string | null; enabled?: boolean };

function brandsOf(body: unknown): Brand[] {
  // The management API answers a list as { items, total }; older paths answered
  // a bare array or { data } / { brands }. Read every shape so the report shows
  // what the workspace really has instead of an empty list.
  const page = body as { data?: Brand[]; brands?: Brand[]; items?: Brand[] } | Brand[] | null;
  if (Array.isArray(page)) return page;
  return page?.items ?? page?.data ?? page?.brands ?? [];
}

function skillsOf(body: unknown): Skill[] {
  const page = body as { data?: Skill[]; skills?: Skill[]; items?: Skill[] } | Skill[] | null;
  if (Array.isArray(page)) return page;
  return page?.items ?? page?.data ?? page?.skills ?? [];
}

export async function GET() {
  const admin = await requirePlatformRole("admin", "api.white_label.status");
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

  const report: Record<string, unknown> = { tokenAccepted: false };

  try {
    report.workspaceId = await resolveWorkspaceId();
    report.tokenAccepted = true;
  } catch (error) {
    const status = error instanceof WhiteLabelError ? error.status : 500;
    return NextResponse.json(
      {
        error: status === 401 ? "token_rejected" : "workspace_unresolved",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status, headers: { "cache-control": "private, no-store" } }
    );
  }

  // Each read stands alone: a refused one must not hide the others.
  try {
    const { status, body } = await getWhiteLabelSettings();
    if (status === 200 && body) {
      report.whiteLabel = {
        enabled: body.enabled,
        brandName: body.brand_name,
        agentName: body.agent_name,
        hasAgentPrompt: Boolean(body.agent_prompt),
        useDefaultDesignSystem: body.use_default_design_system,
        controlsVisible: body.controls_visible,
        canEditBrand: body.can_edit_brand,
        canEditPrompt: body.can_edit_prompt,
        firstEnabledDate: body.first_enabled_date,
      };
    } else {
      report.whiteLabel = { error: status };
    }
  } catch (error) {
    report.whiteLabel = { error: error instanceof Error ? error.message : "failed" };
  }

  try {
    const { status, body } = await listWorkspaceBrands();
    report.brands =
      status === 200
        ? brandsOf(body).map((brand) => ({
            id: brand.id,
            title: brand.title ?? null,
            status: brand.status ?? null,
            isDefault: Boolean(brand.is_default),
          }))
        : { error: status };
  } catch (error) {
    report.brands = { error: error instanceof Error ? error.message : "failed" };
  }

  try {
    const { status, body } = await listWorkspaceSkills();
    report.skills =
      status === 200
        ? skillsOf(body).map((skill) => ({
            name: skill.name,
            enabled: Boolean(skill.enabled),
            description: skill.description ?? null,
          }))
        : { error: status };
  } catch (error) {
    report.skills = { error: error instanceof Error ? error.message : "failed" };
  }

  return NextResponse.json(report, { headers: { "cache-control": "private, no-store" } });
}
