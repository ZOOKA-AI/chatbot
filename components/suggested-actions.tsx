"use client";

import type { UseChatHelpers } from "@ai-sdk/react";
import { motion } from "framer-motion";
import { memo, useEffect, useState } from "react";
import type { ChatMessage } from "@/lib/types";
import { Suggestion } from "./elements/suggestion";
import type { VisibilityType } from "./visibility-selector";

type SuggestedActionsProps = {
  chatId: string;
  sendMessage: UseChatHelpers<ChatMessage>["sendMessage"];
  selectedVisibilityType: VisibilityType;
};

const SUGGESTIONS_AR = [
  "اكتب لي رد احترافي على عميل يشتكي من تأخر الطلب",
  "لخّص آخر الإيميلات المهمة في بريدي واقترح الردود",
  "حضّر خطة محتوى لأسبوع لمنصات التواصل لشركتي",
  "حلّل ملف مبيعات الشهر وأعطني أهم 5 ملاحظات",
];

const SUGGESTIONS_EN = [
  "Draft a professional reply to a customer complaining about a late order",
  "Summarize my important recent emails and suggest replies",
  "Plan a week of social media content for my business",
  "Analyze this month's sales file and give me the top 5 insights",
];

function PureSuggestedActions({ chatId, sendMessage }: SuggestedActionsProps) {
  const [lang, setLang] = useState<"ar" | "en">("ar");

  useEffect(() => {
    const savedLang = document.cookie
      .split("; ")
      .find((cookie) => cookie.startsWith("zooka_lang="))
      ?.split("=")[1];
    setLang(savedLang === "en" ? "en" : "ar");
  }, []);

  const suggestedActions =
    lang === "en" ? SUGGESTIONS_EN : SUGGESTIONS_AR;

  return (
    <div
      className="flex w-full gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      data-testid="suggested-actions"
    >
      {suggestedActions.map((suggestedAction, index) => (
        <motion.div
          animate={{ opacity: 1, y: 0 }}
          className="shrink-0"
          exit={{ opacity: 0, y: 10 }}
          initial={{ opacity: 0, y: 10 }}
          key={suggestedAction}
          transition={{ delay: 0.04 * index }}
        >
          <Suggestion
            className="zk-neon-hover h-8 max-w-[18rem] truncate rounded-full bg-background/70 px-3 text-xs backdrop-blur"
            onClick={(suggestion) => {
              window.history.pushState({}, "", `/chat/${chatId}`);
              sendMessage({
                role: "user",
                parts: [{ type: "text", text: suggestion }],
              });
            }}
            suggestion={suggestedAction}
            title={suggestedAction}
          >
            {suggestedAction}
          </Suggestion>
        </motion.div>
      ))}
    </div>
  );
}

export const SuggestedActions = memo(
  PureSuggestedActions,
  (prevProps, nextProps) => {
    if (prevProps.chatId !== nextProps.chatId) {
      return false;
    }
    if (prevProps.selectedVisibilityType !== nextProps.selectedVisibilityType) {
      return false;
    }

    return true;
  }
);
