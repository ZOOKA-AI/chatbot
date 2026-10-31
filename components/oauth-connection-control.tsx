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
  canManage,
  lang,
}: {
  provider: "github" | "vercel";
  label: string;
  canManage: boolean;
  lang: "ar" | "en";
}) {
  const isArabic = lang === "ar";
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/integrations/${provider}`);
      if (!response.ok) {
        return;
      }
      const data = (await response.json()) as Status;
      setStatus(data);
    } catch {
      // leave the control in its unknown state
    }
  }, [provider]);

  useEffect(() => {
    load().catch(() => undefined);
    return () => undefined;
  }, [load]);

  const disconnect = async () => {
    setBusy(true);
    setError("");
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

  if (!status) {
    return (
      <p className="text-muted-foreground text-xs">
        {isArabic ? "جارٍ التحقّق…" : "Checking…"}
      </p>
    );
  }

  if (!status.configured) {
    return (
      <p className="text-muted-foreground text-xs">
        {isArabic
          ? `لم تُضبط مفاتيح ${label} بعد على السيرفر.`
          : `${label} keys are not configured on the server yet.`}
      </p>
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
    <div className="flex flex-col items-end gap-2">
      {status.connected ? (
        <>
          <p className="text-xs font-medium">
            {isArabic ? "متصل" : "Connected"}
            {status.accountName ? ` · ${status.accountName}` : ""}
          </p>
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
        </>
      ) : (
        <Button asChild size="sm">
          {/* Server route redirects to the provider consent screen. */}
          <a href={`/api/integrations/${provider}/connect`}>
            {isArabic ? `ربط ${label}` : `Connect ${label}`}
          </a>
        </Button>
      )}
      {error ? <p className="text-destructive text-xs">{error}</p> : null}
    </div>
  );
}
