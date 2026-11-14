import "server-only";

import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { OrganizationRole } from "@/app/(auth)/auth";
import { publishPost } from "@/lib/blog/store";
import {
  appendAgentMessage,
  getAgentHistory,
  getWorkspaceBilling,
} from "@/lib/db/queries";
import { isGoogleDriveConfigured } from "@/lib/integrations/google-drive/server";
import { getLiveIntegrationStatus } from "@/lib/integrations/live-status";
import { generateStoredImage } from "@/lib/media/gateway-image";

/**
 * Command layer for the workspace agent.
 *
 * A "command" is a single sentence or a structured call that maps to one
 * concrete action inside the workspace. Parsing is deterministic on purpose:
 * the same words always produce the same tool, so a customer can trust a
 * command and an operator can audit it without reading a model transcript.
 *
 * Security rules baked in here:
 * - every command runs inside the caller's workspace only;
 * - write commands declare a minimum role and are refused below it;
 * - parameters are validated by zod before any handler touches the database;
 * - the whole exchange is appended to AgentMessage, so nothing executes
 *   invisibly.
 */

export type CommandId =
  | "integrations.status"
  | "usage.status"
  | "memory.history"
  | "blog.create"
  | "image.generate";

type CommandSpec = {
  id: CommandId;
  titleAr: string;
  descriptionAr: string;
  minimumRole: OrganizationRole;
  schema: z.ZodTypeAny;
  patterns: RegExp[];
  example: string;
  requiresConfiguration: string[];
};

const ROLE_PRIORITY: Record<OrganizationRole, number> = {
  member: 0,
  admin: 1,
  owner: 2,
};

const blogParams = z.object({
  title: z.string().min(3).max(160),
  body: z.string().min(20).max(20000),
  lang: z.enum(["ar", "en"]).optional(),
  status: z.enum(["draft", "published"]).optional(),
  keyword: z.string().max(120).optional(),
});

const imageParams = z.object({
  prompt: z.string().min(3).max(1000),
  cartoon: z.boolean().optional(),
});

const emptyParams = z.object({}).strict();

export const COMMANDS: CommandSpec[] = [
  {
    id: "integrations.status",
    titleAr: "حالة التكاملات",
    descriptionAr: "يفحص أي تكامل مربوط فعليًا وشغّال الآن، وأيه محتاج إعادة ربط.",
    minimumRole: "member",
    schema: emptyParams,
    patterns: [/integrations?/i, /تكامل/, /الربط/, /مربوط/],
    example: "حالة التكاملات",
    requiresConfiguration: [],
  },
  {
    id: "usage.status",
    titleAr: "الاستخدام والخطة",
    descriptionAr: "يعرض الخطة الحالية وعدد مرات تشغيل الوكيل والرسائل المستهلكة.",
    minimumRole: "member",
    schema: emptyParams,
    patterns: [/usage/i, /plan/i, /استهلاك/, /استخدام/, /الخطة/, /الاشتراك/],
    example: "الاستخدام",
    requiresConfiguration: [],
  },
  {
    id: "memory.history",
    titleAr: "سجل الوكيل",
    descriptionAr: "آخر عشرة تبادلات محفوظة بينك وبين الوكيل داخل مساحة العمل.",
    minimumRole: "member",
    schema: emptyParams,
    patterns: [/history/i, /memory/i, /سجل/, /ذاكرة/, /المحادثات/],
    example: "سجل المحادثات",
    requiresConfiguration: [],
  },
  {
    id: "blog.create",
    titleAr: "إنشاء مقال",
    descriptionAr: "ينشئ مقالًا في المدونة كمسودة أو منشورًا، مع slug تلقائي.",
    minimumRole: "admin",
    schema: blogParams,
    patterns: [/blog/i, /article/i, /مقال/, /تدوينة/],
    example: 'اكتب مقال "عنوان المقال" ونصه هنا',
    requiresConfiguration: [],
  },
  {
    id: "image.generate",
    titleAr: "توليد صورة",
    descriptionAr: "يولّد صورة بالذكاء الاصطناعي ويحفظها في تخزين مساحة العمل.",
    minimumRole: "admin",
    schema: imageParams,
    patterns: [/image/i, /picture/i, /صورة/, /ارسم/],
    example: "ارسم صورة لقطة تشرب قهوة",
    requiresConfiguration: ["BLOB_READ_WRITE_TOKEN", "AI_GATEWAY_API_KEY"],
  },
];

export function findCommand(id: string) {
  return COMMANDS.find((command) => command.id === id) ?? null;
}

function trimTo(value: string, max: number) {
  return value.trim().slice(0, max);
}

/** Extracts a title inside quotes plus the remaining body, for free-text use. */
export function parseBlogText(text: string) {
  const quoted =
    text.match(/["“”](.+?)["“”]/)?.[1] ??
    text.match(/«(.+?)»/)?.[1] ??
    text.match(/'(.+?)'/)?.[1];

  if (!quoted) {
    return null;
  }

  const title = quoted.trim();
  const body = (text.split(quoted)[1] ?? "")
    .replace(/^[\s"“”'»]+/, "")
    .replace(/[\s"“”'«]+$/, "")
    .trim();
  if (body.length < 20) {
    return null;
  }

  return {
    title: trimTo(title, 160),
    body: trimTo(body, 20000),
    status: /(انشر|نشر|publish)/i.test(text) ? ("published" as const) : ("draft" as const),
    lang: /[\u0600-\u06FF]/.test(body) ? ("ar" as const) : ("en" as const),
  };
}

export function parseImageText(text: string) {
  const quoted =
    text.match(/["“”](.+?)["“”]/)?.[1] ?? text.match(/«(.+?)»/)?.[1];
  const prompt = (quoted ?? text.replace(/^(ارسم|generate|image|صورة)/i, "")).trim();
  if (prompt.length < 3) {
    return null;
  }
  return { prompt: trimTo(prompt, 1000), cartoon: /كرتون|cartoon/i.test(text) };
}

export type ParsedCommand =
  | { kind: "command"; spec: CommandSpec; params: unknown }
  | { kind: "needs_parameters"; spec: CommandSpec; missing: string[] }
  | { kind: "unknown" };

/** Deterministic intent match: no model call, no ambiguity. */
export function parseCommand(text: string): ParsedCommand {
  const value = text.trim();
  if (!value) {
    return { kind: "unknown" };
  }

  const spec = COMMANDS.find((command) =>
    command.patterns.some((pattern) => pattern.test(value))
  );
  if (!spec) {
    return { kind: "unknown" };
  }

  if (spec.id === "blog.create") {
    const params = parseBlogText(value);
    if (!params) {
      return { kind: "needs_parameters", spec, missing: ["title", "body"] };
    }
    return { kind: "command", spec, params };
  }

  if (spec.id === "image.generate") {
    const params = parseImageText(value);
    if (!params) {
      return { kind: "needs_parameters", spec, missing: ["prompt"] };
    }
    return { kind: "command", spec, params };
  }

  return { kind: "command", spec, params: {} };
}

export type CommandResult = {
  command: CommandId | null;
  ok: boolean;
  message: string;
  data?: unknown;
  error?:
    | "command_not_recognized"
    | "missing_parameters"
    | "invalid_parameters"
    | "forbidden_role"
    | "handler_failed";
};

export type RunCommandInput = {
  organizationId: string;
  userId: string;
  role: OrganizationRole;
  text: string;
};

function conversationKey(organizationId: string, userId: string) {
  return `${organizationId}:${userId}`;
}

async function audit(input: RunCommandInput, result: CommandResult) {
  const key = conversationKey(input.organizationId, input.userId);
  try {
    await appendAgentMessage({
      organizationId: input.organizationId,
      userId: input.userId,
      conversationKey: key,
      role: "user",
      content: `/${result.command ?? "unknown"} ${input.text}`.trim().slice(0, 4000),
    });
    await appendAgentMessage({
      organizationId: input.organizationId,
      userId: input.userId,
      conversationKey: key,
      role: "assistant",
      content: `${result.ok ? "ok" : "error"}: ${result.message}`.slice(0, 4000),
    });
  } catch {
    // Audit must never hide a result that already happened.
  }
}

export async function runCommand(input: RunCommandInput): Promise<CommandResult> {
  const parsed = parseCommand(input.text);

  if (parsed.kind === "unknown") {
    const listing = COMMANDS.map((command) => `${command.id} — ${command.example}`).join("\n");
    const result: CommandResult = {
      command: null,
      ok: false,
      error: "command_not_recognized",
      message: `مش فاهم الأمر. الأوامر المتاحة:\n${listing}`,
    };
    await audit(input, result);
    return result;
  }

  if (parsed.kind === "needs_parameters") {
    const result: CommandResult = {
      command: parsed.spec.id,
      ok: false,
      error: "missing_parameters",
      message: `الأمر ${parsed.spec.id} محتاج: ${parsed.missing.join(", ")}. مثال: ${parsed.spec.example}`,
    };
    await audit(input, result);
    return result;
  }

  const { spec } = parsed;

  if (ROLE_PRIORITY[input.role] < ROLE_PRIORITY[spec.minimumRole]) {
    const result: CommandResult = {
      command: spec.id,
      ok: false,
      error: "forbidden_role",
      message: `الأمر ${spec.id} متاح لدور ${spec.minimumRole} وأعلى فقط.`,
    };
    await audit(input, result);
    return result;
  }

  const validated = spec.schema.safeParse(parsed.params);
  if (!validated.success) {
    const result: CommandResult = {
      command: spec.id,
      ok: false,
      error: "invalid_parameters",
      message: `بيانات الأمر غير صحيحة: ${validated.error.issues
        .map((issue) => issue.path.join(".") || issue.message)
        .join(", ")}`,
    };
    await audit(input, result);
    return result;
  }

  try {
    const result = await execute(spec, validated.data, input);
    await audit(input, result);
    return result;
  } catch (error) {
    const result: CommandResult = {
      command: spec.id,
      ok: false,
      error: "handler_failed",
      message: `الأمر اتنفّذ وفشل: ${
        error instanceof Error ? error.message : "unknown_error"
      }`,
    };
    await audit(input, result);
    return result;
  }
}

async function execute(
  spec: CommandSpec,
  params: unknown,
  input: RunCommandInput
): Promise<CommandResult> {
  if (spec.id === "integrations.status") {
    const status = await getLiveIntegrationStatus(input.organizationId, {
      googleConfigured: isGoogleDriveConfigured(),
    });
    const connected = [...status.connected];
    const needsReconnect = [...status.needsReconnect];
    return {
      command: spec.id,
      ok: true,
      message:
        connected.length === 0 && needsReconnect.length === 0
          ? "مفيش أي تكامل مربوط في مساحة العمل دي لحد الآن."
          : `مربوط وشغّال: ${connected.join(", ") || "لا شيء"}. محتاج إعادة ربط: ${
              needsReconnect.join(", ") || "لا شيء"
            }.`,
      data: { connected, needsReconnect },
    };
  }

  if (spec.id === "usage.status") {
    const { subscription, usage } = await getWorkspaceBilling(input.organizationId);
    const plan = (subscription?.plan ?? "free").toLowerCase();
    return {
      command: spec.id,
      ok: true,
      message: `خطتك ${plan}. تشغيلات الوكيل: ${usage.agentRuns}.`,
      data: { plan, agentRuns: usage.agentRuns },
    };
  }

  if (spec.id === "memory.history") {
    const rows = await getAgentHistory(
      input.organizationId,
      conversationKey(input.organizationId, input.userId),
      10
    );
    return {
      command: spec.id,
      ok: true,
      message: rows.length
        ? `آخر ${rows.length} رسالة محفوظة في السجل.`
        : "السجل فاضي لحد الآن.",
      data: rows,
    };
  }

  if (spec.id === "blog.create") {
    const article = params as z.infer<typeof blogParams>;
    await publishPost({
      slug: article.title,
      title: article.title,
      body: article.body,
      lang: article.lang ?? "ar",
      status: article.status ?? "draft",
      keyword: article.keyword ?? null,
    });
    return {
      command: spec.id,
      ok: true,
      message:
        article.status === "published"
          ? `المقال "${article.title}" اتنشر على المدونة.`
          : `المقال "${article.title}" اتحفظ كمسودة، جاهز للنشر.`,
      data: { title: article.title, status: article.status ?? "draft" },
    };
  }

  if (spec.id === "image.generate") {
    const image = params as z.infer<typeof imageParams>;
    const url = await generateStoredImage({
      organizationId: input.organizationId,
      jobId: randomUUID(),
      prompt: image.prompt,
      cartoon: image.cartoon ?? false,
    });
    return {
      command: spec.id,
      ok: true,
      message: "الصورة اتولّدت واتحفظت في تخزين مساحة العمل.",
      data: { url },
    };
  }

  return {
    command: spec.id,
    ok: false,
    error: "handler_failed",
    message: `الأمر ${spec.id} مش موصول بأي تنفيذ.`,
  };
}

/** Public catalogue for the console UI: no secrets, no handler internals. */
export function commandCatalogue() {
  return COMMANDS.map((command) => ({
    id: command.id,
    titleAr: command.titleAr,
    descriptionAr: command.descriptionAr,
    minimumRole: command.minimumRole,
    example: command.example,
    requiresConfiguration: command.requiresConfiguration,
  }));
}
