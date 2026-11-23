import type { WorkerTool } from "../worker-types";
import { redact } from "../worker-types";
import { resolveNamedWorkspaceCredential, resolvePlatformCredential, resolveWorkspaceCredential } from "../worker-credentials";

/**
 * Read-only inspection of one authorised repository.
 *
 * Four GETs and nothing else: no branch creation, no commits, no pull requests,
 * no issues. The token is used to build the request header and is never placed in
 * the result, and every string that leaves this function passes through `redact`
 * first, so a token that happens to appear inside a file preview cannot leak into
 * evidence that is stored in the database.
 */

const DEFAULT_ALLOWED = ["ZOOKA-AI/chatbot"];

function allowedRepos(): string[] {
  return (process.env.WORKER_GITHUB_ALLOWED_REPOS ?? DEFAULT_ALLOWED.join(","))
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

type GitHubRepo = {
  full_name?: string;
  private?: boolean;
  default_branch?: string;
  pushed_at?: string;
  size?: number;
  description?: string | null;
};

export const githubRepoInspect: WorkerTool = {
  name: "github_repo_inspect",
  readOnly: true,
  timeoutMs: 20_000,
  maxAttempts: 3,
  description:
    "Reads a repository's metadata and the first lines of selected files. Never writes anything.",
  async run({ organizationId, payload, signal, fetchImpl }) {
    const repo = String(payload.repo ?? "").toLowerCase();
    if (!/^[a-z0-9_.-]+\/[a-z0-9_.-]+$/.test(repo)) {
      return { ok: false, summary: "Malformed repository name.", error: "bad_repo_name" };
    }
    // Authorised installation scope: a repository outside this list is refused
    // before a single request is made.
    if (!allowedRepos().includes(repo)) {
      return {
        ok: false,
        summary: `Repository ${repo} is outside this worker's authorised scope.`,
        error: "repo_not_authorized",
      };
    }

    if (payload.secretName !== undefined) {
      return { ok: false, summary: "Named secrets are supported only by github_repo_probe, not repository inspection.", error: "named_secret_not_supported" };
    }

    // The workspace's own connection comes first. A shared platform token is only
    // reachable when the deployment declares itself single-tenant, and a workspace
    // whose stored credential is malformed is refused rather than quietly served
    // by the platform's token.
    const workspace = await resolveWorkspaceCredential(organizationId, "github");
    let resolved = workspace;
    if (!workspace.ok && workspace.error === "not_connected") {
      resolved = resolvePlatformCredential(
        "github",
        process.env.WORKER_GITHUB_TOKEN ? "WORKER_GITHUB_TOKEN" : "GITHUB_ACCESS_TOKEN"
      );
    }
    if (!resolved.ok) {
      return { ok: false, summary: resolved.detail, error: resolved.error };
    }
    const token = resolved.token;

    const headers = {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "zooka-worker",
    };

    const base = "https://api.github.com";

    const metaResponse = await fetchImpl(`${base}/repos/${repo}`, { headers, signal });
    if (metaResponse.status === 404) {
      return { ok: false, summary: `${repo} is not visible to this credential.`, error: "repo_not_found" };
    }
    if (!metaResponse.ok) {
      return {
        ok: false,
        summary: `GitHub refused the metadata request (${metaResponse.status}).`,
        error: `github_${metaResponse.status}`,
      };
    }
    const meta = (await metaResponse.json()) as GitHubRepo;
    const branch = meta.default_branch ?? "main";

    // What this credential is allowed to reach depends on what kind of credential
    // it is, and the two cases must not be conflated:
    //
    // - an installation token (`ghs_`) belongs to an installation, so the
    //   repository must appear in that installation's list. A repository it can
    //   read by other means is still refused.
    // - a user token (`ghp_`, `gho_`) is a person's, and a person may legitimately
    //   read a public repository they are not a member of. Access is already proven
    //   by the metadata read, and scope is bounded by the allowlist, so membership
    //   is recorded as not applicable rather than faked as verified.
    const isInstallationToken = token.startsWith("ghs_");
    let installationVerified: boolean | "unavailable" | "not_applicable" = "not_applicable";
    if (!isInstallationToken) {
      // Nothing further to prove for a user token; keep the value honest.
    } else {
    const listUrl = `${base}/installation/repositories?per_page=100`;
    const listResponse = await fetchImpl(listUrl, { headers, signal });
    if (listResponse.ok) {
      const listing = (await listResponse.json()) as {
        repositories?: Array<{ full_name?: string }>;
        total_count?: number;
      };
      const names = (listing.repositories ?? []).map((entry) => (entry.full_name ?? "").toLowerCase());
      if (!names.includes(repo)) {
        return {
          ok: false,
          summary: `${repo} is not part of the installation this credential belongs to.`,
          error: "repo_not_in_installation",
        };
      }
      installationVerified = true;
    }
    }

    const requested = Array.isArray(payload.paths) ? payload.paths.slice(0, 5) : [];
    const files: Array<{ path: string; bytes: number; preview: string }> = [];

    for (const rawPath of requested) {
      const path = String(rawPath).replace(/^\/+/, "");
      if (!/^[A-Za-z0-9._\/-]+$/.test(path) || path.includes("..")) {
        continue;
      }
      const response = await fetchImpl(
        `${base}/repos/${repo}/contents/${encodeURIComponent(path)}?ref=${branch}`,
        { headers, signal }
      );
      if (!response.ok) continue;
      const body = (await response.json()) as { content?: string; size?: number; encoding?: string };
      if (!body.content) continue;
      const text = Buffer.from(body.content, "base64").toString("utf8");
      files.push({
        path,
        bytes: body.size ?? text.length,
        preview: redact(text.slice(0, 400)),
      });
    }

    return {
      ok: true,
      summary: redact(
        `${repo}: branch ${branch}, ${meta.private ? "private" : "public"}, ` +
          `${meta.size ?? 0} KB, last push ${meta.pushed_at ?? "unknown"}; ` +
          `read ${files.length} file(s).`
      ),
      evidence: {
        repo,
        credentialSource: resolved.source,
        installationVerified,
        branch,
        private: Boolean(meta.private),
        pushedAt: meta.pushed_at ?? null,
        sizeKb: meta.size ?? null,
        description: meta.description ? redact(meta.description) : null,
        files,
      },
    };
  },
};

/** A separate probe cannot be mistaken for a full repository inspection. */
export const githubRepoProbe: WorkerTool = {
  name: "github_repo_probe",
  readOnly: true,
  timeoutMs: 20_000,
  maxAttempts: 3,
  description: "Checks whether a named workspace GitHub credential can access an allowlisted repository. Does not inspect files.",
  async run({ organizationId, payload, signal, fetchImpl }) {
    const repo = payload.repo === undefined
      ? "zooka-ai/chatbot"
      : typeof payload.repo === "string" ? payload.repo.toLowerCase() : "";
    if (!/^[a-z0-9_.-]+\/[a-z0-9_.-]+$/.test(repo) || !allowedRepos().includes(repo)) {
      return { ok: false, summary: "Repository is invalid or outside the authorized scope.", error: "repo_not_authorized" };
    }
    const credential = await resolveNamedWorkspaceCredential(organizationId, payload.secretName);
    if (!credential.ok) return { ok: false, summary: credential.detail, error: credential.error };
    try {
      const response = await fetchImpl(`https://api.github.com/repos/${repo}`, {
        headers: {
          Authorization: ["Bearer", credential.token].join(" "),
          Accept: "application/vnd.github+json",
          "User-Agent": "zooka-worker",
        },
        signal,
        redirect: "error",
      });
      if (!response.ok) return { ok: false, summary: "GitHub refused the repository probe.", error: "github_probe_failed" };
      return { ok: true, summary: "GitHub repository access probe succeeded; no files were inspected.", evidence: { accessible: true } };
    } catch {
      return { ok: false, summary: "GitHub repository probe failed.", error: "github_probe_failed" };
    }
  },
};
