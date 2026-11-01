"use client";
import { useState } from "react";
import {
  PromptInput,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputToolbar,
  PromptInputTools,
} from "@/components/elements/prompt-input";
export default function Check() {
  const [sent, setSent] = useState(0);
  return (
    <main className="flex h-dvh min-w-0 flex-col" dir="rtl">
      <div className="min-h-0 flex-1 overflow-auto">Messages</div>
      <div className="mx-auto w-full max-w-4xl shrink-0 px-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <PromptInput
          className="p-3"
          onSubmit={(e) => {
            e.preventDefault();
            setSent(sent + 1);
          }}
        >
          <PromptInputTextarea defaultValue="اختبار إرسال" />
          <PromptInputToolbar className="min-w-0 items-end gap-2 p-0">
            <PromptInputTools className="min-w-0 flex-1 flex-wrap gap-0 sm:gap-0.5">
              {["الوكيل", "رقّي للوكيل", "🎤", "🔊", "صوتي", "📎"].map((t) => (
                <button type="button" className="h-8 shrink-0 px-2" key={t}>
                  {t}
                </button>
              ))}
              <button type="button" className="h-8 w-[200px] shrink-0 px-2">
                نموذج المحادثة
              </button>
            </PromptInputTools>
            <div className="flex shrink-0 items-center self-end">
              <PromptInputSubmit
                data-testid="send-button"
                className="size-10 shrink-0"
              >
                ↑
              </PromptInputSubmit>
            </div>
          </PromptInputToolbar>
        </PromptInput>
        <output data-testid="sent">{sent}</output>
      </div>
    </main>
  );
}
