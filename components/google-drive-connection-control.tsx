"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export function GoogleDriveConnectionControl({
  configured,
  connected,
  canManage,
  lang,
}: {
  configured: boolean;
  connected: boolean;
  canManage: boolean;
  lang: "ar" | "en";
}) {
  const router = useRouter();
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [error, setError] = useState("");
  const [revocationNotice, setRevocationNotice] = useState(false);
  const isArabic = lang === "ar";

  const disconnect = async () => {
    setIsDisconnecting(true);
    setError("");
    try {
      const response = await fetch("/api/integrations/google-drive", {
        method: "DELETE",
      });
      if (!response.ok) {
        throw new Error("disconnect");
      }
      const result = (await response.json()) as {
        disconnected: boolean;
        revoked: boolean;
      };
      if (!result.disconnected) {
        setError(
          isArabic
            ? "تغيّر الاتصال أثناء الفصل وما زال متصلاً. حاول مجدداً."
            : "The connection changed while disconnecting and is still active. Please try again."
        );
        router.refresh();
        return;
      }
      setRevocationNotice(!result.revoked);
      router.refresh();
    } catch {
      setError(
        isArabic
          ? "تعذّر فصل Google Drive. حاول مجدداً."
          : "Google Drive could not be disconnected. Please try again."
      );
    } finally {
      setIsDisconnecting(false);
    }
  };

  if (!configured) {
    return (
      <div className="flex shrink-0 flex-col items-end gap-1">
        <span className="rounded-full border px-3 py-1 text-xs text-muted-foreground">
          {isArabic ? "غير متاح" : "Unavailable"}
        </span>
        <span className="max-w-56 text-end text-xs text-muted-foreground">
          {isArabic
            ? "يتطلب إعداد بيانات OAuth ومفتاح التشفير على الخادم."
            : "Server OAuth credentials and a token-encryption key are required."}
        </span>
      </div>
    );
  }

  if (connected) {
    return (
      <div className="flex shrink-0 flex-col items-end gap-2">
        <span
          className="rounded-full border px-3 py-1 text-xs"
          data-testid="google-drive-status"
        >
          {isArabic ? "متصل بمساحة العمل" : "Connected to workspace"}
        </span>
        {canManage && (
          <Button
            disabled={isDisconnecting}
            onClick={disconnect}
            size="sm"
            type="button"
            variant="outline"
          >
            {isDisconnecting
              ? isArabic
                ? "جارٍ الفصل…"
                : "Disconnecting…"
              : isArabic
                ? "فصل"
                : "Disconnect"}
          </Button>
        )}
        {error && <span className="text-destructive text-xs">{error}</span>}
      </div>
    );
  }

  if (!canManage) {
    return (
      <span className="max-w-56 text-end text-xs text-muted-foreground">
        {isArabic
          ? "اطلب من مسؤول مساحة العمل إعداد الاتصال."
          : "Ask a workspace admin to connect Google Drive."}
      </span>
    );
  }

  return (
    <div className="flex shrink-0 flex-col items-end gap-2">
      <Button asChild size="sm" variant="outline">
        <Link
          data-testid="google-drive-connect"
          href="/api/integrations/google-drive/connect"
        >
          {isArabic ? "ربط Google Drive" : "Connect Google Drive"}
        </Link>
      </Button>
      {revocationNotice && (
        <p className="max-w-64 text-end text-xs text-muted-foreground">
          {isArabic
            ? "تم الفصل من التطبيق، لكن تعذّر تأكيد الإلغاء لدى Google. أزل وصول Zooka من"
            : "Disconnected in this app, but Google could not confirm revocation. Remove Zooka access from"}{" "}
          <a
            className="underline"
            href="https://myaccount.google.com/permissions"
            rel="noopener noreferrer"
            target="_blank"
          >
            {isArabic ? "أذونات حساب Google" : "Google Account permissions"}
          </a>
          .
        </p>
      )}
    </div>
  );
}
