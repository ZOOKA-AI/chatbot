"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

export function N8nConnectionControl({ lang }: { lang: "ar" | "en" }) {
  const isArabic = lang === "ar";
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [connected, setConnected] = useState(false);
  const [savedUrl, setSavedUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    fetch("/api/integrations/n8n")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!active || !data) return;
        setConnected(Boolean(data.connected));
        setSavedUrl(data.baseUrl ?? null);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  const save = async () => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/integrations/n8n", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ baseUrl, apiKey }),
      });
      const data = (await response.json()) as {
        connected?: boolean;
        baseUrl?: string;
        workflowCount?: number;
        error?: string;
      };
      if (!response.ok) {
        setError(
          data.error === "upgrade_required"
            ? isArabic
              ? "ربط n8n متاح في الباقات المدفوعة."
              : "Connecting n8n requires a paid plan."
            : data.error === "unauthorized"
              ? isArabic
                ? "المفتاح مرفوض من السيرفر (401). تأكد من المفتاح."
                : "The server rejected the key (401)."
              : data.error === "unreachable"
                ? isArabic
                  ? "تعذّر الوصول للسيرفر. راجع الرابط."
                  : "Could not reach the server. Check the URL."
                : isArabic
                  ? "تعذّر الحفظ. راجع البيانات."
                  : "Could not save. Check the details."
        );
        return;
      }
      setConnected(true);
      setSavedUrl(data.baseUrl ?? baseUrl);
      setApiKey("");
      setMessage(
        isArabic
          ? `تم الربط بنجاح. الوكيل يقدر يشغّل الـworkflows على سيرفرك.`
          : "Connected. The agent can now trigger workflows on your server."
      );
    } catch {
      setError(isArabic ? "خطأ في الشبكة." : "Network error.");
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await fetch("/api/integrations/n8n", { method: "DELETE" });
      setConnected(false);
      setSavedUrl(null);
      setMessage(isArabic ? "تم فصل السيرفر." : "Server disconnected.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-w-0 flex-col gap-3">
      {connected ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm">
            <span className="font-medium">
              {isArabic ? "متصل:" : "Connected:"}
            </span>{" "}
            <span className="break-all font-mono text-xs">{savedUrl}</span>
          </p>
          <Button disabled={busy} onClick={disconnect} size="sm" variant="outline">
            {isArabic ? "فصل" : "Disconnect"}
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <input
            className="rounded-md border bg-transparent px-3 py-2 text-sm"
            onChange={(event) => setBaseUrl(event.target.value)}
            placeholder="https://your-instance.n8n.cloud"
            value={baseUrl}
          />
          <input
            className="rounded-md border bg-transparent px-3 py-2 font-mono text-sm"
            onChange={(event) => setApiKey(event.target.value)}
            placeholder={isArabic ? "مفتاح API الخاص بسيرفرك" : "Your n8n API key"}
            type="password"
            value={apiKey}
          />
          <Button
            className="self-start"
            disabled={busy || !baseUrl.trim() || apiKey.trim().length < 20}
            onClick={save}
            size="sm"
          >
            {isArabic ? "تحقق واربط" : "Verify and connect"}
          </Button>
        </div>
      )}
      {message ? <p className="text-green-600 text-xs">{message}</p> : null}
      {error ? <p className="text-destructive text-xs">{error}</p> : null}
    </div>
  );
}
