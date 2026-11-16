import type { WorkerTool } from "../worker-types";
import { redact } from "../worker-types";
import { resolvePlatformCredential, resolveWorkspaceCredential } from "../worker-credentials";

/**
 * Read-only inspection of Vercel projects and their recent deployments.
 *
 * Five GETs. No deployment, no rollback, no promotion, no environment variable,
 * no domain change, no billing. The credential belongs to the workspace whose task
 * this is, and the answer is redacted before it can be stored.
 */

type Project = { id?: string; name?: string; framework?: string | null; createdAt?: number };
type Deployment = {
  uid?: string;
  name?: string;
  url?: string;
  state?: string;
  target?: string | null;
  createdAt?: number;
  meta?: Record<string, unknown>;
};

export const vercelDeploymentInspect: WorkerTool = {
  name: "vercel_deployment_inspect",
  readOnly: true,
  timeoutMs: 20_000,
  maxAttempts: 3,
  description:
    "Lists the workspace's Vercel projects and the recent deployments of one of them. Read-only.",
  async run({ organizationId, payload, signal, fetchImpl }) {
    const resolved =
      (await resolveWorkspaceCredential(organizationId, "vercel")) ??
      resolvePlatformCredential("vercel", "WORKER_VERCEL_TOKEN");
    if (!resolved.ok) {
      return { ok: false, summary: resolved.detail, error: resolved.error };
    }

    const headers = {
      Authorization: `Bearer ${resolved.token}`,
      "User-Agent": "zooka-worker",
    };
    const base = "https://api.vercel.com";

    const projectsResponse = await fetchImpl(`${base}/v9/projects?limit=20`, { headers, signal });
    if (!projectsResponse.ok) {
      return {
        ok: false,
        summary: `Vercel refused the project list (${projectsResponse.status}).`,
        error: `vercel_${projectsResponse.status}`,
      };
    }
    const projectsBody = (await projectsResponse.json()) as { projects?: Project[] };
    const projects = projectsBody.projects ?? [];

    const wanted = typeof payload.project === "string" ? payload.project.toLowerCase() : null;
    const project = wanted
      ? projects.find((p) => (p.name ?? "").toLowerCase() === wanted)
      : projects[0];
    if (!project) {
      return {
        ok: false,
        summary: wanted ? `Project ${wanted} is not visible to this credential.` : "No projects visible.",
        error: wanted ? "project_not_authorized" : "no_projects",
      };
    }

    let deployments: Deployment[] = [];
    if (project.id) {
      const deploymentsResponse = await fetchImpl(
        `${base}/v6/deployments?projectId=${encodeURIComponent(project.id)}&limit=5`,
        { headers, signal }
      );
      if (deploymentsResponse.ok) {
        const body = (await deploymentsResponse.json()) as { deployments?: Deployment[] };
        deployments = body.deployments ?? [];
      }
    }

    const summary = redact(
      `${project.name}: ${deployments.length} recent deployment(s), latest ` +
        `${deployments[0]?.state ?? "none"}${
          deployments[0]?.target ? ` (${deployments[0].target})` : ""
        }.`
    );

    return {
      ok: true,
      summary,
      evidence: {
        project: { id: project.id ?? null, name: project.name ?? null, framework: project.framework ?? null },
        deployments: deployments.map((deployment) => ({
          id: deployment.uid ?? null,
          state: deployment.state ?? null,
          target: deployment.target ?? null,
          url: deployment.url ?? null,
          createdAt: deployment.createdAt ?? null,
          commit: (deployment.meta?.githubCommitSha as string | undefined) ?? null,
        })),
      },
    };
  },
};
