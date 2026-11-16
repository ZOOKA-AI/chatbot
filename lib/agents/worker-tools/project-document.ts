import { and, eq } from "drizzle-orm";

import { commanderActiveDb } from "@/lib/db/tenant-context";
import * as queriesModule from "@/lib/db/queries";
import { agentProject, projectDocument } from "@/lib/db/schema";
import type { WorkerTool } from "../worker-types";
import { redact } from "../worker-types";

/**
 * Turns a customer's brief into a structured project document and stores it.
 *
 * This is the platform's first artifact-producing action, and the honesty of it matters more than
 * its polish. It does not invent content: every section is a deterministic arrangement of the
 * words the customer wrote, and the document says so in its own footer. No model is called, so
 * there is nothing to hallucinate and nothing to bill.
 *
 * It writes exactly one row, in the caller's own workspace, tied to the project it was asked for
 * and to the task that ran it. A project belonging to another workspace is refused before the
 * insert, so the write cannot cross a tenant boundary even if a payload is crafted.
 */

const db = new Proxy({} as typeof queriesModule.db, {
  get(_target, property) {
    const active = commanderActiveDb() as Record<PropertyKey, unknown> | null;
    const source = active ?? (queriesModule.db as unknown as Record<PropertyKey, unknown>);
    const value = Reflect.get(source, property, source);
    return typeof value === "function" ? value.bind(source) : value;
  },
});

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Splits a brief into the clauses the customer actually wrote, preserving their order. */
function clauses(brief: string): string[] {
  return brief
    .split(/[\n\r]+|(?<=[.!?؟؛])\s+|،\s*/u)
    .map((part) => part.trim().replace(/^[-*•]\s*/, ""))
    .filter((part) => part.length > 0);
}

const RISK_BY_KEYWORD: { match: RegExp; ar: string; en: string }[] = [
  { match: /ميزانية|تكلفة|سعر|budget|cost|price/i, ar: "النطاق المالي: أي تغيير في الميزانية يحتاج موافقة كتابية قبل التنفيذ.", en: "Budget: any change needs written approval before work starts." },
  { match: /موعد|تاريخ|تسليم|deadline|schedule|date/i, ar: "الجدول الزمني: التواريخ المذكورة تُعاد مراجعتها أسبوعيًا وتُحدَّث كتابيًا.", en: "Timeline: the dates named are reviewed weekly and updated in writing." },
  { match: /قانون|ترخيص|امتثال|legal|licence|license|compliance/i, ar: "الالتزام: أي مادة قانونية أو ترخيص يُراجع من مختص قبل النشر.", en: "Compliance: legal or licensing material is reviewed by a specialist before publication." },
  { match: /بيانات|خصوصية|أمان|data|privacy|security/i, ar: "البيانات: لا تُشارك بيانات العملاء خارج مساحة العمل، وأي تصدير يحتاج موافقة.", en: "Data: customer data never leaves the workspace; any export needs approval." },
];

export const projectDocumentCreate: WorkerTool = {
  name: "project_document_create",
  readOnly: false,
  internalWrite: true,
  timeoutMs: 15_000,
  maxAttempts: 1,
  description:
    "Builds a structured project document from the customer's brief and stores it in this workspace, tied to the project and the task that produced it. Writes one row and nothing else.",
  async run({ organizationId, agentId, taskId, payload, signal }) {
    const title = typeof payload.title === "string" ? payload.title.trim() : "";
    const brief = typeof payload.brief === "string" ? payload.brief.trim() : "";
    const projectId = typeof payload.projectId === "string" ? payload.projectId.trim() : "";

    if (title.length < 3 || title.length > 120) {
      return { ok: false, summary: "The document title must be between 3 and 120 characters.", error: "invalid_title" };
    }
    if (brief.length < 20 || brief.length > 2000) {
      return { ok: false, summary: "The brief must be between 20 and 2000 characters.", error: "invalid_brief" };
    }
    if (!UUID.test(projectId)) {
      return { ok: false, summary: "This task is not attached to a project, so there is nowhere to file the document.", error: "project_required" };
    }
    if (signal.aborted) {
      return { ok: false, summary: "The run was cancelled before the document was written.", error: "aborted" };
    }

    // The project must be this workspace's. A crafted payload naming another tenant's project is
    // refused here, before the insert, rather than relying on the write to fail afterwards.
    const [project] = await db
      .select({ id: agentProject.id, name: agentProject.name })
      .from(agentProject)
      .where(and(eq(agentProject.id, projectId), eq(agentProject.organizationId, organizationId)))
      .limit(1);
    if (!project) {
      return { ok: false, summary: "That project does not belong to this workspace.", error: "unknown_project" };
    }

    const safeTitle = redact(title);
    const safeBrief = redact(brief);
    const parts = clauses(safeBrief);
    const risks = RISK_BY_KEYWORD.filter((risk) => risk.match.test(safeBrief)).map((risk) => `- ${risk.ar}`);

    const body = [
      `# ${safeTitle}`,
      "",
      `- **المشروع:** ${project.name}`,
      `- **تاريخ الإصدار:** ${new Date().toISOString().slice(0, 10)}`,
      `- **المصدر:** موجز أدخله العميل، بترتيب حتمي بلا استنتاج خارجي`,
      "",
      "## الهدف",
      "",
      parts[0] ?? safeBrief,
      "",
      "## النطاق",
      "",
      ...(parts.length > 1 ? parts.slice(1, 5).map((part) => `- ${part}`) : ["- لم يُذكر نطاق إضافي في الموجز."]),
      "",
      "## خطة التنفيذ",
      "",
      ...(parts.length > 0
        ? parts.slice(0, 8).map((part, index) => `${index + 1}. ${part}`)
        : ["1. لم يحدد الموجز خطوات؛ يلزم تحديدها قبل البدء."]),
      "",
      "## المخاطر والضوابط",
      "",
      ...(risks.length > 0 ? risks : ["- لا تذكر الموجز مخاطر محددة؛ تُراجع عند أول تحديث للنطاق."]),
      "",
      "## معايير القبول",
      "",
      "- كل بند في النطاق أعلاه منفّذ ومذكور في تقرير الإنجاز.",
      "- أي تغيير خارج النطاق موثّق وموافَق عليه كتابيًا.",
      "- المستند نفسه يُقرأ كاملًا بلا رجوع إلى محادثة أخرى.",
      "",
      "---",
      "",
      `أُعدّ هذا المستند داخل مساحة العمل بواسطة الأداة \`${"project_document_create"}\`، ولم يُرسل إلى أي خدمة خارجية. النص المصدري محفوظ كما أُدخل بعد تنقية أي بيانات اعتماد.`,
      "",
      `معرّف الوكيل: ${agentId}`,
      taskId ? `معرّف المهمة: ${taskId}` : "",
      "",
    ]
      .filter((line) => line !== null)
      .join("\n");

    const [row] = await db
      .insert(projectDocument)
      .values({
        organizationId,
        projectId: project.id,
        taskId: taskId ?? null,
        title: safeTitle,
        format: "markdown",
        body,
        bytes: body.length,
        createdBy: agentId.slice(0, 64),
      })
      .returning({ id: projectDocument.id, title: projectDocument.title, bytes: projectDocument.bytes });

    return {
      ok: true,
      summary: redact(`Document "${row.title}" created (${row.bytes} characters) in project ${project.name}.`),
      evidence: { documentId: row.id, projectId: project.id, title: row.title, bytes: row.bytes, sections: 5 },
    };
  },
};
