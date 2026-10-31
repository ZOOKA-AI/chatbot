"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

interface Status {
  configured: boolean;
  connected: boolean;
  accountName: string | null;
}

export function OAuthConnectionControl({
  provider,
  label,
  tokenHint,
  canManage,
  lang,
}: {
  provider: "github" | "vercel";
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
  const [showTokenForm, setShowTokenForm] = useState(false);
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
      await load();
    } catch {
      setError(
        isArabic ? "تعذّر فصل الحساب." : "Could not disconnect the account."
      );
    } finally {
      setBusy(false);
    }
  };

  const saveToken = async () => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch(`/api/integrations/${provider}/token`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = (await response.json()) as {
        connected?: boolean;
        accountName?: string | null;
        encryptedRoundTrip?: boolean;
        error?: string;
      };
      if (!response.ok) {
        const messages: Record<string, { ar: string; en: string }> = {
          token_rejected: {
            ar: "التوكن مرفوض من المزوّد. تأكد من الصلاحيات.",
            en: "The provider rejected the token. Check its scopes.",
          },
          upgrade_required: {
            ar: "ربط التكاملات متاح في الباقات المدفوعة.",
            en: "Connecting integrations requires a paid plan.",
          },
          provider_unreachable: {
            ar: "تعذّر الوصول للمزوّد. أعد المحاولة.",
            en: "Could not reach the provider. Try again.",
          },
          invalid_token: {
            ar: "التوكن قصير جدًا أو غير صالح.",
            en: "The token looks too short or invalid.",
          },
        };
        const selected = messages[data.error ?? ""] ?? {
          ar: "تعذّر الحفظ. راجع التوكن.",
          en: "Could not save. Check the token.",
        };
        setError(isArabic ? selected.ar : selected.en);
        return;
      }
      setToken("");
      setShowTokenForm(false);
      setMessage(
        isArabic
          ? `تم ربط ${label}${data.accountName ? ` بحساب ${data.accountName}` : ""} وتشفير التوكن.`
          : `${label} connected${data.accountName ? ` as ${data.accountName}` : ""} and encrypted.`
      );
      await load();
    } catch {
      setError(isArabic ? "تعذّر الحفظ." : "Could not save.");
    } finally {
      setBusy(false);
    }
  };

  if (!status) {
    return (
      <p className="text-muted-foreground text-xs">
        {isArabic ? "جارٍ التحقّق…" : "Checking…"}
      </p>
    );
  }

  if (status.connected) {
    return (
      <div className="flex flex-col items-start gap-2 rounded-md border border-emerald-600/30 p-3">
        <p className="text-xs font-medium">
          {isArabic ? "متصل" : "Connected"}
          {status.accountName ? ` · ${status.accountName}` : ""}
        </p>
        {canManage ? (
          <Button
            disabled={busy}
            onClick={disconnect}
            size="sm"
            variant="outline"
          >
            {busy
              ? isArabic
                ? "جارٍ الفصل…"
                : "Disconnecting…"
              : isArabic
                ? "فصل الحساب"
                : "Disconnect"}
          </Button>
        ) : null}
        {message ? (
          <p className="text-xs text-emerald-700 dark:text-emerald-400">
            {message}
          </p>
        ) : null}
      </div>
    );
  }

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
      {status.configured ? (
        <Button asChild size="sm">
          <a href={`/api/integrations/${provider}/connect`}>
            {isArabic ? `ربط ${label} بضغطة` : `Connect ${label}`}
          </a>
        </Button>
      ) : null}
      {showTokenForm ? (
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
                  ? "جارٍ الحفظ…"
                  : "Saving…"
                : isArabic
                  ? "حفظ التوكن"
                  : "Save token"}
            </Button>
            <Button
              onClick={() => {
                setShowTokenForm(false);
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
        <Button
          onClick={() => setShowTokenForm(true)}
          size="sm"
          variant="outline"
        >
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
