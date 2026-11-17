import { z } from "zod";

const textPartSchema = z.object({
  type: z.enum(["text"]),
  text: z.string().min(1).max(2000),
});

const filePartSchema = z.object({
  type: z.enum(["file"]),
  mediaType: z.enum(["image/jpeg", "image/png"]),
  name: z.string().min(1).max(100),
  url: z.union([z.string().url(), z.string().startsWith("/api/files/")]),
});

const partSchema = z.union([textPartSchema, filePartSchema]);

const userMessageSchema = z.object({
  id: z.string().uuid(),
  role: z.enum(["user"]),
  parts: z.array(partSchema).max(8),
});

// For tool approval flows, we accept all messages (more permissive schema).
// Permissive is not unbounded: every field below carries a ceiling, because this
// payload is forwarded to a paid model call.
const messageSchema = z.object({
  id: z.string().max(64),
  role: z.enum(["user", "assistant", "system", "tool", "data"]),
  parts: z.array(z.any()).max(20),
});

/**
 * A ceiling on everything that can reach the model in one request.
 *
 * Per-field caps alone are not a budget: 200 messages of 2000 characters each is
 * still ~400k characters, which is paid for on every retry a client sends. This
 * bound is deliberately generous (an ordinary long conversation is far below it)
 * so the check cannot break real use.
 */
const MAX_CONTENT_CHARS = 60_000;

function textOf(parts: unknown): number {
  if (!Array.isArray(parts)) return 0;
  return parts.reduce((total, part) => {
    if (part && typeof part === "object" && "text" in part) {
      const text = (part as { text?: unknown }).text;
      return total + (typeof text === "string" ? text.length : 0);
    }
    return total;
  }, 0);
}

export const postRequestBodySchema = z.object({
  id: z.string().uuid(),
  // Either a single new message or all messages (for tool approvals)
  message: userMessageSchema.optional(),
  // A long conversation is legitimate; an unbounded array is not.
  messages: z.array(messageSchema).max(200).optional(),
  // Prior turns for guests, whose conversations are not stored server-side
  history: z.array(messageSchema).max(20).optional(),
  selectedChatModel: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-zA-Z0-9._:/-]+$/, "unknown model identifier"),
  selectedVisibilityType: z.enum(["public", "private"]),
  agentMode: z.boolean().default(false),
}).superRefine((body, ctx) => {
  const total =
    textOf(body.message?.parts) +
    (body.messages ?? []).reduce((sum, message) => sum + textOf(message.parts), 0) +
    (body.history ?? []).reduce((sum, message) => sum + textOf(message.parts), 0);

  if (total > MAX_CONTENT_CHARS) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["messages"],
      message: `conversation content exceeds ${MAX_CONTENT_CHARS} characters`,
    });
  }
});

export type PostRequestBody = z.infer<typeof postRequestBodySchema>;
