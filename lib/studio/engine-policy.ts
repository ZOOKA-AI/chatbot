/**
 * Which engine runs a piece of studio work, and who is allowed to say yes.
 *
 * The owner's rule for this layer: no vendor lock-in, no paid run without approval, and ZOOKA keeps
 * working when a generation provider is down. That is enforced here as a policy, not as documentation:
 *
 *   tier "local"        runs on our own CPU with no third party at all — always available, no approval
 *   tier "self_hosted"  runs on an instance the owner operates — available when configured, no billing
 *   tier "paid_api"     bills per call — refused unless an operator enables it AND an approval is cited
 *
 * The important consequence is ordering: a request that has a local answer never reaches a paid engine,
 * even when a paid engine is configured and healthy. Generation is the only capability with no local
 * answer, which is why it is the only one that can be blocked, and why a blocked generator cannot take
 * editing, cutouts, rendering or narration down with it.
 */

import { paidGenerationEnabled } from "./paid-switch";

/** A process environment, narrowed so a test can pass a literal without inventing NODE_ENV. */
export type Env = Record<string, string | undefined>;

export type StudioCapability =
  | "image_edit"
  | "background_remove"
  | "audio_edit"
  | "video_render"
  | "narration"
  | "image_generate"
  | "video_generate";

export type EngineTier = "local" | "self_hosted" | "paid_api";

export type EngineDescriptor = {
  id: string;
  tier: EngineTier;
  capabilities: StudioCapability[];
  /** Whether using it can produce a bill from a third party. */
  paid: boolean;
  /** The check that must pass before it may be used, or null when it needs no configuration. */
  configured: () => boolean;
  /** Order inside a tier. Lower runs first; used to keep a chosen paid provider ahead of a fallback. */
  priority?: number;
  note: string;
};

export type EngineDecision = {
  capability: StudioCapability;
  chosen: string | null;
  tier: EngineTier | null;
  reason: string;
  refused: Array<{ engine: string; reason: string }>;
};

/** Tier order is the policy: cheaper and more local wins, always. */
const TIER_ORDER: Record<EngineTier, number> = { local: 0, self_hosted: 1, paid_api: 2 };

/**
 * The engines this deployment knows about.
 *
 * `runcomfy-cloud` is a real implemented client (lib/studio/runcomfy.ts) that stays refused until an
 * operator sets RUNCOMFY_API_TOKEN, enables paid generation, and cites an approval for the specific job.
 * `cloud-gpu` remains a declaration: no client exists for it, so it can only ever refuse.
 */
export function engineRegistry(env: Env = process.env): EngineDescriptor[] {
  return [
    {
      id: "local-ffmpeg",
      tier: "local",
      capabilities: ["image_edit", "audio_edit", "video_render"],
      paid: false,
      configured: () => true,
      note: "ffmpeg and ffprobe on our own CPU",
    },
    {
      id: "rembg-u2net",
      tier: "local",
      capabilities: ["background_remove"],
      paid: false,
      configured: () => true,
      note: "rembg with U2Net, Apache-2.0",
    },
    {
      id: "piper",
      tier: "local",
      capabilities: ["narration"],
      paid: false,
      // A voice file is a separate licensed artifact, so narration needs one configured.
      configured: () => Boolean(env.STUDIO_PIPER_VOICE?.trim()),
      note: "Piper neural TTS, MIT engine, voice licensed separately",
    },
    {
      id: "runcomfy-cloud",
      tier: "paid_api",
      capabilities: ["image_generate", "video_generate"],
      paid: true,
      priority: 10,
      // A token is necessary and not sufficient: the spend gate still refuses without an approval.
      configured: () => Boolean(env.RUNCOMFY_API_TOKEN?.trim()),
      note: "RunComfy Model API v2, per-request billing; needs a token, the operator switch and a per-job approval",
    },
    {
      id: "comfyui",
      tier: "self_hosted",
      capabilities: ["image_generate"],
      paid: false,
      configured: () => Boolean(env.COMFYUI_ENDPOINT?.trim() && env.COMFYUI_WORKFLOW_FILE?.trim()),
      note: "an instance the owner operates; no third-party billing",
    },
    {
      id: "cloud-gpu",
      tier: "paid_api",
      capabilities: ["image_generate"],
      paid: true,
      priority: 90,
      configured: () => Boolean(env.STUDIO_CLOUD_GPU_ENDPOINT?.trim()),
      note: "rented GPU capacity (RunPod, Vast.ai and similar); not implemented, declaration only",
    },
  ];
}

export type PaidPolicy = {
  /** The operator's standing permission for billable engines. Default off. */
  enabled: boolean;
  /** The approval this run cites. Without one, an enabled flag is still not enough. */
  approvalReference: string | null;
};

export function paidPolicy(env: Env = process.env, approvalReference?: string | null): PaidPolicy {
  return {
    // One switch for the whole platform: the spend gate and the engine ladder must not disagree, because
    // a mismatch between two flags is exactly how a "disabled" provider gets selected anyway.
    enabled: paidGenerationEnabled(env),
    approvalReference:
      (approvalReference ?? env.STUDIO_PAID_APPROVAL_REF ?? env.RUNCOMFY_APPROVAL_REF ?? "").trim() || null,
  };
}

/**
 * Chooses one engine for a capability.
 *
 * A paid engine needs both the operator's flag and a cited approval, because either alone is a mistake:
 * a flag set once and forgotten would silently bill forever, and an approval with no enabled switch
 * would suggest the system is ready when it is not.
 */
export function selectEngine(input: {
  capability: StudioCapability;
  env?: Env;
  approvalReference?: string | null;
}): EngineDecision {
  const env = input.env ?? process.env;
  const policy = paidPolicy(env, input.approvalReference ?? null);
  const refused: Array<{ engine: string; reason: string }> = [];

  const candidates = engineRegistry(env)
    .filter((engine) => engine.capabilities.includes(input.capability))
    .sort(
      (a, b) =>
        TIER_ORDER[a.tier] - TIER_ORDER[b.tier] ||
        (a.priority ?? 50) - (b.priority ?? 50) ||
        a.id.localeCompare(b.id)
    );

  for (const engine of candidates) {
    if (engine.paid) {
      if (!policy.enabled) {
        refused.push({ engine: engine.id, reason: "paid_provider_not_enabled" });
        continue;
      }
      if (!policy.approvalReference) {
        refused.push({ engine: engine.id, reason: "paid_provider_not_approved" });
        continue;
      }
    }
    if (!engine.configured()) {
      refused.push({ engine: engine.id, reason: engine.paid ? "paid_provider_not_configured" : "not_configured" });
      continue;
    }
    return {
      capability: input.capability,
      chosen: engine.id,
      tier: engine.tier,
      reason: engine.tier === "local" ? "local_engine_available" : `${engine.tier}_engine_configured`,
      refused,
    };
  }

  return {
    capability: input.capability,
    chosen: null,
    tier: null,
    reason: candidates.length === 0 ? "no_engine_for_capability" : "every_engine_refused",
    refused,
  };
}

/**
 * The capabilities that never depend on a third party.
 *
 * This is what makes the owner's requirement testable rather than aspirational: these five must be
 * decided locally in every configuration, including one with no endpoint, no key and no network.
 */
export const LEVEL_ONE_CAPABILITIES: StudioCapability[] = [
  "image_edit",
  "background_remove",
  "audio_edit",
  "video_render",
  "narration",
];

/** True when every level-one capability is served by a local engine under this configuration. */
export function levelOneSelfSufficient(env: Env = process.env): { ok: boolean; gaps: string[] } {
  const gaps = LEVEL_ONE_CAPABILITIES.filter((capability) => {
    const decision = selectEngine({ capability, env });
    return decision.chosen === null || decision.tier !== "local";
  });
  return { ok: gaps.length === 0, gaps };
}
