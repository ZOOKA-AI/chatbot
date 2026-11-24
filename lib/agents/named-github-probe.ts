import { z } from "zod";
import { secretName } from "@/lib/workspace/secrets/validation";

/** Only this explicitly declared task shape can carry a vault reference. */
export const namedGithubProbePayload = z.object({
  tool: z.literal("github_repo_probe"),
  repo: z.string().max(200).regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/).optional(),
  secretName,
}).strict();

export type NamedGithubProbePayload = z.infer<typeof namedGithubProbePayload>;
