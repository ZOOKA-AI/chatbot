"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Projects: create one, attach agents, and read back the work it produced.
 *
 * Everything shown here comes from the API. The task list and the execution evidence are the
 * persisted rows, so work that failed is visible as failed and work that never ran stays
 * "pending" rather than being dressed up as progress.
 */

type Project = { id: string; name: string; summary: string | null; status: string; createdAt: string };
type Agent = {
  id: string;
  displayName: string;
  slug: string;
  role: string;
  status: string;
  allowedTools?: string[] | null;
};
type TaskRow = { id: string; title: string; status: string; approvalRequired: boolean; createdAt: string };
type ExecutionRow = {
  id: string;
  status: string;
  tool: string | null;
  resultSummary: string | null;
  error: string | null;
};
type ScheduleRow = { id: string; title: string; cronExpression: string; enabled: boolean };
type Detail = {
  project: Project;
  agents: Agent[];
  tasks: TaskRow[];
  executions: ExecutionRow[];
  schedules: ScheduleRow[];
};

async function call<T>(url: string, init?: RequestInit) {
  const response = await fetch(url, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  const body = (await response.json().catch(() => ({}))) as T & { error?: string; reason?: string; detail?: string };
  return { ok: response.ok, status: response.status, body };
}

export function ProjectConsole({ canManage }: { canManage: boolean }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [name, setName] = useState("");
  const [summary, setSummary] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadProjects = useCallback(async () => {
    const result = await call<{ projects: Project[] }>("/api/workspace/projects");
    if (result.ok) setProjects(result.body.projects ?? []);
    else setMessage(result.body.error ?? "could_not_load_projects");
  }, []);

  const loadDetail = useCallback(async (projectId: string) => {
    const result = await call<Detail>(`/api/workspace/projects/${projectId}`);
    setDetail(result.ok ? result.body : null);
  }, []);

  useEffect(() => {
    void (async () => {
      await loadProjects();
      const registry = await call<{ agents: Agent[] }>("/api/agents/registry");
      if (registry.ok) setAgents(registry.body.agents ?? []);
      setLoading(false);
    })();
  }, [loadProjects]);

  useEffect(() => {
    if (selected) void loadDetail(selected);
  }, [selected, loadDetail]);

  const create = async () => {
    setBusy(true);
    setMessage(null);
    const result = await call<{ project: Project }>("/api/workspace/projects", {
      method: "POST",
      body: JSON.stringify({ name, summary: summary || null }),
    });
    setBusy(false);
    if (!result.ok) {
      setMessage(
        result.body.error === "name_taken"
          ? "يوجد مشروع بهذا الاسم بالفعل / A project with that name already exists"
          : `${result.body.error ?? "could_not_create"}${result.body.reason ? ` (${result.body.reason})` : ""}`
      );
      return;
    }
    setName("");
    setSummary("");
    await loadProjects();
    setSelected(result.body.project.id);
  };

  const rename = async (project: Project) => {
    const next = window.prompt("اسم المشروع / Project name", project.name);
    if (!next) return;
    setBusy(true);
    const result = await call<{ project: Project }>(`/api/workspace/projects/${project.id}`, {
      method: "PATCH",
      body: JSON.stringify({ name: next }),
    });
    setBusy(false);
    setMessage(result.ok ? null : (result.body.error ?? "could_not_update"));
    await loadProjects();
    if (selected) await loadDetail(selected);
  };

  const togglePause = async (project: Project) => {
    setBusy(true);
    const result = await call<{ project: Project }>(`/api/workspace/projects/${project.id}`, {
      method: "PATCH",
      body: JSON.stringify({ status: project.status === "paused" ? "active" : "paused" }),
    });
    setBusy(false);
    setMessage(result.ok ? null : (result.body.error ?? "could_not_update"));
    await loadProjects();
    if (selected) await loadDetail(selected);
  };

  const remove = async (project: Project) => {
    setBusy(true);
    const result = await call<{ mode: string; detail: string }>(`/api/workspace/projects/${project.id}`, {
      method: "DELETE",
    });
    setBusy(false);
    setMessage(result.ok ? (result.body.detail ?? null) : (result.body.error ?? "could_not_remove"));
    await loadProjects();
    if (selected === project.id) {
      setSelected(null);
      setDetail(null);
    }
  };

  const assign = async (agentId: string) => {
    if (!selected) return;
    setBusy(true);
    const result = await call<{ agents: Agent[] }>(`/api/workspace/projects/${selected}/agents`, {
      method: "POST",
      body: JSON.stringify({ agentId }),
    });
    setBusy(false);
    setMessage(result.ok ? null : (result.body.error ?? "could_not_assign"));
    await loadDetail(selected);
  };

  const unassigned = agents.filter((agent) => !detail?.agents.some((assigned) => assigned.id === agent.id));

  return (
    <div className="flex flex-col gap-4">
      {canManage ? (
        <section className="rounded-lg border border-black/10 p-3 dark:border-white/15">
          <h2 className="mb-2 text-sm font-semibold">مشروع جديد / New project</h2>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              aria-label="Project name"
              className="w-full rounded-md border border-black/15 px-3 py-2 text-sm dark:border-white/20 dark:bg-transparent"
              onChange={(event) => setName(event.target.value)}
              placeholder="اسم المشروع / Project name"
              value={name}
            />
            <input
              aria-label="Project summary"
              className="w-full rounded-md border border-black/15 px-3 py-2 text-sm dark:border-white/20 dark:bg-transparent"
              onChange={(event) => setSummary(event.target.value)}
              placeholder="وصف قصير / Short summary"
              value={summary}
            />
            <button
              className="rounded-md bg-[#2E86AB] px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
              disabled={busy || name.trim().length < 2}
              onClick={create}
              type="button"
            >
              إنشاء / Create
            </button>
          </div>
        </section>
      ) : null}

      {message ? <p className="text-xs text-amber-600">{message}</p> : null}

      <section className="rounded-lg border border-black/10 p-3 dark:border-white/15">
        <h2 className="mb-2 text-sm font-semibold">المشاريع / Projects ({projects.length})</h2>
        {loading ? <p className="text-xs opacity-60">…</p> : null}
        {!loading && projects.length === 0 ? (
          <p className="text-xs opacity-60">لا توجد مشاريع بعد / No projects yet.</p>
        ) : null}
        <ul className="flex flex-col gap-2">
          {projects.map((project) => (
            <li
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-black/10 p-2 dark:border-white/10"
              key={project.id}
            >
              <button className="text-start" onClick={() => setSelected(project.id)} type="button">
                <span className="block text-sm font-medium">{project.name}</span>
                <span className="block text-xs opacity-60">
                  {project.status}
                  {project.summary ? ` · ${project.summary}` : ""}
                </span>
              </button>
              {canManage ? (
                <span className="flex flex-wrap gap-2 text-xs">
                  <button className="underline" disabled={busy} onClick={() => rename(project)} type="button">
                    تعديل / Rename
                  </button>
                  <button className="underline" disabled={busy} onClick={() => togglePause(project)} type="button">
                    {project.status === "paused" ? "استئناف / Resume" : "إيقاف / Pause"}
                  </button>
                  <button className="underline text-rose-600" disabled={busy} onClick={() => remove(project)} type="button">
                    إزالة / Remove
                  </button>
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      {detail ? (
        <section className="flex flex-col gap-3 rounded-lg border border-black/10 p-3 dark:border-white/15">
          <h2 className="text-sm font-semibold">
            {detail.project.name} <span className="text-xs opacity-60">({detail.project.status})</span>
          </h2>

          <div>
            <h3 className="mb-1 text-xs font-semibold opacity-70">الوكلاء / Agents ({detail.agents.length})</h3>
            <ul className="flex flex-col gap-1 text-xs">
              {detail.agents.map((agent) => (
                <li key={agent.id}>
                  {agent.displayName} · {agent.role} · {agent.status} ·{" "}
                  {Array.isArray(agent.allowedTools) ? `${agent.allowedTools.length} أداة / tool(s)` : "كل الأدوات (قديم) / all tools (legacy)"}
                </li>
              ))}
              {detail.agents.length === 0 ? <li className="opacity-60">لا وكيل مرتبط / No agent assigned.</li> : null}
            </ul>
            {canManage && unassigned.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-2">
                {unassigned.map((agent) => (
                  <button
                    className="rounded border border-black/15 px-2 py-1 text-xs dark:border-white/20"
                    disabled={busy}
                    key={agent.id}
                    onClick={() => assign(agent.id)}
                    type="button"
                  >
                    إسناد {agent.displayName} / Assign
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <div>
            <h3 className="mb-1 text-xs font-semibold opacity-70">المهام / Tasks ({detail.tasks.length})</h3>
            <ul className="flex flex-col gap-1 text-xs">
              {detail.tasks.map((task) => (
                <li key={task.id}>
                  {task.status} · {task.title}
                  {task.approvalRequired ? " · يحتاج موافقة / approval required" : ""}
                </li>
              ))}
              {detail.tasks.length === 0 ? <li className="opacity-60">لا مهام بعد / No tasks yet.</li> : null}
            </ul>
          </div>

          <div>
            <h3 className="mb-1 text-xs font-semibold opacity-70">
              سجل التنفيذ / Execution evidence ({detail.executions.length})
            </h3>
            <ul className="flex flex-col gap-1 text-xs">
              {detail.executions.map((execution) => (
                <li key={execution.id}>
                  <span className="font-medium">{execution.status}</span> · {execution.tool ?? "—"}
                  {execution.error
                    ? ` · خطأ / error: ${execution.error}`
                    : execution.resultSummary
                      ? ` · ${execution.resultSummary.slice(0, 180)}`
                      : ""}
                </li>
              ))}
              {detail.executions.length === 0 ? (
                <li className="opacity-60">لا تنفيذ مسجّل بعد / Nothing has executed yet.</li>
              ) : null}
            </ul>
          </div>

          <div>
            <h3 className="mb-1 text-xs font-semibold opacity-70">الجداول / Schedules ({detail.schedules.length})</h3>
            <ul className="flex flex-col gap-1 text-xs">
              {detail.schedules.map((schedule) => (
                <li key={schedule.id}>
                  {schedule.enabled ? "مفعّل / active" : "متوقف / paused"} · {schedule.title} · {schedule.cronExpression}
                </li>
              ))}
              {detail.schedules.length === 0 ? <li className="opacity-60">لا جداول مرتبطة / No schedules attached.</li> : null}
            </ul>
          </div>
        </section>
      ) : null}
    </div>
  );
}
