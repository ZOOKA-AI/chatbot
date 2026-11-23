import "server-only";

/**
 * Server-side client for Base44 white label.
 *
 * The personal access token never leaves the server: routes call this module
 * and the browser only ever sees the answers. The workspace is never stored
 * either. A personal access token belongs to exactly one workspace, so the
 * first app it can list tells us which one we build in, and every call that
 * needs the workspace in its path asks for it here.
 */

const DEFAULT_API_BASE = "https://app.base44.com";
const USER_AGENT = "ZOOKA-AI-white-label/1.0";

/** Reads are quick; a build call runs for minutes. */
export const READ_TIMEOUT_MS = 20_000;
export const BUILD_TIMEOUT_MS = 180_000;

export type WhiteLabelResponse<T = unknown> = {
  status: number;
  body: T | null;
};

export type WhiteLabelSettings = {
  enabled: boolean;
  brand_name: string | null;
  agent_name: string | null;
  agent_prompt: string | null;
  use_default_design_system: boolean;
  first_enabled_date: string | null;
  controls_visible: boolean;
  can_edit_brand: boolean;
  can_edit_prompt: boolean;
};

export type WorkspaceSkill = {
  name: string;
  description: string | null;
  enabled: boolean;
  [key: string]: unknown;
};

export type NewWorkspaceSkill = {
  name: string;
  description: string;
  body: string;
};

export class WhiteLabelError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "WhiteLabelError";
    this.status = status;
  }
}

export function isWhiteLabelConfigured(): boolean {
  return Boolean(process.env.WHITE_LABEL_TOKEN);
}

function readToken(): string {
  const token = process.env.WHITE_LABEL_TOKEN;
  if (!token) {
    throw new WhiteLabelError(
      "White label is not configured: set WHITE_LABEL_TOKEN in the server environment.",
      503
    );
  }
  return token;
}

/**
 * Base44's host. A platform hosted on Base44 receives it in the
 * `Base44-Api-Url` header; on our own host we fall back to the public one.
 */
export function apiBase(request?: Request): string {
  const fromHeader = request?.headers.get("Base44-Api-Url")?.trim();
  if (fromHeader) return fromHeader.replace(/\/+$/, "");
  return (process.env.BASE44_API_BASE ?? DEFAULT_API_BASE).replace(/\/+$/, "");
}

async function send<T>(
  path: string,
  init: RequestInit & { timeoutMs?: number; workspaceId?: string | null } = {}
): Promise<WhiteLabelResponse<T>> {
  const { timeoutMs = READ_TIMEOUT_MS, workspaceId, ...rest } = init;
  const token = readToken();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${apiBase()}${path}`, {
      ...rest,
      signal: controller.signal,
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${token}`,
        "User-Agent": USER_AGENT,
        Accept: "application/json",
        ...(workspaceId ? { "X-Active-Workspace-Id": workspaceId } : {}),
        ...(rest.body ? { "Content-Type": "application/json" } : {}),
        ...(rest.headers ?? {}),
      },
    });

    const text = await response.text();
    let body: T | null = null;
    if (text) {
      try {
        body = JSON.parse(text) as T;
      } catch {
        body = null;
      }
    }
    return { status: response.status, body };
  } catch (error) {
    if (error instanceof WhiteLabelError) throw error;
    const aborted = error instanceof Error && error.name === "AbortError";
    throw new WhiteLabelError(
      aborted ? "Base44 did not answer in time." : "Base44 could not be reached.",
      504
    );
  } finally {
    clearTimeout(timer);
  }
}

let cachedWorkspaceId: string | null = null;

type AppsPage = {
  data?: Array<{ organization_id?: string | null }>;
  apps?: Array<{ organization_id?: string | null }>;
};

function firstOrganizationId(body: unknown): string | null {
  const page = body as AppsPage | Array<{ organization_id?: string | null }> | null;
  const rows = Array.isArray(page) ? page : (page?.data ?? page?.apps ?? []);
  for (const row of rows ?? []) {
    const id = row?.organization_id;
    if (typeof id === "string" && id.length > 0) return id;
  }
  return null;
}

/** The workspace the token belongs to, learned from its first app. */
export async function resolveWorkspaceId(force = false): Promise<string> {
  if (cachedWorkspaceId && !force) return cachedWorkspaceId;

  const { status, body } = await send<unknown>("/api/apps?limit=1");
  if (status === 401) {
    throw new WhiteLabelError("The white label token was rejected.", 401);
  }
  if (status === 403) {
    throw new WhiteLabelError("The token's account cannot list apps in this workspace.", 403);
  }
  const id = firstOrganizationId(body);
  if (!id) {
    throw new WhiteLabelError(
      "No app is reachable with this token, so its workspace is unknown.",
      409
    );
  }
  cachedWorkspaceId = id;
  return id;
}

export async function getWhiteLabelSettings(): Promise<WhiteLabelResponse<WhiteLabelSettings>> {
  const workspaceId = await resolveWorkspaceId();
  return send<WhiteLabelSettings>(`/api/workspace/${workspaceId}/white-label`, { workspaceId });
}

export async function listWorkspaceBrands(): Promise<WhiteLabelResponse<unknown>> {
  const workspaceId = await resolveWorkspaceId();
  return send(`/api/workspace/${workspaceId}/brands`, { workspaceId });
}

export async function setDefaultWorkspaceBrand(
  brandId: string
): Promise<WhiteLabelResponse<unknown>> {
  const workspaceId = await resolveWorkspaceId();
  return send(`/api/workspace/${workspaceId}/brands/${encodeURIComponent(brandId)}/default`, {
    method: "POST",
    workspaceId,
  });
}

export async function listWorkspaceSkills(): Promise<WhiteLabelResponse<unknown>> {
  const workspaceId = await resolveWorkspaceId();
  return send("/api/workspace/skills", { workspaceId });
}

export async function createWorkspaceSkill(
  skill: NewWorkspaceSkill
): Promise<WhiteLabelResponse<unknown>> {
  const workspaceId = await resolveWorkspaceId();
  return send("/api/workspace/skills", {
    method: "POST",
    body: JSON.stringify(skill),
    workspaceId,
  });
}
