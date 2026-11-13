import { tool } from "ai";
import { z } from "zod";
import { getOAuthAccessToken } from "@/lib/integrations/oauth/store";

/**
 * GitHub tools for the workspace agent. They reuse the workspace's stored
 * GitHub OAuth connection (scope: repo, read:user).
 *
 * Safety rules:
 *  - Read tools run without approval.
 *  - Every write tool sets `needsApproval: true`, so the user confirms each
 *    write in the chat before it executes.
 *  - Commits are never made to a repository's default branch. The agent works
 *    on a separate branch and opens a pull request; merging stays manual.
 */

const API = "https://api.github.com";
const NAME = /^[A-Za-z0-9._-]{1,100}$/;
const BRANCH = /^[A-Za-z0-9._/-]{1,200}$/;
const MAX_TEXT = 8000;

const repoSchema = {
  owner: z.string().regex(NAME).describe("Repository owner (user or org)."),
  repo: z.string().regex(NAME).describe("Repository name."),
};

const NOT_CONNECTED =
  "GitHub is not connected for this workspace. Connect it from Settings → Integrations first.";

type GhResult =
  | { ok: true; data: unknown; status: number }
  | { ok: false; error: string; status: number };

async function gh(
  organizationId: string,
  path: string,
  init?: { method: string; body?: unknown }
): Promise<GhResult> {
  const token = await getOAuthAccessToken(organizationId, "github");
  if (!token) {
    return { ok: false, error: NOT_CONNECTED, status: 401 };
  }
  let response: Response;
  try {
    response = await fetch(`${API}${path}`, {
      method: init?.method ?? "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "zooka-ai-agent",
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
      },
      body: init?.body ? JSON.stringify(init.body) : undefined,
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    return { ok: false, error: "GitHub request failed or timed out.", status: 0 };
  }
  if (response.status === 401) {
    return {
      ok: false,
      error: "GitHub rejected the stored token. Reconnect GitHub from Settings → Integrations.",
      status: 401,
    };
  }
  if (!response.ok) {
    return {
      ok: false,
      error: `GitHub request failed with status ${response.status}.`,
      status: response.status,
    };
  }
  if (response.status === 204) {
    return { ok: true, data: null, status: 204 };
  }
  return { ok: true, data: await response.json(), status: response.status };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function clip(text: string) {
  return text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT)}\n…[truncated]` : text;
}

function encodePath(path: string) {
  return path.split("/").map(encodeURIComponent).join("/");
}

async function defaultBranch(
  organizationId: string,
  owner: string,
  repo: string
): Promise<{ ok: true; name: string } | { ok: false; error: string }> {
  const result = await gh(organizationId, `/repos/${owner}/${repo}`);
  if (!result.ok) {
    return { ok: false, error: result.error };
  }
  const name = str(asRecord(result.data).default_branch);
  return name
    ? { ok: true, name }
    : { ok: false, error: "Could not determine the default branch." };
}

export function createGitHubTools(organizationId: string) {
  return {
    listGitHubRepos: tool({
      description:
        "List repositories the connected GitHub account can access, most recently updated first.",
      inputSchema: z.object({
        maxResults: z.number().int().min(1).max(30).optional(),
      }),
      execute: async ({ maxResults }) => {
        const result = await gh(
          organizationId,
          `/user/repos?sort=updated&per_page=${maxResults ?? 15}`
        );
        if (!result.ok) {
          return { error: result.error };
        }
        const items = Array.isArray(result.data) ? result.data : [];
        return {
          repos: items.map((item) => {
            const r = asRecord(item);
            return {
              fullName: str(r.full_name),
              private: r.private === true,
              defaultBranch: str(r.default_branch),
              updatedAt: str(r.updated_at),
            };
          }),
        };
      },
    }),

    readGitHubFile: tool({
      description:
        "Read a text file, or list a directory, from a GitHub repository. Optionally pass a branch, tag or commit in `ref`.",
      inputSchema: z.object({
        ...repoSchema,
        path: z.string().max(500).describe("File or directory path; empty for the repo root."),
        ref: z.string().regex(BRANCH).optional(),
      }),
      execute: async ({ owner, repo, path, ref }) => {
        const query = ref ? `?ref=${encodeURIComponent(ref)}` : "";
        const result = await gh(
          organizationId,
          `/repos/${owner}/${repo}/contents/${encodePath(path)}${query}`
        );
        if (!result.ok) {
          return { error: result.error };
        }
        if (Array.isArray(result.data)) {
          return {
            type: "directory",
            entries: result.data.slice(0, 100).map((item) => {
              const r = asRecord(item);
              return { name: str(r.name), type: str(r.type), size: r.size };
            }),
          };
        }
        const file = asRecord(result.data);
        if (str(file.encoding) !== "base64" || !str(file.content)) {
          return { error: "This path is not a readable text file." };
        }
        const text = Buffer.from(str(file.content), "base64").toString("utf8");
        return { type: "file", path: str(file.path), sha: str(file.sha), content: clip(text) };
      },
    }),

    listGitHubIssues: tool({
      description:
        "List issues and pull requests of a repository (state: open, closed or all).",
      inputSchema: z.object({
        ...repoSchema,
        state: z.enum(["open", "closed", "all"]).optional(),
        maxResults: z.number().int().min(1).max(30).optional(),
      }),
      execute: async ({ owner, repo, state, maxResults }) => {
        const result = await gh(
          organizationId,
          `/repos/${owner}/${repo}/issues?state=${state ?? "open"}&per_page=${maxResults ?? 15}`
        );
        if (!result.ok) {
          return { error: result.error };
        }
        const items = Array.isArray(result.data) ? result.data : [];
        return {
          items: items.map((item) => {
            const r = asRecord(item);
            return {
              number: r.number,
              title: str(r.title),
              state: str(r.state),
              isPullRequest: r.pull_request !== undefined,
              author: str(asRecord(r.user).login),
              updatedAt: str(r.updated_at),
            };
          }),
        };
      },
    }),

    createGitHubIssue: tool({
      description:
        "Open a new issue in a repository. Requires the user's approval before it runs.",
      inputSchema: z.object({
        ...repoSchema,
        title: z.string().trim().min(3).max(200),
        body: z.string().trim().max(5000).optional(),
      }),
      needsApproval: true,
      execute: async ({ owner, repo, title, body }) => {
        const result = await gh(organizationId, `/repos/${owner}/${repo}/issues`, {
          method: "POST",
          body: { title, body },
        });
        if (!result.ok) {
          return { error: result.error };
        }
        const r = asRecord(result.data);
        return { created: true, number: r.number, url: str(r.html_url) };
      },
    }),

    commentOnGitHubIssue: tool({
      description:
        "Add a comment to an issue or pull request. Requires the user's approval before it runs.",
      inputSchema: z.object({
        ...repoSchema,
        number: z.number().int().positive(),
        body: z.string().trim().min(1).max(5000),
      }),
      needsApproval: true,
      execute: async ({ owner, repo, number, body }) => {
        const result = await gh(
          organizationId,
          `/repos/${owner}/${repo}/issues/${number}/comments`,
          { method: "POST", body: { body } }
        );
        if (!result.ok) {
          return { error: result.error };
        }
        return { created: true, url: str(asRecord(result.data).html_url) };
      },
    }),

    commitGitHubFile: tool({
      description:
        "Create or update one file by committing it to a NON-default branch (the branch is created from the default branch if missing). Committing to the default branch is refused; open a pull request afterwards. Requires the user's approval before it runs.",
      inputSchema: z.object({
        ...repoSchema,
        branch: z.string().regex(BRANCH),
        path: z.string().min(1).max(500),
        content: z.string().max(100_000),
        message: z.string().trim().min(3).max(200),
      }),
      needsApproval: true,
      execute: async ({ owner, repo, branch, path, content, message }) => {
        const base = await defaultBranch(organizationId, owner, repo);
        if (!base.ok) {
          return { error: base.error };
        }
        if (branch === base.name) {
          return {
            error: `Refusing to commit to the default branch "${base.name}". Use a separate branch and open a pull request.`,
          };
        }
        const ref = await gh(
          organizationId,
          `/repos/${owner}/${repo}/git/ref/heads/${encodePath(branch)}`
        );
        if (!ref.ok && ref.status !== 404) {
          return { error: ref.error };
        }
        if (!ref.ok) {
          const baseRef = await gh(
            organizationId,
            `/repos/${owner}/${repo}/git/ref/heads/${encodePath(base.name)}`
          );
          if (!baseRef.ok) {
            return { error: baseRef.error };
          }
          const sha = str(asRecord(asRecord(baseRef.data).object).sha);
          const created = await gh(organizationId, `/repos/${owner}/${repo}/git/refs`, {
            method: "POST",
            body: { ref: `refs/heads/${branch}`, sha },
          });
          if (!created.ok) {
            return { error: created.error };
          }
        }
        const existing = await gh(
          organizationId,
          `/repos/${owner}/${repo}/contents/${encodePath(path)}?ref=${encodeURIComponent(branch)}`
        );
        if (!existing.ok && existing.status !== 404) {
          return { error: existing.error };
        }
        const existingSha = existing.ok ? str(asRecord(existing.data).sha) : "";
        const put = await gh(
          organizationId,
          `/repos/${owner}/${repo}/contents/${encodePath(path)}`,
          {
            method: "PUT",
            body: {
              message,
              branch,
              content: Buffer.from(content, "utf8").toString("base64"),
              ...(existingSha ? { sha: existingSha } : {}),
            },
          }
        );
        if (!put.ok) {
          return { error: put.error };
        }
        const commit = asRecord(asRecord(put.data).commit);
        return { committed: true, branch, commitUrl: str(commit.html_url) };
      },
    }),

    createGitHubPullRequest: tool({
      description:
        "Open a pull request from a branch into the repository's default branch. It never merges. Requires the user's approval before it runs.",
      inputSchema: z.object({
        ...repoSchema,
        head: z.string().regex(BRANCH).describe("Branch that contains the changes."),
        title: z.string().trim().min(3).max(200),
        body: z.string().trim().max(5000).optional(),
      }),
      needsApproval: true,
      execute: async ({ owner, repo, head, title, body }) => {
        const base = await defaultBranch(organizationId, owner, repo);
        if (!base.ok) {
          return { error: base.error };
        }
        if (head === base.name) {
          return { error: "The head branch must differ from the default branch." };
        }
        const result = await gh(organizationId, `/repos/${owner}/${repo}/pulls`, {
          method: "POST",
          body: { title, body, head, base: base.name },
        });
        if (!result.ok) {
          return { error: result.error };
        }
        const r = asRecord(result.data);
        return { created: true, number: r.number, url: str(r.html_url) };
      },
    }),
  };
}
