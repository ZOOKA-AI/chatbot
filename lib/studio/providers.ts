import { readFile } from "node:fs/promises";

import { paidGenerationEnabled, spendCapUsd } from "./paid-switch";
import { guardedFetch } from "./outbound-guard";
import { freeImageStatuses, generateFreeImage, type FreeImageProviderId } from "../media/free-image";

/**
 * Providers, in one neutral shape.
 *
 * The studio's core editing never needs a provider, so this file is only about generation, and it
 * describes honestly what is reachable: a `local` provider does deterministic work with ffmpeg, a
 * `self_hosted` provider is an endpoint the owner runs (ComfyUI), and an `external_api` provider is a
 * paid service. Nothing here invents output: when a provider is unreachable the answer is a status
 * with a reason, and the caller is expected to say so rather than show a placeholder picture.
 *
 * Every provider call carries the tenant that asked for it. A ComfyUI instance is shared
 * infrastructure, so the adapter refuses to run without a tenant id and records it with the job; the
 * assets it produces are stored through the same tenant-scoped media layer as an upload.
 */

export type ProviderKind = "local" | "self_hosted" | "free_api" | "external_api";
export type Capability = "image" | "video" | "audio";

export type ProviderStatus =
  | { ready: true; provider: string; kind: ProviderKind; capabilities: Capability[]; detail: string; models?: string[] }
  | { ready: false; provider: string; kind: ProviderKind; capabilities: Capability[]; blocked: string; detail: string | null };

export type GenerateInput = {
  organizationId: string;
  prompt: string;
  capability: Capability;
  size?: { width: number; height: number };
  steps?: number;
  signal?: AbortSignal;
};

export type GenerateResult =
  | { ok: true; bytes: Buffer; mimeType: string; provider: string; seconds: number; meta: Record<string, unknown> }
  | { ok: false; code: string; detail: string | null; provider: string };

export type MediaProvider = {
  id: string;
  kind: ProviderKind;
  capabilities: Capability[];
  /** Whether this provider can create content from a prompt, as opposed to editing real files. */
  generative: boolean;
  status(): Promise<ProviderStatus>;
  generate(input: GenerateInput): Promise<GenerateResult>;
};

function timeout(ms: number): { signal: AbortSignal; cancel: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, cancel: () => clearTimeout(timer) };
}

/**
 * Deterministic local provider: ffmpeg. Listed so the panel can say truthfully how every asset was
 * made, and so a caller asking for "generation" gets an honest refusal from the local provider
 * instead of a fabricated image.
 */
export const localProvider: MediaProvider = {
  id: "local-ffmpeg",
  kind: "local",
  capabilities: ["image", "video", "audio"],
  // Ready, but not a generator: selecting it for a prompt would be the lie this flag prevents.
  generative: false,
  async status() {
    return {
      ready: true,
      provider: "local-ffmpeg",
      kind: "local",
      capabilities: ["image", "video", "audio"],
      detail: "deterministic editing and rendering; it does not invent pictures",
    };
  },
  async generate() {
    return {
      ok: false,
      provider: "local-ffmpeg",
      code: "not_generative",
      detail: "the local provider edits and renders real media; it cannot create content from a prompt",
    };
  },
};

/** The endpoints a ComfyUI adapter is allowed to talk to: an owner-run instance, nothing else. */
export function comfyEndpoint(env: Record<string, string | undefined> = process.env): string | null {
  const raw = env.COMFYUI_ENDPOINT?.trim();
  if (!raw) return null;
  if (!/^https?:\/\//i.test(raw)) return null;
  return raw.replace(/\/+$/, "");
}

export type ComfyWorkflow = {
  /** The API-format workflow graph, exactly as ComfyUI exports it. */
  graph: Record<string, unknown>;
  /** Which node the prompt text is written into. */
  promptNodeId: string;
  /** Which node the resulting image is read from. */
  outputNodeId: string;
};

/**
 * Reads the owner's workflow file once per process.
 *
 * A workflow is configuration, so a malformed file is a configuration error, not a crash: the adapter
 * reports it and stays blocked.
 */
export async function loadWorkflow(path: string | null): Promise<ComfyWorkflow | { error: string }> {
  if (!path) return { error: "workflow_not_configured" };
  try {
    const parsed = JSON.parse(await readFile(path, "utf8")) as Partial<ComfyWorkflow>;
    if (!parsed.graph || typeof parsed.graph !== "object") return { error: "workflow_invalid_graph" };
    if (!parsed.promptNodeId || !parsed.outputNodeId) return { error: "workflow_missing_nodes" };
    return { graph: parsed.graph, promptNodeId: parsed.promptNodeId, outputNodeId: parsed.outputNodeId };
  } catch {
    return { error: "workflow_unreadable" };
  }
}

/**
 * ComfyUI, as a self-hosted provider.
 *
 * The adapter speaks the documented queue API: submit to `/prompt`, poll `/history/<id>`, fetch the
 * bytes from `/view`. It never enables partner nodes, never assumes a GPU, and bounds every wait so a
 * stuck instance cannot hold a request open. When the endpoint or workflow is missing the status says
 * exactly what is missing, which is what the panel shows the customer.
 */
export function createComfyProvider(
  options: { env?: Record<string, string | undefined>; fetchImpl?: typeof fetch } = {}
): MediaProvider {
  const env = options.env ?? process.env;
  /*
   * Every request this adapter makes goes through the guard, not only the first one.
   * A redirected /prompt or a /view URL that points at the metadata service is the same SSRF as a bad
   * endpoint, and the audit found only the endpoint was ever considered.
   */
  const rawFetch = options.fetchImpl ?? fetch;
  const doFetch = ((input: RequestInfo | URL, init?: RequestInit) =>
    guardedFetch(String(input), init, { fetchImpl: rawFetch, env })) as typeof fetch;
  const endpoint = comfyEndpoint(env);
  const workflowPath = env.COMFYUI_WORKFLOW_FILE?.trim() || null;
  const token = env.COMFYUI_API_TOKEN?.trim() || null;
  const pollMs = Number(env.COMFYUI_POLL_MS ?? 1500);
  const deadlineMs = Number(env.COMFYUI_TIMEOUT_MS ?? 90_000);

  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;

  return {
    id: "comfyui",
    kind: "self_hosted",
    capabilities: ["image"],
    generative: true,
    async status() {
      if (!endpoint) {
        return {
          ready: false,
          provider: "comfyui",
          kind: "self_hosted",
          capabilities: ["image"],
          blocked: "endpoint_not_configured",
          detail: "set COMFYUI_ENDPOINT to an owner-run instance",
        };
      }
      const workflow = await loadWorkflow(workflowPath);
      if ("error" in workflow) {
        return {
          ready: false,
          provider: "comfyui",
          kind: "self_hosted",
          capabilities: ["image"],
          blocked: workflow.error,
          detail: "a workflow file describing the prompt and output nodes is required",
        };
      }
      const guard = timeout(5000);
      try {
        const response = await doFetch(`${endpoint}/system_stats`, { headers, signal: guard.signal });
        if (!response.ok) {
          return {
            ready: false,
            provider: "comfyui",
            kind: "self_hosted",
            capabilities: ["image"],
            blocked: "endpoint_unreachable",
            detail: `HTTP ${response.status}`,
          };
        }
        const stats = (await response.json().catch(() => ({}))) as { devices?: Array<{ name?: string; vram_total?: number }> };
        // A ComfyUI that answers but holds no checkpoint cannot render anything, so the models it
        // actually has are part of the answer rather than something the operator discovers on failure.
        const models = await listCheckpoints(endpoint, headers, doFetch);
        if (models !== null && models.length === 0) {
          return {
            ready: false,
            provider: "comfyui",
            kind: "self_hosted",
            capabilities: ["image"],
            blocked: "no_models_installed",
            detail: "the instance answered but lists no checkpoint; install one before use",
          };
        }
        const device = stats.devices?.[0];
        return {
          ready: true,
          provider: "comfyui",
          kind: "self_hosted",
          capabilities: ["image"],
          detail: device?.name ? `device: ${device.name}` : "endpoint answered",
          models: models ?? undefined,
        };
      } catch (error) {
        return {
          ready: false,
          provider: "comfyui",
          kind: "self_hosted",
          capabilities: ["image"],
          blocked: "endpoint_unreachable",
          detail: error instanceof Error ? error.name : "unknown",
        };
      } finally {
        guard.cancel();
      }
    },
    async generate(input) {
      if (!input.organizationId) {
        return { ok: false, provider: "comfyui", code: "tenant_required", detail: "a tenant is required for every job" };
      }
      if (input.capability !== "image") {
        return { ok: false, provider: "comfyui", code: "unsupported_capability", detail: input.capability };
      }
      const status = await this.status();
      if (!status.ready) {
        return { ok: false, provider: "comfyui", code: status.blocked, detail: status.detail };
      }
      const workflow = await loadWorkflow(workflowPath);
      if ("error" in workflow) return { ok: false, provider: "comfyui", code: workflow.error, detail: null };

      const started = Date.now();
      const graph = structuredClone(workflow.graph) as Record<string, { inputs?: Record<string, unknown> }>;
      graph[workflow.promptNodeId] = graph[workflow.promptNodeId] ?? {};
      graph[workflow.promptNodeId].inputs = graph[workflow.promptNodeId].inputs ?? {};
      graph[workflow.promptNodeId].inputs!.text = input.prompt.slice(0, 2000);
      if (input.size) {
        const node = graph[workflow.promptNodeId].inputs!;
        if ("width" in node) node.width = input.size.width;
        if ("height" in node) node.height = input.size.height;
      }

      const submitGuard = timeout(15_000);
      let promptId: string | null = null;
      try {
        const response = await doFetch(`${endpoint}/prompt`, {
          method: "POST",
          headers,
          body: JSON.stringify({ prompt: graph, client_id: input.organizationId }),
          signal: submitGuard.signal,
        });
        if (!response.ok) {
          return { ok: false, provider: "comfyui", code: "submit_failed", detail: `HTTP ${response.status}` };
        }
        const body = (await response.json().catch(() => ({}))) as { prompt_id?: string };
        promptId = body.prompt_id ?? null;
      } catch (error) {
        return { ok: false, provider: "comfyui", code: "submit_failed", detail: error instanceof Error ? error.name : null };
      } finally {
        submitGuard.cancel();
      }
      if (!promptId) return { ok: false, provider: "comfyui", code: "submit_failed", detail: "no prompt id" };

      // Bounded polling: a job that never finishes must not hold the request open.
      while (Date.now() - started < deadlineMs) {
        if (input.signal?.aborted) return { ok: false, provider: "comfyui", code: "aborted", detail: null };
        await new Promise((resolve) => setTimeout(resolve, pollMs));
        const pollGuard = timeout(8000);
        try {
          const historyResponse = await doFetch(`${endpoint}/history/${promptId}`, { headers, signal: pollGuard.signal });
          if (!historyResponse.ok) continue;
          const history = (await historyResponse.json().catch(() => ({}))) as Record<
            string,
            { outputs?: Record<string, { images?: Array<{ filename: string; subfolder?: string; type?: string }> }>; status?: { status_str?: string } }
          >;
          const entry = history[promptId];
          if (!entry) continue;
          if (entry.status?.status_str === "error") {
            return { ok: false, provider: "comfyui", code: "job_failed", detail: "the workflow reported an error" };
          }
          const images = Object.values(entry.outputs ?? {}).flatMap((output) => output.images ?? []);
          const first = images[0];
          if (!first) continue;
          const viewGuard = timeout(20_000);
          const viewResponse = await doFetch(
            `${endpoint}/view?filename=${encodeURIComponent(first.filename)}&subfolder=${encodeURIComponent(first.subfolder ?? "")}&type=${encodeURIComponent(first.type ?? "output")}`,
            { headers, signal: viewGuard.signal }
          );
          viewGuard.cancel();
          if (!viewResponse.ok) {
            return { ok: false, provider: "comfyui", code: "output_unavailable", detail: `HTTP ${viewResponse.status}` };
          }
          const bytes = Buffer.from(await viewResponse.arrayBuffer());
          if (bytes.length === 0) return { ok: false, provider: "comfyui", code: "empty_output", detail: null };
          return {
            ok: true,
            bytes,
            mimeType: viewResponse.headers.get("content-type") ?? "image/png",
            provider: "comfyui",
            seconds: Math.round((Date.now() - started) / 100) / 10,
            meta: { promptId, filename: first.filename, organizationId: input.organizationId },
          };
        } catch {
          // A failed poll is retried until the deadline; the deadline is the real limit.
          continue;
        } finally {
          pollGuard.cancel();
        }
      }
      return { ok: false, provider: "comfyui", code: "timeout", detail: `${deadlineMs}ms` };
    },
  };
}

/**
 * The checkpoints installed on an instance, read from its own node description.
 *
 * `null` means the instance did not describe its loader, which is not the same as having no models:
 * older builds and custom nodes vary, so the caller distinguishes "unknown" from "empty".
 */
async function listCheckpoints(
  endpoint: string,
  headers: Record<string, string>,
  doFetch: typeof fetch
): Promise<string[] | null> {
  const guard = timeout(6000);
  try {
    const response = await doFetch(`${endpoint}/object_info/CheckpointLoaderSimple`, { headers, signal: guard.signal });
    if (!response.ok) return null;
    const body = (await response.json().catch(() => null)) as
      | Record<string, { input?: { required?: { ckpt_name?: unknown[] } } }>
      | null;
    const names = body?.CheckpointLoaderSimple?.input?.required?.ckpt_name;
    const list = Array.isArray(names) ? names[0] : null;
    return Array.isArray(list) ? (list as string[]) : null;
  } catch {
    return null;
  } finally {
    guard.cancel();
  }
}

/**
 * A free-tier cloud provider (Cloudflare Workers AI, OVHcloud), as a studio generator.
 *
 * `free_api` means no third-party bill: when the provider's free allowance runs out it refuses, and the
 * studio reports that refusal. Readiness is "has a credential"; the first real call is the health check,
 * because neither provider offers a free status endpoint that proves generation works.
 */
export function createFreeImageProvider(
  id: FreeImageProviderId,
  options: { env?: Record<string, string | undefined>; fetchImpl?: typeof fetch } = {}
): MediaProvider {
  const env = options.env ?? process.env;
  return {
    id,
    kind: "free_api",
    capabilities: ["image"],
    generative: true,
    async status() {
      const status = freeImageStatuses(env).find((entry) => entry.provider === id);
      if (!status?.configured) {
        return {
          ready: false,
          provider: id,
          kind: "free_api",
          capabilities: ["image"],
          blocked: "credential_missing",
          detail: `set ${status?.missing.join(" and ") ?? "the provider key"} on the server. ${status?.note ?? ""}`.trim(),
        };
      }
      return { ready: true, provider: id, kind: "free_api", capabilities: ["image"], detail: status.note, models: [status.model] };
    },
    async generate(input) {
      if (!input.organizationId) {
        return { ok: false, provider: id, code: "tenant_required", detail: "a tenant is required for every job" };
      }
      if (input.capability !== "image") {
        return { ok: false, provider: id, code: "unsupported_capability", detail: input.capability };
      }
      const outcome = await generateFreeImage(input.prompt, { env, fetchImpl: options.fetchImpl, only: id });
      if (!outcome.ok) {
        const attempt = outcome.attempts[0];
        return { ok: false, provider: id, code: attempt?.code ?? "failed", detail: attempt?.detail ?? null };
      }
      return {
        ok: true,
        bytes: outcome.bytes,
        mimeType: outcome.mimeType,
        provider: id,
        seconds: outcome.seconds,
        meta: { model: outcome.model, organizationId: input.organizationId, billed: false },
      };
    },
  };
}

/** Every provider the studio knows about, so settings and status are driven by one list. */
export function providerRegistry(
  options: { env?: Record<string, string | undefined>; fetchImpl?: typeof fetch } = {}
): MediaProvider[] {
  // Order is preference: the owner's own ComfyUI first, then the free cloud tiers.
  return [
    localProvider,
    createComfyProvider(options),
    createFreeImageProvider("cloudflare-workers-ai", options),
    createFreeImageProvider("ovhcloud-sdxl", options),
  ];
}

/**
 * RunComfy reported as a status only.
 *
 * It deliberately has no `generate` here: its work is asynchronous (submit, poll, retrieve) and it bills
 * per request, so it runs through the agent worker tool where the spend gate and the approval live. This
 * entry exists so the panel tells the truth about it instead of omitting it, and it reports the exact
 * blocker rather than a button that would fail on click.
 */
export function runcomfyStatus(env: Record<string, string | undefined> = process.env): ProviderStatus {
  const capabilities: Capability[] = ["image", "video"];
  const configured = Boolean(env.RUNCOMFY_API_TOKEN?.trim());
  if (!configured) {
    return {
      ready: false,
      provider: "runcomfy-cloud",
      kind: "external_api",
      capabilities,
      blocked: "credential_missing",
      detail: "RUNCOMFY_API_TOKEN is not set on the server. Generation runs through the agent worker, and it bills per request.",
    };
  }
  if (!paidGenerationEnabled(env)) {
    return {
      ready: false,
      provider: "runcomfy-cloud",
      kind: "external_api",
      capabilities,
      blocked: "paid_generation_disabled",
      detail: `A credential is present but PAID_GENERATION_ENABLED is off, so nothing will be submitted. Cap ${spendCapUsd(env).toFixed(2)} USD per job.`,
    };
  }
  return {
    ready: true,
    provider: "runcomfy-cloud",
    kind: "external_api",
    capabilities,
    detail: `Per-request billing with a ${spendCapUsd(env).toFixed(2)} USD cap per job; every job still needs its own approval.`,
  };
}

/** fal, reported the same way: a status with the exact blocker, never a button that fails on click. */
export function falStatus(env: Record<string, string | undefined> = process.env): ProviderStatus {
  const capabilities: Capability[] = ["image", "video"];
  const configured = Boolean(env.FAL_KEY?.trim() || env.FAL_API_KEY?.trim());
  if (!configured) {
    return {
      ready: false,
      provider: "fal-cloud",
      kind: "external_api",
      capabilities,
      blocked: "credential_missing",
      detail: "FAL_KEY is not set on the server.",
    };
  }
  if (!paidGenerationEnabled(env)) {
    return {
      ready: false,
      provider: "fal-cloud",
      kind: "external_api",
      capabilities,
      blocked: "paid_generation_disabled",
      detail: `A key is present but PAID_GENERATION_ENABLED is off. Cap ${spendCapUsd(env).toFixed(2)} USD per job.`,
    };
  }
  return {
    ready: true,
    provider: "fal-cloud",
    kind: "external_api",
    capabilities,
    detail: `Per-request billing with a ${spendCapUsd(env).toFixed(2)} USD cap and a per-job approval. fal offers no free catalogue call, so the key stays unverified until a billed call succeeds.`,
  };
}

export async function providerStatuses(
  options: { env?: Record<string, string | undefined>; fetchImpl?: typeof fetch } = {}
): Promise<ProviderStatus[]> {
  const statuses = await Promise.all(providerRegistry(options).map((provider) => provider.status()));
  // Appended rather than registered, because registration implies a synchronous generate() it does not have.
  const env = options.env ?? process.env;
  return [...statuses, runcomfyStatus(env), falStatus(env)];
}
