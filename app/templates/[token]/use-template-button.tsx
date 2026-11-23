"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function UseAgentTemplateButton({ token }: { token: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function useTemplate() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/templates/${encodeURIComponent(token)}`, { method: "POST" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(response.status === 404 ? "This template is no longer available." : "Could not copy this template.");
        return;
      }
      router.push("/workspace/agents");
    } catch {
      setError("Could not copy this template.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <button
        className="w-fit rounded bg-black px-4 py-2 text-sm text-white disabled:opacity-50"
        disabled={busy}
        onClick={useTemplate}
        type="button"
      >
        {busy ? "Copying…" : "Use this template"}
      </button>
      {error ? <p className="text-sm text-red-600" role="alert">{error}</p> : null}
    </div>
  );
}
