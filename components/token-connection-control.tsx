"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

interface Status {
  configured: boolean;
  connected: boolean;
  accountName: string | null;
  lastError?: string | null;
}

/**
 * Connect control for providers that use a pasted long-lived token
 * (Instagram page token today). It never shows "connected" unless the server
 * proves the token round trip, and it can disconnect (deleting the token).
 */
export function TokenConnectionControl({
  provider,
  label,
  tokenHint,
  canManage,
  lang,
}: {
  provider: string;
  label: string;
  tokenHint: string;
  canManage: boolean;
  lang: "ar" | "en";
}) {
  const isArabic = lang === "ar";
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [token, setToken] = useState("");

  const load = useCallback(async () => {
    const response = await fetch(`/api/integrations/${provider}`);
    if (!response.ok) {
      return;
    }
    setStatus((await response.json()) as Status);
  }, [provider]);

  useEffect(() => {
    load().catch(() => undefined);
    return () => undefined;
  }, [load]);

  const saveToken = async () => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch(`/api/integrations/${provider}/token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const payload = (await response.json().catch(() => ({}))) as Record<
        string,
        unknown
      >;
      if (!response.ok) {
        const code = typeof payload.error === "string" ? payload.error : "";
        const map: Record<string, string> = {
          invalid_token: isArabic
            ? "التوكن قصير جدًا."
            : "That token is too short.",
          token_rejected: isArabic
            ? "المزوّد رفض التوكن."
            : "The provider rejected the token.",
          provider_unreachable: isArabic
            ? "تعذّر الوصول إلى المزوّد."
            : "Could not reach the provider.",
          upgrade_required: isArabic
            ? "الخطة الحالية لا تسمح بربط التكاملات."
            : "Your plan does not allow integrations.",
        };
        setError(map[code] ?? (isArabic ? "تعذّر الحفظ." : "Could not save."));
        return;
      }
      setToken("");
      setShowForm(false);
      setMessage(
        isArabic
          ? `تم ربط ${label}${payload.accountName ? ` · ${String(payload.accountName)}` : ""}`
          : `${label} connected${payload.accountName ? ` · ${String(payload.accountName)}` : ""}`
      );
      await load();
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch(`/api/integrations/${provider}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        setError(
          isArabic ? "تعذّر فصل الحساب." : "Could not disconnect the account."
        );
        return;
      }
      setMessage(isArabic ? "تم فصل الحساب." : "Account disconnected.");
      await load();
    } finally {
      setBusy(false);
    }
  };

  if (!canManage) {
    return (
      <p className="text-muted-foreground text-xs">
        {isArabic
          ? "مالك المساحة أو المسؤول فقط يمكنه الربط."
          : "Only a workspace owner or admin can connect."}
      </p>
    );
  }

  return (
    <div className="flex flex-col items-start gap-2">
      {status?.connected ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-emerald-700 dark:text-emerald-400">
            {isArabic ? "متصل" : "Connected"}
            {status.accountName ? ` · ${status.accountName}` : ""}
          </span>
          <Button disabled={busy} onClick={disconnect} size="sm" variant="outline">
            {isArabic ? "فصل" : "Disconnect"}
          </Button>
        </div>
      ) : showForm ? (
        <div className="flex w-full flex-col gap-2">
          <input
            aria-label={`${label} token`}
            className="bg-background w-full rounded-md border px-2 py-1.5 text-xs"
            onChange={(event) => setToken(event.target.value)}
            placeholder={tokenHint}
            type="password"
            value={token}
          />
          <div className="flex gap-2">
            <Button
              disabled={busy || token.length < 20}
              onClick={saveToken}
              size="sm"
            >
              {busy
                ? isArabic
                  ? "جارٍ التحقّق…"
                  : "Verifying…"
                : isArabic
                  ? "تحقّق واربط"
                  : "Verify and connect"}
            </Button>
            <Button
              onClick={() => {
                setShowForm(false);
                setToken("");
                setError("");
              }}
              size="sm"
              variant="ghost"
            >
              {isArabic ? "إلغاء" : "Cancel"}
            </Button>
          </div>
        </div>
      ) : (
        <Button onClick={() => setShowForm(true)} size="sm" variant="outline">
          {isArabic ? "ربط بتوكن وصول" : "Connect with a token"}
        </Button>
      )}
      {error ? <p className="text-destructive text-xs">{error}</p> : null}
      {message ? (
        <p className="text-xs text-emerald-700 dark:text-emerald-400">
          {message}
        </p>
      ) : null}
    </div>
  );
}
