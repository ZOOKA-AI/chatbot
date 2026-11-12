"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";

type KeySummary = {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  lastUsedAt: string | null;
};

export function McpKeysManager({
  initialKeys,
  lang,
}: {
  initialKeys: KeySummary[];
  lang: "ar" | "en";
}) {
  const ar = lang === "ar";
  const [keys, setKeys] = useState<KeySummary[]>(initialKeys);
  const [name, setName] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function createKey() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/mcp/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name || (ar ? "مفتاح MCP" : "MCP key") }),
      });
      const data = (await response.json()) as {
        key?: KeySummary;
        token?: string;
        error?: string;
      };
      if (!response.ok || !data.key || !data.token) {
        setError(
          data.error === "forbidden"
            ? ar
              ? "هذه الصلاحية للمالك والمدير فقط."
              : "Only owners and admins can create keys."
            : ar
              ? "تعذّر إنشاء المفتاح."
              : "Could not create the key."
        );
        return;
      }
      setKeys([data.key, ...keys]);
      setToken(data.token);
      setName("");
    } catch {
      setError(ar ? "تعذّر الاتصال." : "Request failed.");
    } finally {
      setBusy(false);
    }
  }

  async function revoke(id: string) {
    setBusy(true);
    try {
      const response = await fetch(`/api/mcp/keys?id=${id}`, {
        method: "DELETE",
      });
      if (response.ok) {
        setKeys(keys.filter((key) => key.id !== id));
      }
    } finally {
      setBusy(false);
    }
  }

  const config = token
    ? JSON.stringify(
        {
          mcpServers: {
            zooka: {
              type: "http",
              url: "https://zooka-ai.com/api/mcp",
              headers: { Authorization: `Bearer ${token}` },
            },
          },
        },
        null,
        2
      )
    : null;

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3 rounded-2xl border p-5">
        <h2 className="font-semibold">
          {ar ? "مفتاح جديد" : "New key"}
        </h2>
        <p className="text-muted-foreground text-sm">
          {ar
            ? "المفتاح يمنح عميل MCP وصولاً لبيانات مساحة العمل هذه فقط، ويُخصم من رصيد التوكنز عند كل استدعاء."
            : "A key grants an MCP client access to this workspace only, and each tool call is charged to the token balance."}
        </p>
        <div className="flex flex-wrap gap-2">
          <Input
            className="max-w-xs"
            onChange={(event) => setName(event.target.value)}
            placeholder={ar ? "الاسم، مثال: Claude Desktop" : "Name, e.g. Claude Desktop"}
            value={name}
          />
          <button
            className="inline-flex h-10 items-center rounded-md bg-foreground px-4 font-medium text-background text-sm disabled:opacity-50"
            disabled={busy}
            onClick={() => void createKey()}
            type="button"
          >
            {ar ? "إنشاء مفتاح" : "Create key"}
          </button>
        </div>
        {error ? (
          <p className="text-destructive text-sm" role="alert">
            {error}
          </p>
        ) : null}
      </section>

      {token && config ? (
        <section className="flex flex-col gap-3 rounded-2xl border border-emerald-500/40 bg-emerald-500/5 p-5">
          <h2 className="font-semibold">
            {ar ? "انسخه الآن، لن يظهر مرة أخرى" : "Copy it now, it won't show again"}
          </h2>
          <code className="break-all rounded-md bg-background p-3 text-xs" dir="ltr">
            {token}
          </code>
          <button
            className="inline-flex h-9 w-fit items-center rounded-md border px-3 text-sm"
            onClick={() => {
              void navigator.clipboard.writeText(token);
              setCopied(true);
            }}
            type="button"
          >
            {copied ? (ar ? "تم النسخ" : "Copied") : ar ? "نسخ المفتاح" : "Copy key"}
          </button>
          <p className="text-muted-foreground text-xs">
            {ar ? "إعداد جاهز لعميل MCP:" : "Ready-to-paste MCP client config:"}
          </p>
          <pre
            className="overflow-auto rounded-md bg-background p-3 text-xs"
            dir="ltr"
          >
            {config}
          </pre>
        </section>
      ) : null}

      <section className="flex flex-col gap-3">
        <h2 className="font-semibold">{ar ? "المفاتيح النشطة" : "Active keys"}</h2>
        {keys.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            {ar ? "لا مفاتيح بعد." : "No keys yet."}
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {keys.map((key) => (
              <li
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border p-4 text-sm"
                key={key.id}
              >
                <div className="flex flex-col">
                  <span className="font-medium">{key.name}</span>
                  <span className="text-muted-foreground text-xs" dir="ltr">
                    {key.prefix}…
                    {key.lastUsedAt
                      ? ar
                        ? ` · آخر استخدام ${new Date(key.lastUsedAt).toLocaleDateString("ar-AE")}`
                        : ` · last used ${new Date(key.lastUsedAt).toLocaleDateString("en-AE")}`
                      : ar
                        ? " · لم يُستخدم"
                        : " · never used"}
                  </span>
                </div>
                <button
                  className="rounded-md border px-3 py-1.5 text-xs hover:bg-accent disabled:opacity-50"
                  disabled={busy}
                  onClick={() => void revoke(key.id)}
                  type="button"
                >
                  {ar ? "إلغاء" : "Revoke"}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
