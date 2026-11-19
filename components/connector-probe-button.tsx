"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

type ProbeResult = {
  code: string;
  ok: boolean;
  account: string | null;
  detail: Record<string, string | number | boolean | null>;
  latencyMs: number;
  checkedAt: string;
  error: string | null;
};

const CODE_AR: Record<string, string> = {
  ok: "نجح",
  not_connected: "غير مربوط",
  unauthorized: "الاعتماد مرفوض",
  provider_error: "المزوّد رفض الطلب",
  network_error: "تعذّر الوصول",
  timeout: "انتهت المهلة",
  no_probe: "لا يوجد مسار قراءة",
};

const CODE_EN: Record<string, string> = {
  ok: "OK",
  not_connected: "Not connected",
  unauthorized: "Credential rejected",
  provider_error: "Provider refused",
  network_error: "Unreachable",
  timeout: "Timed out",
  no_probe: "No read path",
};

/**
 * "Test now" for one integration.
 *
 * The result line is the provider's answer, not ours: it names the account the
 * provider returned, how long the round trip took and when it ran, or the exact
 * failure code. A button that cannot report a failure is decoration.
 */
export function ConnectorProbeButton({
  provider,
  label,
  lang,
  canManage,
}: {
  provider: string;
  label: string;
  lang: "ar" | "en";
  canManage: boolean;
}) {
  const isArabic = lang === "ar";
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ProbeResult | null>(null);
  const [failure, setFailure] = useState("");

  async function run() {
    setBusy(true);
    setFailure("");
    try {
      const response = await fetch(`/api/integrations/${provider}/probe`, {
        method: "POST",
        headers: { accept: "application/json" },
        cache: "no-store",
      });
      const body = (await response.json()) as ProbeResult | { error?: string };
      if (!("code" in body)) {
        setResult(null);
        setFailure(
          isArabic
            ? `تعذّر تنفيذ الاختبار (${response.status})`
            : `The test could not run (${response.status})`
        );
        return;
      }
      setResult(body);
    } catch (error) {
      setResult(null);
      setFailure(
        isArabic
          ? `تعذّر الوصول للخادم: ${error instanceof Error ? error.message : "خطأ"}`
          : `Could not reach the server: ${error instanceof Error ? error.message : "error"}`
      );
    } finally {
      setBusy(false);
    }
  }

  const time = result
    ? new Date(result.checkedAt).toLocaleTimeString(isArabic ? "ar-AE" : "en-GB", {
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  return (
    <div className="flex flex-col gap-1">
      <Button
        className="w-fit"
        disabled={busy || !canManage}
        onClick={run}
        size="sm"
        type="button"
        variant="outline"
      >
        {busy
          ? isArabic
            ? "جارٍ الاختبار…"
            : "Testing…"
          : isArabic
            ? "اختبر الآن"
            : "Test now"}
      </Button>
      {result ? (
        <p
          className={
            result.ok
              ? "text-[11px] text-emerald-600 dark:text-emerald-400"
              : "text-[11px] text-amber-600 dark:text-amber-400"
          }
        >
          {result.ok
            ? isArabic
              ? `تحقّق فعلي: ${result.account ?? label} · ${result.latencyMs}ms · ${time}`
              : `Verified live: ${result.account ?? label} · ${result.latencyMs}ms · ${time}`
            : isArabic
              ? `${CODE_AR[result.code] ?? result.code}${result.error ? ` — ${result.error}` : ""} · ${time}`
              : `${CODE_EN[result.code] ?? result.code}${result.error ? ` — ${result.error}` : ""} · ${time}`}
        </p>
      ) : null}
      {failure ? (
        <p className="text-[11px] text-amber-600 dark:text-amber-400">{failure}</p>
      ) : null}
    </div>
  );
}
