import { z } from "zod";

export const skillName = z.string().min(1).max(64).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

const skillFields = {
  description: z.string().trim().min(1).max(2000),
  instructions: z.string().trim().min(1).max(16000),
  enabled: z.boolean(),
};

export const createSkillBody = z.object({
  name: skillName,
  description: skillFields.description,
  instructions: skillFields.instructions,
  enabled: skillFields.enabled.optional(),
}).strict();

export const patchSkillBody = z.object({
  name: skillName.optional(),
  description: skillFields.description.optional(),
  instructions: skillFields.instructions.optional(),
  enabled: skillFields.enabled.optional(),
}).strict().refine((value) => Object.keys(value).length > 0);
