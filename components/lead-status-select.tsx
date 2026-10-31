"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { LEAD_STATUSES, type LeadStatus } from "@/lib/db/leads";

const LABELS: Record<LeadStatus, { ar: string; en: string }> = {
  new: { ar: "جديد", en: "New" },
  qualified: { ar: "مؤهل", en: "Qualified" },
  booked: { ar: "محجوز", en: "Booked" },
  won: { ar: "تم", en: "Won" },
  lost: { ar: "خسارة", en: "Lost" },
};

export function LeadStatusSelect({
  leadId,
  status,
  lang,
}: {
  leadId: string;
  status: LeadStatus;
  lang: "ar" | "en";
}) {
  const router = useRouter();
  const [value, setValue] = useState<LeadStatus>(status);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  const change = async (next: LeadStatus) => {
    const previous = value;
    setValue(next);
    setError("");
    try {
      const response = await fetch(`/api/leads/${leadId}/status`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      if (!response.ok) {
        setValue(previous);
        setError(lang === "ar" ? "لم يُحفظ" : "Not saved");
        return;
      }
      startTransition(() => router.refresh());
    } catch {
      setValue(previous);
      setError(lang === "ar" ? "لم يُحفظ" : "Not saved");
    }
  };

  return (
    <span className="flex flex-col gap-1">
      <select
        aria-label={lang === "ar" ? "حالة الليد" : "Lead status"}
        className="bg-background rounded-md border px-2 py-1 text-xs disabled:opacity-60"
        disabled={pending}
        onChange={(event) => change(event.target.value as LeadStatus)}
        value={value}
      >
        {LEAD_STATUSES.map((option) => (
          <option key={option} value={option}>
            {lang === "ar" ? LABELS[option].ar : LABELS[option].en}
          </option>
        ))}
      </select>
      {error ? <span className="text-destructive text-[10px]">{error}</span> : null}
    </span>
  );
}
