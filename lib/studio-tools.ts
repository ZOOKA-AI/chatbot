import type { LocalProject } from "./studio";

export const MAX_HTML_BYTES = 1024 * 1024;
export const MAX_BACKUP_BYTES = 5 * 1024 * 1024;
export const MAX_PROJECTS = 100;
export const TASK_STORAGE_KEY = "zooka-studio-tasks-v1";
export const taskStages = [
  { id: "todo", label: "للتنفيذ" },
  { id: "doing", label: "قيد العمل" },
  { id: "done", label: "مكتملة" },
] as const;
export type TaskStage = (typeof taskStages)[number]["id"];
export type LocalTask = {
  id: string;
  title: string;
  stage: TaskStage;
  priority: "normal" | "high";
  dueDate: string;
  createdAt: string;
};
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
const byteSize = (value: string) => new TextEncoder().encode(value).length;
export function validateHtmlImport(
  filename: string,
  html: string,
): string | null {
  if (!/\.html?$/i.test(filename)) return "اختر ملفاً بامتداد HTML أو HTM.";
  if (byteSize(html) > MAX_HTML_BYTES)
    return "حجم ملف HTML يجب ألا يتجاوز 1 ميجابايت.";
  if (!html.trim()) return "ملف HTML فارغ.";
  return null;
}
export function createProjectBackup(projects: LocalProject[]): string {
  return JSON.stringify(
    {
      format: "zooka-studio",
      version: 1,
      exportedAt: new Date().toISOString(),
      projects,
    },
    null,
    2,
  );
}
export function readProjectBackup(raw: string): LocalProject[] {
  if (byteSize(raw) > MAX_BACKUP_BYTES)
    throw new Error("حجم النسخة أكبر من 5 ميجابايت.");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("ملف JSON غير صالح.");
  }
  if (
    !record(parsed) ||
    parsed.format !== "zooka-studio" ||
    parsed.version !== 1 ||
    !Array.isArray(parsed.projects)
  ) {
    throw new Error("هذا ليس ملف نسخة احتياطية يدعمه Zooka Studio.");
  }
  if (parsed.projects.length > MAX_PROJECTS)
    throw new Error("الحد الأقصى 100 مشروع في النسخة.");
  const projects: LocalProject[] = [];
  for (const p of parsed.projects) {
    if (
      !record(p) ||
      typeof p.id !== "string" ||
      !p.id ||
      p.id.length > 150 ||
      typeof p.name !== "string" ||
      !p.name.trim() ||
      p.name.length > 100 ||
      typeof p.html !== "string" ||
      byteSize(p.html) > MAX_HTML_BYTES ||
      typeof p.updatedAt !== "string" ||
      !Number.isFinite(Date.parse(p.updatedAt))
    ) {
      throw new Error("النسخة تحتوي مشروعاً غير صالح؛ لم يُستعد أي مشروع.");
    }
    projects.push({
      id: p.id,
      name: p.name,
      html: p.html,
      updatedAt: p.updatedAt,
    });
  }
  return projects;
}
export function parseLocalTasks(raw: string | null): LocalTask[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const ids = new Set<string>();
    return parsed.filter((t): t is LocalTask => {
      if (
        !record(t) ||
        typeof t.id !== "string" ||
        !t.id ||
        ids.has(t.id) ||
        typeof t.title !== "string" ||
        !t.title.trim() ||
        t.title.length > 180 ||
        !taskStages.some((s) => s.id === t.stage) ||
        !["normal", "high"].includes(String(t.priority)) ||
        typeof t.dueDate !== "string" ||
        (t.dueDate !== "" && !/^\d{4}-\d{2}-\d{2}$/.test(t.dueDate)) ||
        typeof t.createdAt !== "string" ||
        !Number.isFinite(Date.parse(t.createdAt))
      )
        return false;
      ids.add(t.id);
      return true;
    });
  } catch {
    return [];
  }
}
