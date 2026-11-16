import "server-only";

import { z } from "zod";

import { isKnownTool } from "@/lib/agents/agent-tools";

/**
 * The Action Catalog: what a customer can ask for, described once and honestly.
 *
 * Every template is a contract, not marketing. The inputs listed here are exactly the keys the
 * worker tool receives, so a template cannot promise an input that never reaches the tool. A
 * template whose tool does not exist is refused at import time rather than offered and failing
 * later, and `executable` is derived from that same check so the catalog can never show a Run
 * control for work the platform cannot actually do.
 *
 * Bump ACTION_CATALOG_VERSION whenever a published template changes shape. The version travels
 * with every task payload, so an execution can be read back against the template it ran under.
 */

export const ACTION_CATALOG_VERSION = 1;

const LOCALIZED = z.object({ ar: z.string().min(2), en: z.string().min(2) });

export const ACTION_CATEGORIES = [
  "research",
  "engineering",
  "marketing",
  "operations",
  "design",
] as const;

export type ActionCategory = (typeof ACTION_CATEGORIES)[number];

export const actionInputSchema = z
  .object({
    key: z
      .string()
      .regex(/^[a-z][a-z0-9_]{0,40}$/, "input keys are lower_snake_case")
      .describe("The payload key the worker tool reads."),
    type: z.enum(["text", "repo", "url", "number"]),
    required: z.boolean(),
    label: LOCALIZED,
    help: LOCALIZED,
    placeholder: z.string().max(120).optional(),
    pattern: z.string().max(200).optional(),
    // Only present for numeric inputs, so a range is stated rather than assumed.
    min: z.number().optional(),
    max: z.number().optional(),
  })
  .strict();

export const actionTemplateSchema = z
  .object({
    schemaVersion: z.literal(ACTION_CATALOG_VERSION),
    id: z.string().regex(/^[a-z][a-z0-9_]{2,60}$/),
    version: z.number().int().min(1),
    category: z.enum(ACTION_CATEGORIES),
    title: LOCALIZED,
    description: LOCALIZED,
    inputs: z.array(actionInputSchema).min(1),
    /** The role an agent should have to take this work. Advisory: assignment is explicit. */
    responsibleRole: z.string().min(2).max(64),
    requiredTools: z.array(z.string().min(2)).min(1),
    requiredIntegrations: z.array(z.string().min(2)),
    approval: z.enum(["none", "required"]),
    workflow: z.array(LOCALIZED).min(1),
    outputs: z.array(LOCALIZED).min(1),
    /** True only when every required tool exists in the worker registry. Derived below. */
    executable: z.boolean(),
  })
  .strict();

export type ActionInput = z.infer<typeof actionInputSchema>;
export type ActionTemplate = z.infer<typeof actionTemplateSchema>;

type TemplateDraft = Omit<ActionTemplate, "schemaVersion" | "executable">;

/**
 * Every template whose tools exist. Nothing here is aspirational: if a tool is missing, the
 * template is not published at all rather than published and broken.
 */
const DRAFTS: TemplateDraft[] = [
  {
    id: "repo_health_report",
    version: 1,
    category: "engineering",
    title: {
      ar: "تقرير صحة المستودع",
      en: "Repository health report",
    },
    description: {
      ar: "يقرأ الفروع وآخر الالتزامات وطلبات الدمج المفتوحة في مستودع مصرّح به، ثم يعيد ملخصًا لما يحتاج انتباهك. قراءة فقط ولا يغيّر شيئًا.",
      en: "Reads branches, recent commits and open pull requests in a repository you have authorised, then summarises what needs attention. Read-only; it changes nothing.",
    },
    inputs: [
      {
        key: "repo",
        type: "repo",
        required: true,
        label: { ar: "المستودع", en: "Repository" },
        help: {
          ar: "بصيغة المالك/الاسم، مثل ZOOKA-AI/chatbot. يجب أن يكون ضمن المستودعات المصرّح بها للعامل.",
          en: "Owner/name, for example ZOOKA-AI/chatbot. It must be one of the repositories the worker is authorised to read.",
        },
        placeholder: "ZOOKA-AI/chatbot",
        pattern: "^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$",
      },
    ],
    responsibleRole: "researcher",
    requiredTools: ["github_repo_inspect"],
    requiredIntegrations: ["github"],
    approval: "none",
    workflow: [
      { ar: "التحقق من أن المستودع ضمن القائمة المصرّح بها", en: "Confirm the repository is on the authorised list" },
      { ar: "قراءة الفروع وآخر الالتزامات وطلبات الدمج المفتوحة", en: "Read branches, recent commits and open pull requests" },
      { ar: "حفظ القراءة كدليل تنفيذ في قاعدة البيانات", en: "Store the reading as execution evidence in the database" },
    ],
    outputs: [
      { ar: "ملخص حالة المستودع", en: "Repository status summary" },
      { ar: "دليل تنفيذ محفوظ يمكن مراجعته", en: "Stored execution evidence you can re-read" },
    ],
  },
  {
    id: "deployment_status_report",
    version: 1,
    category: "engineering",
    title: {
      ar: "تقرير حالة النشر",
      en: "Deployment status report",
    },
    description: {
      ar: "يقرأ حالة آخر نشر لمشروع على فيرسل ونتيجة البناء. قراءة فقط ولا يعيد النشر ولا يغيّر أي إعداد.",
      en: "Reads the latest deployment status and build result for a Vercel project. Read-only; it does not redeploy or change any setting.",
    },
    inputs: [
      {
        key: "project",
        type: "text",
        required: true,
        label: { ar: "اسم المشروع على فيرسل", en: "Vercel project name" },
        help: {
          ar: "اسم المشروع كما يظهر في فيرسل، مثل chatbot. يُطابق حساب فيرسل المرتبط بمساحة العمل.",
          en: "The project name as it appears in Vercel, for example chatbot. Matched against the Vercel account connected to this workspace.",
        },
        placeholder: "chatbot",
      },
    ],
    responsibleRole: "researcher",
    requiredTools: ["vercel_deployment_inspect"],
    requiredIntegrations: ["vercel"],
    approval: "none",
    workflow: [
      { ar: "قراءة آخر نشر للمشروع من فيرسل", en: "Read the project's latest deployment from Vercel" },
      { ar: "قراءة حالة البناء ونتيجته", en: "Read the build state and its result" },
      { ar: "حفظ القراءة كدليل تنفيذ في قاعدة البيانات", en: "Store the reading as execution evidence in the database" },
    ],
    outputs: [
      { ar: "حالة النشر ونتيجة البناء", en: "Deployment state and build result" },
      { ar: "دليل تنفيذ محفوظ يمكن مراجعته", en: "Stored execution evidence you can re-read" },
    ],
  },
];

function publish(draft: TemplateDraft): ActionTemplate {
  const executable = draft.requiredTools.every((tool) => isKnownTool(tool));
  return actionTemplateSchema.parse({
    ...draft,
    schemaVersion: ACTION_CATALOG_VERSION,
    executable,
  });
}

/** Reads specifically. Sorted by category then id so the catalog is stable between renders. */
export const ACTION_TEMPLATES: ActionTemplate[] = DRAFTS.map(publish).sort((a, b) =>
  a.category === b.category ? a.id.localeCompare(b.id) : a.category.localeCompare(b.category)
);

export function listActions(): ActionTemplate[] {
  return ACTION_TEMPLATES;
}

export function findAction(actionId: string): ActionTemplate | null {
  return ACTION_TEMPLATES.find((template) => template.id === actionId) ?? null;
}

export function actionsExecutableBy(assignedTools: string[]): ActionTemplate[] {
  return ACTION_TEMPLATES.filter(
    (template) => template.executable && template.requiredTools.every((tool) => assignedTools.includes(tool))
  );
}

/**
 * Validates customer input against the template's own declaration.
 *
 * Unknown keys are refused rather than ignored: silently dropping a key the customer typed
 * would let a form look successful while the tool ran on different input.
 */
export function parseActionInputs(
  template: ActionTemplate,
  raw: unknown
): { ok: true; inputs: Record<string, string> } | { ok: false; reason: string; detail?: unknown } {
  if (raw !== undefined && (typeof raw !== "object" || raw === null || Array.isArray(raw))) {
    return { ok: false, reason: "inputs_must_be_an_object" };
  }
  const provided = (raw ?? {}) as Record<string, unknown>;
  const declared = new Set(template.inputs.map((input) => input.key));
  const unknown = Object.keys(provided).filter((key) => !declared.has(key));
  if (unknown.length > 0) {
    return { ok: false, reason: "unknown_inputs", detail: unknown };
  }

  const inputs: Record<string, string> = {};
  for (const input of template.inputs) {
    const value = provided[input.key];
    const missing = value === undefined || value === null || String(value).trim() === "";
    if (missing) {
      if (input.required) return { ok: false, reason: `missing_${input.key}` };
      continue;
    }
    const text = String(value).trim();
    if (text.length > 500) return { ok: false, reason: `too_long_${input.key}` };
    if (input.pattern && !new RegExp(input.pattern).test(text)) {
      return { ok: false, reason: `invalid_${input.key}` };
    }
    if (input.type === "number") {
      const numeric = Number(text);
      if (!Number.isFinite(numeric)) return { ok: false, reason: `invalid_${input.key}` };
      if (input.min !== undefined && numeric < input.min) return { ok: false, reason: `invalid_${input.key}` };
      if (input.max !== undefined && numeric > input.max) return { ok: false, reason: `invalid_${input.key}` };
    }
    inputs[input.key] = text;
  }
  return { ok: true, inputs };
}

/** The payload the worker's tool receives. Keys come from the template, nothing else is added. */
export function actionPayload(
  template: ActionTemplate,
  inputs: Record<string, string>
): { tool: string; payload: Record<string, unknown> } {
  const tool = template.requiredTools[0];
  if (tool === "github_repo_inspect") {
    const repo = inputs.repo ?? "";
    return { tool, payload: { repo } };
  }
  if (tool === "vercel_deployment_inspect") {
    return { tool, payload: { project: inputs.project ?? "" } };
  }
  // Unreachable while `executable` is derived from isKnownTool, and refused rather than guessed
  // if a new tool is added to the registry without a mapping here.
  throw new Error(`no payload mapping for tool ${tool}`);
}
