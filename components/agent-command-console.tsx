"use client";

import { useEffect, useRef, useState } from "react";

type CommandInfo = {
  id: string;
  titleAr: string;
  descriptionAr: string;
  minimumRole: string;
  example: string;
  requiresConfiguration: string[];
};

type Turn = {
  id: number;
  command: string;
  ok: boolean;
  message: string;
  data?: unknown;
};

/**
 * Command console: type a sentence, the workspace agent runs one action.
 * No chat, no hidden steps. The catalogue comes from the server so the UI can
 * never advertise a command the API would refuse.
 */
export function AgentCommandConsole() {
  const [catalogue, setCatalogue] = useState<CommandInfo[]>([]);
  const [role, setRole] = useState<string>("member");
  const [input, setInput] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const counter = useRef(0);

  useEffect(() => {
    fetch("/api/agent/commands")
      .then((response) => (response.ok ? response.json() : Promise.reject(response)))
      .then((data: { commands?: CommandInfo[]; role?: string }) => {
        setCatalogue(data.commands ?? []);
        setRole(data.role ?? "member");
      })
      .catch(() => setError("تعذّر تحميل قائمة الأوامر."));
  }, []);

  async function send() {
    const command = input.trim();
    if (!command || busy) return;

    setBusy(true);
    setError(null);
    setInput("");

    try {
      const response = await fetch("/api/agent/commands", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command }),
      });
      const data = (await response.json()) as {
        ok?: boolean;
        message?: string;
        data?: unknown;
      };
      counter.current += 1;
      setTurns((current) => [
        {
          id: counter.current,
          command,
          ok: Boolean(data.ok),
          message: data.message ?? "تم تنفيذ الأمر.",
          data: data.data,
        },
        ...current,
      ]);
    } catch {
      setError("الأمر ماقدرش يوصل للسيرفر.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        <h1 className="font-semibold text-xl">أوامر الوكيل</h1>
        <p className="text-muted-foreground text-sm">
          اكتب أمرًا واحدًا بجملة واحدة. كل أمر ينفّذ إجراءً واحدًا داخل مساحة عملك
          (دورك: {role}).
        </p>
      </header>

      <div className="flex gap-2">
        <input
          className="flex-1 rounded-md border bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          placeholder="مثال: حالة التكاملات"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void send();
            }
          }}
          disabled={busy}
        />
        <button
          className="rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground text-sm disabled:opacity-50"
          type="button"
          onClick={() => void send()}
          disabled={busy || !input.trim()}
        >
          {busy ? "بيشتغل…" : "نفّذ"}
        </button>
      </div>

      {error ? <p className="text-destructive text-sm">{error}</p> : null}

      {turns.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {turns.map((turn) => (
            <li
              className="rounded-md border bg-card p-3 text-sm"
              key={`${turn.id}-${turn.command}`}
            >
              <p className="font-medium">‏{turn.command}</p>
              <p
                className={turn.ok ? "text-sm" : "text-destructive text-sm"}
                style={{ whiteSpace: "pre-wrap" }}
              >
                {turn.message}
              </p>
              {turn.data ? (
                <pre className="mt-2 max-h-48 overflow-auto rounded bg-muted p-2 text-xs">
                  {JSON.stringify(turn.data, null, 2)}
                </pre>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      <section className="flex flex-col gap-2">
        <h2 className="font-medium text-sm">الأوامر المتاحة</h2>
        <ul className="flex flex-col gap-2">
          {catalogue.map((command) => (
            <li className="rounded-md border p-3 text-sm" key={command.id}>
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{command.titleAr}</span>
                <code className="text-muted-foreground text-xs">{command.id}</code>
              </div>
              <p className="text-muted-foreground">{command.descriptionAr}</p>
              <p className="text-xs">مثال: {command.example}</p>
              {command.requiresConfiguration.length > 0 ? (
                <p className="text-muted-foreground text-xs">
                  يحتاج إعداد: {command.requiresConfiguration.join(", ")}
                </p>
              ) : null}
              <button
                className="mt-2 self-start rounded border px-2 py-1 text-xs"
                type="button"
                onClick={() => setInput(command.example)}
              >
                جرّب المثال
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
