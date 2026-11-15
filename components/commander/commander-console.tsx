"use client";

import { useCallback, useMemo, useState } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Lang } from "@/lib/i18n";

import { copyOf, errorText, formatStamp, statusLabel } from "./copy";
import { canOffer } from "./permissions";

/**
 * The Commander screen.
 *
 * Every number and every row here comes from the server: the initial data is
 * passed in from a server component that read it as the signed-in workspace, and
 * every action below calls the Commander API and then re-reads. There is no local
 * optimism that could show a task as cancelled before the server agreed.
 *
 * Buttons appear only when the action is actually possible for this row and this
 * role. A disabled button that can never work is the thing this screen avoids.
 */

export type CommanderTask = {
  id: string;
  title: string;
  instruction: string;
  status: string;
  priority: string;
  ownerAgentId: string | null;
  approvalRequired: boolean;
  evidence: string | null;
  createdBy: string;
  createdAt: string | Date;
  claimedAt: string | Date | null;
  reportedAt: string | Date | null;
};

export type CommanderApproval = {
  id: string;
  taskId: string | null;
  reason: string;
  status: string;
  requestedBy: string | null;
  decidedBy: string | null;
  decidedAt: string | Date | null;
  createdAt: string | Date;
};

export type CommanderDecision = {
  id: string;
  taskId: string | null;
  title: string;
  body: string;
  state: string;
  createdAt: string | Date;
};

export type CommanderAgent = {
  id: string;
  slug: string;
  displayName: string;
  role: string;
  lastSeenAt: string | Date | null;
};

type Props = {
  lang: Lang;
  canManage: boolean;
  currentUserId: string;
  initialTasks: CommanderTask[];
  initialNextCursor: string | null;
  initialApprovals: CommanderApproval[];
  initialDecisions: CommanderDecision[];
  agents: CommanderAgent[];
};

type Pending =
  | { kind: "cancel"; task: CommanderTask }
  | { kind: "retry"; task: CommanderTask }
  | { kind: "approve"; approval: CommanderApproval }
  | { kind: "reject"; approval: CommanderApproval };

type ApiFailure = { status: number; reason?: string };

async function callApi(path: string, init?: RequestInit): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
    });
  } catch {
    throw { status: 0, reason: "network" } satisfies ApiFailure;
  }

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw {
      status: response.status,
      reason:
        (body as { reason?: string }).reason ??
        (response.status === 401 ? "unauthorized" : response.status === 403 ? "forbidden" : undefined),
    } satisfies ApiFailure;
  }
  return body;
}

/** Groups a task's recorded events so the detail panel can show its own history. */
function historyOf(decisions: CommanderDecision[], taskId: string) {
  return decisions.filter((d) => d.taskId === taskId);
}

export function CommanderConsole({
  lang,
  canManage,
  currentUserId,
  initialTasks,
  initialNextCursor,
  initialApprovals,
  initialDecisions,
  agents,
}: Props) {
  const copy = copyOf(lang);
  const [tasks, setTasks] = useState<CommanderTask[]>(initialTasks);
  const [nextCursor, setNextCursor] = useState<string | null>(initialNextCursor);
  const [loadingMore, setLoadingMore] = useState(false);
  const [approvals, setApprovals] = useState<CommanderApproval[]>(initialApprovals);
  const [decisions, setDecisions] = useState<CommanderDecision[]>(initialDecisions);

  const [tab, setTab] = useState<"history" | "approvals" | "create">("history");
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [reason, setReason] = useState("");
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);

  const [form, setForm] = useState({
    title: "",
    instruction: "",
    priority: "normal",
    approvalRequired: false,
  });

  const agentName = useMemo(() => {
    const map = new Map(agents.map((a) => [a.id, a.displayName || a.slug]));
    return (id: string | null) => (id ? map.get(id) ?? id.slice(0, 8) : "—");
  }, [agents]);

  const taskTitle = useMemo(() => {
    const map = new Map(tasks.map((t) => [t.id, t.title]));
    return (id: string | null) => (id ? map.get(id) ?? id.slice(0, 8) : "—");
  }, [tasks]);

  const refresh = useCallback(async () => {
    setBusy("refresh");
    setFailure(null);
    try {
      const [taskBody, approvalBody, decisionBody] = await Promise.all([
        callApi("/api/agents/tasks?limit=50&paginate=1"),
        callApi("/api/agents/approvals?limit=100"),
        callApi("/api/agents/decisions?limit=200"),
      ]);
      const first = taskBody as { tasks: CommanderTask[]; nextCursor?: string | null };
      setTasks(first.tasks ?? []);
      setNextCursor(first.nextCursor ?? null);
      setApprovals((approvalBody as { approvals: CommanderApproval[] }).approvals ?? []);
      setDecisions((decisionBody as { decisions: CommanderDecision[] }).decisions ?? []);
    } catch (error) {
      setFailure(errorText(lang, (error as ApiFailure).reason));
    } finally {
      setBusy(null);
    }
  }, [lang]);

  async function run(key: string, work: () => Promise<string>) {
    setBusy(key);
    setFailure(null);
    setNotice(null);
    try {
      setNotice(await work());
      await refresh();
    } catch (error) {
      setFailure(errorText(lang, (error as ApiFailure).reason));
    } finally {
      setBusy(null);
    }
  }

  const pendingApprovals = approvals.filter((a) => a.status === "pending");
  /**
   * Fetch the next page and append it.
   *
   * Appended by id, so a row that arrives twice (because it was inserted between
   * two page reads, or because a click landed twice) is shown once. The cursor
   * comes from the server and is passed back untouched.
   */
  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    setFailure(null);
    try {
      const body = (await callApi(
        `/api/agents/tasks?limit=50&paginate=1&cursor=${encodeURIComponent(nextCursor)}`
      )) as { tasks: CommanderTask[]; nextCursor: string | null };
      setTasks((current) => {
        const seen = new Set(current.map((task) => task.id));
        return [...current, ...(body.tasks ?? []).filter((task) => !seen.has(task.id))];
      });
      setNextCursor(body.nextCursor ?? null);
    } catch (error) {
      setFailure(errorText(lang, (error as ApiFailure).reason));
    } finally {
      setLoadingMore(false);
    }
  }, [nextCursor, loadingMore, lang]);

  const openTask = openTaskId ? tasks.find((t) => t.id === openTaskId) ?? null : null;

  function confirmTitle() {
    if (!pending) return "";
    if (pending.kind === "cancel") return copy.confirm.cancelTitle;
    if (pending.kind === "retry") return copy.confirm.retryTitle;
    return pending.kind === "approve" ? copy.confirm.approveTitle : copy.confirm.rejectTitle;
  }

  function confirmBody() {
    if (!pending) return "";
    if (pending.kind === "cancel") return copy.confirm.cancelBody;
    if (pending.kind === "retry") return copy.confirm.retryBody;
    return pending.kind === "approve" ? copy.confirm.approveBody : copy.confirm.rejectBody;
  }

  async function confirm() {
    if (!pending) return;
    const why = reason.trim() || (pending.kind === "cancel" ? "cancelled from the console" : "from the console");
    const target = pending;
    setPending(null);
    setReason("");

    if (target.kind === "cancel") {
      await run(`cancel:${target.task.id}`, async () => {
        await callApi(`/api/agents/tasks/${target.task.id}`, {
          method: "POST",
          body: JSON.stringify({ reason: why }),
        });
        return copy.resultOk.cancelled;
      });
      return;
    }

    if (target.kind === "retry") {
      await run(`retry:${target.task.id}`, async () => {
        await callApi(`/api/agents/tasks/${target.task.id}/retry`, {
          method: "POST",
          body: JSON.stringify({ reason: why }),
        });
        return copy.resultOk.retried;
      });
      return;
    }

    const decision = target.kind === "approve" ? "approved" : "rejected";
    await run(`${decision}:${target.approval.id}`, async () => {
      await callApi(`/api/agents/approvals/${target.approval.id}`, {
        method: "POST",
        body: JSON.stringify({ decision }),
      });
      return decision === "approved" ? copy.resultOk.approved : copy.resultOk.rejected;
    });
  }

  async function createTask(event: React.FormEvent) {
    event.preventDefault();
    await run("create", async () => {
      await callApi("/api/agents/tasks", {
        method: "POST",
        body: JSON.stringify({
          title: form.title.trim(),
          instruction: form.instruction.trim(),
          priority: form.priority,
          approvalRequired: form.approvalRequired,
        }),
      });
      setForm({ title: "", instruction: "", priority: "normal", approvalRequired: false });
      setTab("history");
      return copy.resultOk.created;
    });
  }

  const statusTone = (status: string) =>
    status === "completed"
      ? "default"
      : status === "failed" || status === "rejected"
        ? "destructive"
        : status === "cancelled"
          ? "outline"
          : "secondary";

  return (
    <div dir={lang === "ar" ? "rtl" : "ltr"} className="flex w-full flex-col gap-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="text-start">
          <h1 className="text-2xl font-semibold tracking-tight">{copy.title}</h1>
          <p className="text-sm text-muted-foreground">{copy.subtitle}</p>
        </div>
        <Button variant="outline" onClick={refresh} disabled={busy !== null} aria-busy={busy === "refresh"}>
          {busy === "refresh" ? copy.loading : copy.refresh}
        </Button>
      </header>

      {!canManage ? <p className="text-sm text-muted-foreground">{copy.readOnly}</p> : null}

      {/* One live region for every outcome, so a screen reader hears the result
          of an action without the focus moving. */}
      <div aria-live="polite" role="status" className="min-h-5 text-sm">
        {failure ? <span className="text-destructive">{failure}</span> : notice ? <span>{notice}</span> : null}
      </div>

      <div role="tablist" aria-label={copy.title} className="flex flex-wrap gap-2">
        {(["history", "approvals", "create"] as const).map((key) => (
          <Button
            key={key}
            role="tab"
            aria-selected={tab === key}
            variant={tab === key ? "default" : "outline"}
            onClick={() => setTab(key)}
          >
            {copy.tabs[key]}
            {key === "approvals" && pendingApprovals.length > 0 ? (
              <span className="ms-2 rounded-full bg-primary-foreground/20 px-2 text-xs">
                {pendingApprovals.length}
              </span>
            ) : null}
          </Button>
        ))}
      </div>

      {tab === "history" ? (
        <section role="tabpanel" aria-label={copy.tabs.history} className="flex flex-col gap-3">
          {tasks.length === 0 ? (
            <p className="text-sm text-muted-foreground">{copy.empty.tasks}</p>
          ) : (
            <>
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full min-w-[44rem] text-start text-sm" aria-label={copy.tabs.history}>
                <thead className="bg-muted/50">
                  <tr>
                    <th scope="col" className="p-3 text-start font-medium">{copy.columns.task}</th>
                    <th scope="col" className="p-3 text-start font-medium">{copy.columns.status}</th>
                    <th scope="col" className="p-3 text-start font-medium">{copy.columns.agent}</th>
                    <th scope="col" className="p-3 text-start font-medium">{copy.columns.created}</th>
                    <th scope="col" className="p-3 text-start font-medium">{copy.columns.reported}</th>
                    <th scope="col" className="p-3 text-start font-medium">{copy.actions.view}</th>
                  </tr>
                </thead>
                <tbody>
                  {tasks.map((task) => (
                    <tr key={task.id} className="border-t align-top">
                      <td className="p-3 font-medium">{task.title}</td>
                      <td className="p-3">
                        <Badge variant={statusTone(task.status)}>{statusLabel(lang, task.status)}</Badge>
                      </td>
                      <td className="p-3 text-muted-foreground">{agentName(task.ownerAgentId)}</td>
                      <td className="p-3 text-muted-foreground">{formatStamp(task.createdAt, lang)}</td>
                      <td className="p-3 text-muted-foreground">{formatStamp(task.reportedAt, lang)}</td>
                      <td className="p-3">
                        <Button size="sm" variant="outline" onClick={() => setOpenTaskId(task.id)}>
                          {copy.actions.view}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              {nextCursor ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={loadMore}
                  disabled={loadingMore}
                  aria-busy={loadingMore}
                  aria-label={copy.paging.loadMore}
                >
                  {loadingMore ? copy.paging.loadingMore : copy.paging.loadMore}
                </Button>
              ) : (
                <p className="text-xs text-muted-foreground">{copy.paging.allLoaded}</p>
              )}
              <p className="text-xs text-muted-foreground" aria-live="polite">
                {tasks.length} {copy.paging.shown}
              </p>
            </div>
            </>
          )}
        </section>
      ) : null}

      {tab === "approvals" ? (
        <section role="tabpanel" aria-label={copy.tabs.approvals} className="flex flex-col gap-3">
          {pendingApprovals.length === 0 ? (
            <p className="text-sm text-muted-foreground">{copy.empty.approvals}</p>
          ) : (
            pendingApprovals.map((approval) => (
              <Card key={approval.id} className="flex flex-col gap-2 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium">{taskTitle(approval.taskId)}</p>
                  <Badge variant="secondary">{statusLabel(lang, approval.status)}</Badge>
                </div>
                <p className="text-sm text-muted-foreground">{approval.reason}</p>
                <dl className="grid grid-cols-1 gap-1 text-xs text-muted-foreground sm:grid-cols-3">
                  <div>
                    <dt className="inline font-medium">{copy.approval.requestedBy}: </dt>
                    <dd className="inline">{agentName(approval.requestedBy)}</dd>
                  </div>
                  <div>
                    <dt className="inline font-medium">{copy.columns.created}: </dt>
                    <dd className="inline">{formatStamp(approval.createdAt, lang)}</dd>
                  </div>
                </dl>
                {canOffer("decide", { canManage, status: approval.status }) ? (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      disabled={busy !== null}
                      aria-busy={busy === `approved:${approval.id}`}
                      onClick={() => setPending({ kind: "approve", approval })}
                    >
                      {copy.actions.approve}
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={busy !== null}
                      aria-busy={busy === `rejected:${approval.id}`}
                      onClick={() => setPending({ kind: "reject", approval })}
                    >
                      {copy.actions.reject}
                    </Button>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">{copy.errors.owner_or_admin_required}</p>
                )}
              </Card>
            ))
          )}
        </section>
      ) : null}

      {tab === "create" ? (
        <section role="tabpanel" aria-label={copy.tabs.create}>
          <Card className="p-4">
            <form className="flex flex-col gap-3" onSubmit={createTask}>
              <div className="flex flex-col gap-1">
                <Label htmlFor="cmdr-title">{copy.form.title}</Label>
                <Input
                  id="cmdr-title"
                  value={form.title}
                  maxLength={200}
                  required
                  disabled={!canManage || busy !== null}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor="cmdr-instruction">{copy.form.instruction}</Label>
                <textarea
                  id="cmdr-instruction"
                  value={form.instruction}
                  required
                  rows={4}
                  disabled={!canManage || busy !== null}
                  onChange={(e) => setForm({ ...form, instruction: e.target.value })}
                  className="w-full rounded-md border bg-transparent p-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor="cmdr-priority">{copy.form.priority}</Label>
                <select
                  id="cmdr-priority"
                  value={form.priority}
                  disabled={!canManage || busy !== null}
                  onChange={(e) => setForm({ ...form, priority: e.target.value })}
                  className="w-full rounded-md border bg-transparent p-2 text-sm sm:w-48"
                >
                  {(["low", "normal", "high"] as const).map((p) => (
                    <option key={p} value={p}>
                      {copy.form.priorityValue[p]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-start gap-2">
                <input
                  id="cmdr-approval"
                  type="checkbox"
                  checked={form.approvalRequired}
                  disabled={!canManage || busy !== null}
                  onChange={(e) => setForm({ ...form, approvalRequired: e.target.checked })}
                  className="mt-1 size-4"
                />
                <div className="text-start">
                  <Label htmlFor="cmdr-approval">{copy.form.approvalRequired}</Label>
                  <p className="text-xs text-muted-foreground">{copy.form.approvalRequiredHint}</p>
                </div>
              </div>
              <Button type="submit" disabled={!canManage || busy !== null} aria-busy={busy === "create"}>
                {busy === "create" ? copy.saving : copy.actions.submit}
              </Button>
            </form>
          </Card>
        </section>
      ) : null}

      {openTask ? (
        <Card className="flex flex-col gap-3 p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="text-start">
              <h2 className="text-lg font-semibold">{openTask.title}</h2>
              <p className="text-sm text-muted-foreground">{openTask.instruction}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={statusTone(openTask.status)}>{statusLabel(lang, openTask.status)}</Badge>
              <Button size="sm" variant="outline" onClick={() => setOpenTaskId(null)}>
                {copy.actions.close}
              </Button>
            </div>
          </div>

          <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="font-medium">{copy.columns.agent}</dt>
              <dd className="text-muted-foreground">{agentName(openTask.ownerAgentId)}</dd>
            </div>
            <div>
              <dt className="font-medium">{copy.columns.created}</dt>
              <dd className="text-muted-foreground">{formatStamp(openTask.createdAt, lang)}</dd>
            </div>
            <div>
              <dt className="font-medium">{copy.columns.claimed}</dt>
              <dd className="text-muted-foreground">{formatStamp(openTask.claimedAt, lang)}</dd>
            </div>
            <div>
              <dt className="font-medium">{copy.columns.reported}</dt>
              <dd className="text-muted-foreground">{formatStamp(openTask.reportedAt, lang)}</dd>
            </div>
          </dl>

          {openTask.evidence ? (
            <div>
              <p className="text-sm font-medium">
                {openTask.status === "failed" ? copy.detail.error : copy.columns.evidence}
              </p>
              <p className="whitespace-pre-wrap rounded-md bg-muted/50 p-2 text-sm">{openTask.evidence}</p>
            </div>
          ) : null}

          <div>
            <p className="text-sm font-medium">{copy.detail.history}</p>
            {historyOf(decisions, openTask.id).length === 0 ? (
              <p className="text-sm text-muted-foreground">{copy.empty.history}</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {historyOf(decisions, openTask.id).map((event) => (
                  <li key={event.id} className="rounded-md border p-2 text-sm">
                    <span className="font-medium">{event.title}</span>
                    <span className="text-muted-foreground"> — {formatStamp(event.createdAt, lang)}</span>
                    <p className="text-muted-foreground">{event.body}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {canManage ? (
            <div className="flex flex-wrap gap-2">
              {canOffer("cancel", { canManage, status: openTask.status }) ? (
                <Button
                  variant="destructive"
                  disabled={busy !== null}
                  aria-busy={busy === `cancel:${openTask.id}`}
                  onClick={() => setPending({ kind: "cancel", task: openTask })}
                >
                  {copy.actions.cancel}
                </Button>
              ) : null}
              {canOffer("retry", { canManage, status: openTask.status }) ? (
                <Button
                  variant="outline"
                  disabled={busy !== null}
                  aria-busy={busy === `retry:${openTask.id}`}
                  onClick={() => setPending({ kind: "retry", task: openTask })}
                >
                  {copy.actions.retry}
                </Button>
              ) : null}
            </div>
          ) : null}
        </Card>
      ) : null}

      <AlertDialog open={pending !== null} onOpenChange={(open) => !open && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmTitle()}</AlertDialogTitle>
            <AlertDialogDescription>{confirmBody()}</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex flex-col gap-1">
            <Label htmlFor="cmdr-reason">{copy.confirm.reasonLabel}</Label>
            <Input
              id="cmdr-reason"
              value={reason}
              placeholder={copy.confirm.reasonPlaceholder}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>{copy.actions.close}</AlertDialogCancel>
            <AlertDialogAction onClick={confirm} disabled={busy !== null}>
              {busy ? copy.saving : copy.actions.confirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* The signed-in user is shown nowhere on purpose: this screen never needs
          to display an identity it did not read from the server. */}
      <span className="sr-only" data-current-user={currentUserId} />
    </div>
  );
}
