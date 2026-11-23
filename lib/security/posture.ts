import "server-only";

/**
 * Security posture — measured facts only.
 *
 * The rows describe the platform owner's own accounts and devices, so they
 * are not committed to this (public) repository. They are read at request
 * time from the server-only SECURITY_POSTURE_JSON environment variable, and
 * the page that renders them requires the platform admin grant.
 *
 * Every row was produced by a real check on the date in `measuredAt`. A row
 * that was not measured is marked "unmeasured" instead of guessed. When the
 * variable is unset or invalid, the page says nothing was measured.
 */

export type PostureState = "measured" | "needs_action" | "unmeasured";

export type PostureRow = {
  area: string;
  account: string;
  state: PostureState;
  detail: string;
  measuredAt: string;
};

export type ActionItem = {
  id: string;
  title: string;
  why: string;
  where: string;
};

export type PostureRelease = {
  version: string;
  versionCode: number;
  packageName: string;
  apkBytes: number;
  sha256: string;
  downloadUrl: string;
  capabilities: string[];
  limits: string[];
};

export type SecurityPosture = {
  measuredAt: string | null;
  rows: PostureRow[];
  actions: ActionItem[];
  release: PostureRelease | null;
  auditReportUrl: string | null;
};

export const POSTURE_ENV = "SECURITY_POSTURE_JSON";

const STATES = new Set<PostureState>(["measured", "needs_action", "unmeasured"]);

const EMPTY: SecurityPosture = {
  measuredAt: null,
  rows: [],
  actions: [],
  release: null,
  auditReportUrl: null,
};

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function httpsUrl(value: unknown): string | null {
  const s = str(value);
  if (!s) return null;
  try {
    return new URL(s).protocol === "https:" ? s : null;
  } catch {
    return null;
  }
}

function parseRow(value: unknown): PostureRow | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  const area = str(v.area);
  const account = str(v.account);
  const detail = str(v.detail);
  const measuredAt = str(v.measuredAt);
  const state = v.state as PostureState;
  if (!area || !account || !detail || !measuredAt || !STATES.has(state)) return null;
  return { area, account, state, detail, measuredAt };
}

function parseAction(value: unknown): ActionItem | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  const id = str(v.id);
  const title = str(v.title);
  const why = str(v.why);
  const where = str(v.where);
  if (!id || !title || !why || !where) return null;
  return { id, title, why, where };
}

function parseRelease(value: unknown): PostureRelease | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  const version = str(v.version);
  const packageName = str(v.packageName);
  const sha256 = str(v.sha256);
  const downloadUrl = httpsUrl(v.downloadUrl);
  const list = (x: unknown) =>
    Array.isArray(x) ? x.filter((i): i is string => typeof i === "string") : [];
  if (!version || !packageName || !sha256 || !downloadUrl) return null;
  return {
    version,
    versionCode: Number(v.versionCode) || 0,
    packageName,
    apkBytes: Number(v.apkBytes) || 0,
    sha256,
    downloadUrl,
    capabilities: list(v.capabilities),
    limits: list(v.limits),
  };
}

/** Reads the posture from the environment. Never throws. */
export function loadSecurityPosture(
  env: Record<string, string | undefined> = process.env
): SecurityPosture {
  const raw = env.SECURITY_POSTURE_JSON?.trim();
  if (!raw) return EMPTY;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return EMPTY;
  }
  if (!data || typeof data !== "object") return EMPTY;
  const d = data as Record<string, unknown>;
  const rows = Array.isArray(d.rows)
    ? d.rows.map(parseRow).filter((r): r is PostureRow => r !== null)
    : [];
  const actions = Array.isArray(d.actions)
    ? d.actions.map(parseAction).filter((a): a is ActionItem => a !== null)
    : [];
  return {
    measuredAt: str(d.measuredAt),
    rows,
    actions,
    release: parseRelease(d.release),
    auditReportUrl: httpsUrl(d.auditReportUrl),
  };
}

export function stateLabel(state: PostureState): string {
  if (state === "needs_action") return "يحتاج إجراء";
  if (state === "measured") return "مقيس وسليم";
  return "غير مقيس";
}
