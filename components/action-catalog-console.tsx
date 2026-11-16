"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

/**
 * The action catalog, in Arabic first.
 *
 * Two rules shape this screen. An action the platform cannot run is shown as unavailable rather
 * than hidden or silently disabled, so the customer knows what exists and what is missing. And a
 * run's state is read back from the task the server created: nothing here can turn a queued task
 * into a finished one, so "waiting for the worker" is said plainly when that is the truth.
 */

type Localized = { ar: string; en: string };

type ActionInput = {
  key: string;
  type: "text" | "repo" | "url" | "number";
  required: boolean;
  label: Localized;
  help: Localized;
  placeholder?: string;
  pattern?: string;
};

type Action = {
  id: string;
  version: number;
  category: string;
  title: Localized;
  description: Localized;
  inputs: ActionInput[];
  responsibleRole: string;
  requiredTools: string[];
  requiredIntegrations: string[];
  approval: "none" | "required";
  workflow: Localized[];
  outputs: Localized[];
  executable: boolean;
  ready: boolean;
};

type Project = { id: string; name: string };
type ProjectAgent = { id: string; displayName: string; status: string; allowedTools?: string[] | null };
type TaskDetail = {
  task: { id: string; title: string; status: string };
  line: string;
  evidence: { present: boolean; tool: string | null; summary: unknown };
  error: string | null;
};
type RunResult = {
  taskId: string;
  status: string;
  approvalRequired: boolean;
  project: { id: string; name: string };
  agent: { id: string; displayName: string };
  action: { id: string; version: number };
  tool: string;
};

const CATEGORIES: { id: string; ar: string; en: string }[] = [
  { id: "all", ar: "الكل", en: "All" },
  { id: "engineering", ar: "الهندسة والتقنية", en: "Engineering" },
  { id: "research", ar: "البحث", en: "Research" },
  { id: "marketing", ar: "التسويق", en: "Marketing" },
  { id: "operations", ar: "التشغيل", en: "Operations" },
  { id: "design", ar: "التصميم", en: "Design" },
];

const TERMINAL = new Set(["completed", "failed", "cancelled", "canceled", "rejected", "timed_out"]);

async function call<T>(url: string, init?: RequestInit) {
  const response = await fetch(url, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  const body = (await response.json().catch(() => ({}))) as T & { error?: string; detail?: string; reason?: string };
  return { ok: response.ok, status: response.status, body };
}

export function ActionCatalogConsole({ canManage }: { canManage: boolean }) {
  const [actions, setActions] = useState<Action[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [agents, setAgents] = useState<ProjectAgent[]>([]);
  const [category, setCategory] = useState("all");
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [projectId, setProjectId] = useState("");
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [run, setRun] = useState<RunResult | null>(null);
  const [detail, setDetail] = useState<TaskDetail | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [catalog, projectList] = await Promise.all([
      call<{ actions: Action[] }>("/api/actions"),
      call<{ projects: Project[] }>("/api/workspace/projects"),
    ]);
    if (catalog.ok) setActions(catalog.body.actions ?? []);
    if (projectList.ok) {
      setProjects(projectList.body.projects ?? []);
      setProjectId((current) => current || (projectList.body.projects?.[0]?.id ?? ""));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Which agents on the chosen project could take each action is decided by the server's own
  // assignment data, not by a guess here.
  useEffect(() => {
    if (!projectId) {
      setAgents([]);
      return;
    }
    void (async () => {
      const result = await call<{ agents: ProjectAgent[] }>(`/api/workspace/projects/${projectId}/agents`);
      setAgents(result.ok ? (result.body.agents ?? []) : []);
    })();
  }, [projectId]);

  const openAction = actions.find((action) => action.id === openId) ?? null;

  const eligibleAgent = useMemo(() => {
    if (!openAction) return null;
    const tool = openAction.requiredTools[0];
    return (
      agents.find(
        (agent) => agent.status === "active" && Array.isArray(agent.allowedTools) && agent.allowedTools.includes(tool)
      ) ?? null
    );
  }, [agents, openAction]);

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return actions.filter((action) => {
      if (category !== "all" && action.category !== category) return false;
      if (!needle) return true;
      return [action.title.ar, action.title.en, action.description.ar, action.description.en, action.id]
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }, [actions, category, search]);

  const start = (action: Action) => {
    setOpenId(action.id);
    setInputs({});
    setMessage(null);
    setRun(null);
    setDetail(null);
  };

  const execute = async () => {
    if (!openAction) return;
    setRunning(true);
    setMessage(null);
    setRun(null);
    setDetail(null);

    const result = await call<RunResult>(`/api/actions/${openAction.id}/run`, {
      method: "POST",
      body: JSON.stringify({ projectId, inputs }),
    });
    setRunning(false);
    if (!result.ok) {
      setMessage(`${result.body.error ?? "could_not_run"}${result.body.detail ? ` — ${result.body.detail}` : ""}`);
      return;
    }
    setRun(result.body);

    // Read the real task back until it reaches a terminal state. No invented progress: if the
    // worker has not claimed it, the panel says it is waiting.
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const state = await call<TaskDetail>(`/api/agents/tasks/${result.body.taskId}`);
      if (!state.ok) break;
      setDetail(state.body);
      if (TERMINAL.has(state.body.task.status)) break;
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
  };

  return (
    <div className="flex flex-col gap-4" dir="rtl">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <input
          aria-label="Search actions"
          className="w-full rounded-md border border-black/15 px-3 py-2 text-sm dark:border-white/20 dark:bg-transparent"
          onChange={(event) => setSearch(event.target.value)}
          placeholder="ابحث عن إجراء… / Search actions"
          value={search}
        />
        <div className="flex flex-wrap gap-1">
          {CATEGORIES.map((entry) => (
            <button
              className={`rounded-full border px-3 py-1 text-xs ${
                category === entry.id
                  ? "border-[#2E86AB] bg-[#2E86AB] text-white"
                  : "border-black/15 dark:border-white/20"
              }`}
              key={entry.id}
              onClick={() => setCategory(entry.id)}
              type="button"
            >
              {entry.ar} <span className="opacity-60">/ {entry.en}</span>
            </button>
          ))}
        </div>
      </div>

      {loading ? <p className="text-xs opacity-60">…</p> : null}
      {!loading && visible.length === 0 ? (
        <p className="text-xs opacity-60">لا إجراء يطابق بحثك / No action matches your search.</p>
      ) : null}

      <ul className="flex flex-col gap-2">
        {visible.map((action) => {
          const available = action.executable;
          return (
            <li className="rounded-lg border border-black/10 p-3 dark:border-white/15" key={action.id}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold">{action.title.ar}</h3>
                  <p className="text-xs opacity-60">{action.title.en}</p>
                  <p className="mt-1 text-xs">{action.description.ar}</p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1 text-xs">
                  <span
                    className={`rounded-full px-2 py-0.5 ${
                      available
                        ? action.ready
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-amber-100 text-amber-800"
                        : "bg-black/10 text-black/60 dark:bg-white/10 dark:text-white/60"
                    }`}
                  >
                    {!available
                      ? "غير متاح بعد / Not available yet"
                      : action.ready
                        ? "جاهز / Ready"
                        : "يحتاج وكيلًا بالأداة / Needs an agent with the tool"}
                  </span>
                  <span className="opacity-60">v{action.version}</span>
                </div>
              </div>

              <dl className="mt-2 grid grid-cols-1 gap-1 text-xs sm:grid-cols-2">
                <div>
                  <dt className="inline font-medium opacity-70">الأداة / Tool: </dt>
                  <dd className="inline">{action.requiredTools.join(", ")}</dd>
                </div>
                <div>
                  <dt className="inline font-medium opacity-70">التكاملات / Integrations: </dt>
                  <dd className="inline">{action.requiredIntegrations.join(", ") || "—"}</dd>
                </div>
                <div>
                  <dt className="inline font-medium opacity-70">الدور / Role: </dt>
                  <dd className="inline">{action.responsibleRole}</dd>
                </div>
                <div>
                  <dt className="inline font-medium opacity-70">الموافقة / Approval: </dt>
                  <dd className="inline">
                    {action.approval === "required" ? "مطلوبة / required" : "غير مطلوبة / not required"}
                  </dd>
                </div>
              </dl>

              <div className="mt-2 flex flex-wrap items-center gap-2">
                <button
                  className="rounded-md border border-[#2E86AB] px-3 py-1 text-xs text-[#2E86AB]"
                  onClick={() => start(action)}
                  type="button"
                >
                  التفاصيل والتشغيل / Open
                </button>
              </div>

              {openId === action.id ? (
                <div className="mt-3 flex flex-col gap-2 border-t border-black/10 pt-3 dark:border-white/10">
                  <div>
                    <h4 className="text-xs font-semibold opacity-70">الخطوات / What it does</h4>
                    <ol className="list-inside list-decimal text-xs">
                      {action.workflow.map((step, index) => (
                        <li key={index}>{step.ar}</li>
                      ))}
                    </ol>
                  </div>
                  <div>
                    <h4 className="text-xs font-semibold opacity-70">المخرجات / Outputs</h4>
                    <ul className="list-inside list-disc text-xs">
                      {action.outputs.map((output, index) => (
                        <li key={index}>{output.ar}</li>
                      ))}
                    </ul>
                  </div>

                  <label className="text-xs">
                    <span className="mb-1 block font-semibold opacity-70">المشروع / Project</span>
                    <select
                      aria-label="Project"
                      className="w-full rounded-md border border-black/15 px-2 py-1 text-sm dark:border-white/20 dark:bg-transparent"
                      onChange={(event) => setProjectId(event.target.value)}
                      value={projectId}
                    >
                      <option value="">— اختر مشروعًا / Choose a project —</option>
                      {projects.map((project) => (
                        <option key={project.id} value={project.id}>
                          {project.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  {action.inputs.map((input) => (
                    <label className="text-xs" key={input.key}>
                      <span className="mb-1 block font-semibold opacity-70">
                        {input.label.ar} <span className="opacity-60">/ {input.label.en}</span>
                        {input.required ? " *" : ""}
                      </span>
                      <input
                        aria-label={input.label.en}
                        className="w-full rounded-md border border-black/15 px-2 py-1 text-sm dark:border-white/20 dark:bg-transparent"
                        onChange={(event) =>
                          setInputs((current) => ({ ...current, [input.key]: event.target.value }))
                        }
                        placeholder={input.placeholder ?? ""}
                        value={inputs[input.key] ?? ""}
                      />
                      <span className="mt-1 block opacity-60">{input.help.ar}</span>
                    </label>
                  ))}

                  <p className="text-xs opacity-70">
                    الوكيل / Agent:{" "}
                    {eligibleAgent
                      ? eligibleAgent.displayName
                      : projectId
                        ? "لا وكيل على هذا المشروع يملك الأداة / no agent on this project holds the tool"
                        : "اختر مشروعًا أولًا / choose a project first"}
                  </p>

                  <button
                    className="w-fit rounded-md bg-[#2E86AB] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                    disabled={running || !canManage || !action.executable || !projectId || !eligibleAgent}
                    onClick={execute}
                    type="button"
                  >
                    {running ? "جارٍ الإنشاء… / Creating…" : "تشغيل / Run"}
                  </button>
                  {!canManage ? (
                    <p className="text-xs opacity-60">التشغيل يحتاج صلاحية مالك أو مدير / Running needs owner or admin.</p>
                  ) : null}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>

      {message ? <p className="text-xs text-rose-600">{message}</p> : null}

      {run ? (
        <section className="rounded-lg border border-black/10 p-3 text-xs dark:border-white/15">
          <h3 className="mb-1 text-sm font-semibold">حالة التنفيذ / Run status</h3>
          <p>
            المهمة / Task: <span className="font-mono">{run.taskId.slice(0, 8)}</span> · {run.project.name} ·{" "}
            {run.agent.displayName} · {run.tool}
          </p>
          {detail ? (
            <>
              <p className="mt-1">
                الحالة / State: <span className="font-semibold">{detail.task.status}</span>
                {detail.line ? ` — ${detail.line}` : ""}
              </p>
              {detail.error ? <p className="mt-1 text-rose-600">خطأ / Error: {detail.error}</p> : null}
              {detail.evidence.present ? (
                <details className="mt-1">
                  <summary className="cursor-pointer opacity-70">الدليل / Evidence</summary>
                  <pre className="mt-1 max-h-56 overflow-auto whitespace-pre-wrap rounded bg-black/5 p-2 text-[11px] dark:bg-white/10">
                    {JSON.stringify(detail.evidence.summary, null, 2)}
                  </pre>
                </details>
              ) : (
                <p className="mt-1 opacity-60">
                  {TERMINAL.has(detail.task.status)
                    ? "لا دليل محفوظ لهذه المحاولة / no evidence stored for this attempt"
                    : "بانتظار الوكيل لينفّذ المهمة / waiting for the worker to execute this task"}
                </p>
              )}
            </>
          ) : (
            <p className="mt-1 opacity-60">…</p>
          )}
        </section>
      ) : null}
    </div>
  );
}
