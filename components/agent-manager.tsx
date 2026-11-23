"use client";

import { useCallback, useEffect, useState } from "react";
import type { Lang } from "@/lib/i18n";

type Agent = {
  id: string;
  slug: string;
  displayName: string;
  role: string;
  status: string;
  environment: string;
  scopes: string[];
  updateWithoutApproval: boolean;
  deleteWithoutApproval: boolean;
  sendMessagesWithoutApproval: boolean;
  spendWithoutApproval: false;
  modelProvider: string | null;
  modelId: string | null;
  allowedTools?: string[] | null;
  instructions: string | null;
};

type ToolEntry = { id: string; summary: string; writes: boolean };
type ProviderEntry = { id: string; credentials: { ok: boolean; reason?: string } };
type HistoryRow = { id: string; title: string; status: string; createdAt: string };

/**
 * Agents, from the server's own catalogue.
 *
 * The tool list and the provider list are fetched, not written here: a tool the worker does
 * not implement, or a provider this deployment holds no credential for, must not appear as a
 * choice the customer can make and then watch fail.
 */
export function AgentManager({ canManage, lang }: { canManage: boolean; lang: Lang }) {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [tools, setTools] = useState<ToolEntry[]>([]);
  const [providers, setProviders] = useState<ProviderEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [editing, setEditing] = useState<Agent | null>(null);
  const [history, setHistory] = useState<Record<string, HistoryRow[]>>({});
  const [openHistory, setOpenHistory] = useState<string | null>(null);

  const [newName, setNewName] = useState("");
  const [newRole, setNewRole] = useState("");
  const [issuedKey, setIssuedKey] = useState<{ slug: string; key: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [queueNote, setQueueNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/agents/registry", { cache: "no-store" });
      if (!response.ok) throw new Error(`load failed (${response.status})`);
      const body = await response.json();
      setAgents(body.agents ?? []);
      setTools(body.tools ?? []);
      setProviders(body.providers ?? []);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "could not load agents");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function create() {
    setBusy(true);
    try {
      const slug = newName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 60);
      const response = await fetch("/api/agents/registry", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ slug, displayName: newName, role: newRole || "worker" }),
      });
      const body = await response.json();
      if (!response.ok) {
        setError(typeof body.reason === "string" ? body.reason : body.error ?? "could not create the agent");
        return;
      }
      // The key is shown once, exactly as the API says. There is no route to read it again.
      // registerAgent returns { agent, key }: the plaintext key exists exactly once.
      setIssuedKey({ slug, key: typeof body.key === "string" ? body.key : "" });
      setNewName("");
      setNewRole("");
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function save(agent: Agent, patch: Record<string, unknown>) {
    const response = await fetch("/api/agents/registry", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ agentId: agent.id, ...patch }),
    });
    const body = await response.json();
    if (!response.ok) {
      setError(typeof body.reason === "string" ? body.reason : body.error ?? "could not save");
      return;
    }
    setError(null);
    setEditing(null);
    await load();
  }

  async function showHistory(agent: Agent) {
    if (openHistory === agent.id) {
      setOpenHistory(null);
      return;
    }
    setOpenHistory(agent.id);
    if (history[agent.id]) return;
    const response = await fetch(`/api/agents/tasks?ownerAgentId=${agent.id}&limit=10`, { cache: "no-store" });
    if (!response.ok) return;
    const body = await response.json();
    setHistory((current) => ({ ...current, [agent.id]: body.tasks ?? [] }));
  }

  /**
   * Runs this workspace's queued tasks and reports what the worker did.
   *
   * Without this the console could create a task and then only watch it sit in `pending`: the
   * queue's only executor was an agent holding a key, and nothing called the scheduling pass.
   */
  const runQueue = useCallback(async () => {
    setBusy(true);
    setQueueNote(null);
    try {
      const response = await fetch("/api/agents/queue/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ limit: 3 }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setQueueNote(body?.error === "forbidden" ? "Owner or admin required." : `Could not run (${response.status}).`);
        return;
      }
      const result = body.result ?? {};
      if (result.ran === false) {
        setQueueNote(result.reason === "overlapping_run" ? "A pass is already running." : "Nothing to run right now.");
      } else if (!result.attempted) {
        setQueueNote("Queue is empty.");
      } else {
        setQueueNote(
          `Ran ${result.attempted}: ${result.succeeded} completed, ${result.failed} failed, ${result.skipped} skipped.`
        );
      }
      await load();
      setHistory({});
      setOpenHistory(null);
    } catch (cause) {
      setQueueNote(cause instanceof Error ? cause.message : "could not run the queue");
    } finally {
      setBusy(false);
    }
  }, [load]);

  /** Replaces an agent's key in place, so the identity keeps its tasks and its tools. */
  const rotateKey = useCallback(async (agent: Agent) => {
    setBusy(true);
    try {
      const response = await fetch("/api/agents/rotate-key", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ agentId: agent.id }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(body?.error === "agent_not_found" ? "That agent is not in this workspace." : `Could not rotate (${response.status}).`);
        return;
      }
      setIssuedKey({ slug: `${agent.slug} (new key)`, key: typeof body.key === "string" ? body.key : "" });
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "could not rotate the key");
    } finally {
      setBusy(false);
    }
  }, []);

  return (
    <div className="flex flex-col gap-6">
      {canManage ? (
        <section className="rounded-lg border p-4">
          <h2 className="mb-2 text-sm font-semibold">New agent</h2>
          <div className="flex flex-wrap gap-2">
            <input
              className="rounded border px-3 py-2 text-sm"
              placeholder="Display name"
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
            />
            <input
              className="rounded border px-3 py-2 text-sm"
              placeholder="Role, e.g. researcher"
              value={newRole}
              onChange={(event) => setNewRole(event.target.value)}
            />
            <button
              type="button"
              onClick={create}
              disabled={busy || newName.length < 2}
              className="rounded bg-black px-4 py-2 text-sm text-white disabled:opacity-40"
            >
              Create agent
            </button>
          </div>
          {issuedKey ? (
            <div className="mt-2 rounded bg-amber-50 p-2 text-xs">
              <p className="font-semibold">Copy this key now. It is never shown again.</p>
              <code className="mt-1 block break-all">{issuedKey.key || "(key not returned)"}</code>
            </div>
          ) : null}
        </section>
      ) : null}

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <section>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">Agents ({agents.length})</h2>
          {canManage ? (
            <button
              type="button"
              onClick={runQueue}
              disabled={busy}
              className="rounded border px-3 py-1 text-xs disabled:opacity-40"
            >
              Run queued work
            </button>
          ) : null}
        </div>
        {queueNote ? <p className="mb-2 text-xs opacity-80">{queueNote}</p> : null}
        {loading ? <p className="text-sm">Loading…</p> : null}
        <ul className="flex flex-col gap-2">
          {agents.map((agent) => (
            <li key={agent.id} className="rounded border p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-medium">
                    {agent.displayName} <span className="text-xs opacity-60">{agent.status}</span>
                  </p>
                  <p className="text-xs opacity-70">
                    {agent.role} · {agent.slug} ·{" "}
                    {/* A stored null and an omitted field mean the same thing: this identity
                        predates tool assignment and still reaches every tool. The list is read
                        defensively because the API omits the field rather than sending null, and
                        an unguarded .length took the whole page down. */}
                    {Array.isArray(agent.allowedTools)
                      ? `${agent.allowedTools.length} tool${agent.allowedTools.length === 1 ? "" : "s"}`
                      : "all tools (legacy, not assigned)"}{" "}
                    ·{" "}
                    {agent.modelProvider
                      ? `${agent.modelProvider}/${agent.modelId ?? "-"} (stored, not used by execution yet)`
                      : "deployment default model"}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => showHistory(agent)} className="rounded border px-2 py-1 text-xs">
                    {openHistory === agent.id ? "Hide history" : "History"}
                  </button>
                  {canManage ? (
                    <>
                      <button
                        type="button"
                        onClick={() => save(agent, { status: agent.status === "active" ? "disabled" : "active" })}
                        className="rounded border px-2 py-1 text-xs"
                      >
                        {agent.status === "active" ? "Disable" : "Enable"}
                      </button>
                      <button
                        type="button"
                        onClick={() => rotateKey(agent)}
                        disabled={busy}
                        className="rounded border px-2 py-1 text-xs disabled:opacity-40"
                      >
                        New key
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditing(editing?.id === agent.id ? null : agent)}
                        className="rounded border px-2 py-1 text-xs"
                      >
                        Edit
                      </button>
                    </>
                  ) : null}
                </div>
              </div>

              {openHistory === agent.id ? (
                <div className="mt-2 border-t pt-2">
                  <p className="mb-1 text-xs font-semibold">Execution history</p>
                  {(history[agent.id] ?? []).length === 0 ? (
                    <p className="text-xs">No tasks have run for this agent yet.</p>
                  ) : (
                    <ul className="flex flex-col gap-1">
                      {(history[agent.id] ?? []).map((row) => (
                        <li key={row.id} className="flex justify-between gap-2 text-xs">
                          <span>{row.title}</span>
                          <span>{row.status}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ) : null}

              {editing?.id === agent.id ? (
                <AgentEditor
                  agent={agent}
                  tools={tools}
                  providers={providers}
                  lang={lang}
                  onCancel={() => setEditing(null)}
                  onSave={(patch) => save(agent, patch)}
                />
              ) : null}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function AgentEditor({
  agent,
  tools,
  providers,
  lang,
  onCancel,
  onSave,
}: {
  agent: Agent;
  tools: ToolEntry[];
  providers: ProviderEntry[];
  lang: Lang;
  onCancel: () => void;
  onSave: (patch: Record<string, unknown>) => void;
}) {
  const [name, setName] = useState(agent.displayName);
  const [instructions, setInstructions] = useState(agent.instructions ?? "");
  const [provider, setProvider] = useState(agent.modelProvider ?? "");
  const [modelId, setModelId] = useState(agent.modelId ?? "");
  const [updateWithoutApproval, setUpdateWithoutApproval] = useState(agent.updateWithoutApproval ?? true);
  const [deleteWithoutApproval, setDeleteWithoutApproval] = useState(agent.deleteWithoutApproval ?? false);
  const [sendMessagesWithoutApproval, setSendMessagesWithoutApproval] = useState(
    agent.sendMessagesWithoutApproval ?? false
  );
  // An omitted or null list is the legacy state: not restricted, still reaching every tool.
  const [restricted, setRestricted] = useState(Array.isArray(agent.allowedTools));
  const [selected, setSelected] = useState<string[]>(agent.allowedTools ?? []);

  const credential = providers.find((entry) => entry.id === provider)?.credentials;

  return (
    <div className="mt-2 flex flex-col gap-2 border-t pt-2 text-xs">
      <input
        className="rounded border px-2 py-1"
        value={name}
        onChange={(event) => setName(event.target.value)}
        aria-label="Agent name"
      />
      <textarea
        className="rounded border px-2 py-1"
        rows={3}
        placeholder="System instructions this agent should follow"
        value={instructions}
        onChange={(event) => setInstructions(event.target.value)}
      />

      <div className="flex flex-wrap items-center gap-2">
        <select
          className="rounded border px-2 py-1"
          value={provider}
          onChange={(event) => setProvider(event.target.value)}
          aria-label="Model provider"
        >
          <option value="">Deployment default</option>
          {providers.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.id}
              {entry.credentials.ok ? "" : " (no credential)"}
            </option>
          ))}
        </select>
        <input
          className="rounded border px-2 py-1"
          placeholder="Model id"
          title="Stored on the agent. Execution does not yet route work to this model; the deployment default is still used."
          value={modelId}
          onChange={(event) => setModelId(event.target.value)}
          aria-label="Model id"
        />
        {provider ? (
          <span className={credential?.ok ? "text-emerald-700" : "text-amber-700"}>
            {credential?.ok ? "credential present" : `credential missing${credential?.reason ? `: ${credential.reason}` : ""}`}
          </span>
        ) : null}
      </div>

      <label className="flex items-center gap-2">
        <input type="checkbox" checked={restricted} onChange={(event) => setRestricted(event.target.checked)} />
        Restrict this agent to specific tools
      </label>

      {restricted ? (
        <div className="flex flex-col gap-1">
          {tools.map((tool) => (
            <label key={tool.id} className="flex items-start gap-2">
              <input
                type="checkbox"
                checked={selected.includes(tool.id)}
                onChange={(event) =>
                  setSelected((current) =>
                    event.target.checked ? [...current, tool.id] : current.filter((id) => id !== tool.id)
                  )
                }
              />
              <span>
                <code>{tool.id}</code> — {tool.summary}
              </span>
            </label>
          ))}
        </div>
      ) : null}

      <section className="flex flex-col gap-2 rounded border p-3" dir={lang === "ar" ? "rtl" : "ltr"}>
        <h3 className="font-semibold">{lang === "ar" ? "الصلاحيات" : "Permissions"}</h3>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={updateWithoutApproval}
            onChange={(event) => setUpdateWithoutApproval(event.target.checked)}
          />
          {lang === "ar" ? "السماح بالتحديث دون موافقة" : "Allow updates without approval"}
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={deleteWithoutApproval}
            onChange={(event) => setDeleteWithoutApproval(event.target.checked)}
          />
          {lang === "ar" ? "السماح بالحذف دون موافقة" : "Allow deletes without approval"}
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={sendMessagesWithoutApproval}
            onChange={(event) => setSendMessagesWithoutApproval(event.target.checked)}
          />
          {lang === "ar" ? "السماح بإرسال الرسائل دون موافقة" : "Allow sending messages without approval"}
        </label>
        <label className="flex items-center gap-2 opacity-70">
          <input type="checkbox" checked={false} disabled />
          {lang === "ar" ? "السماح بالإنفاق دون موافقة (متوقف دائمًا)" : "Allow spending without approval (always off)"}
        </label>
      </section>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() =>
            onSave({
              displayName: name,
              instructions: instructions.trim() === "" ? null : instructions,
              modelProvider: provider === "" ? null : provider,
              modelId: provider === "" ? null : modelId,
              allowedTools: restricted ? selected : null,
              updateWithoutApproval,
              deleteWithoutApproval,
              sendMessagesWithoutApproval,
            })
          }
          disabled={restricted && selected.length === 0}
          className="rounded bg-black px-3 py-1 text-white disabled:opacity-40"
        >
          Save
        </button>
        <button type="button" onClick={onCancel} className="rounded border px-3 py-1">
          Cancel
        </button>
      </div>
    </div>
  );
}
