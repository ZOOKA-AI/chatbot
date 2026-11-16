import type { WorkerTool } from "../worker-types";
import { redact } from "../worker-types";

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
  async run({ payload, signal, fetchImpl }) {
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

    const token = process.env.WORKER_GITHUB_TOKEN ?? process.env.GITHUB_ACCESS_TOKEN;
    if (!token) {
      return {
        ok: false,
        summary: "No GitHub credential is configured for the worker.",
        error: "github_not_configured",
      };
    }

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
