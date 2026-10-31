"use client";

import { useChat } from "@ai-sdk/react";
import { captureException } from "@sentry/nextjs";
import { DefaultChatTransport } from "ai";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import useSWR, { useSWRConfig } from "swr";
import { unstable_serialize } from "swr/infinite";
import { useBilling } from "@/components/billing-provider";
import { ChatHeader } from "@/components/chat-header";
import { GuestPaywallDialog } from "@/components/guest-paywall-dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useArtifactSelector } from "@/hooks/use-artifact";
import { useAutoResume } from "@/hooks/use-auto-resume";
import { useChatVisibility } from "@/hooks/use-chat-visibility";
import { useGuestQuota } from "@/hooks/use-guest-quota";
import { localizeAgentModeErrorCause } from "@/lib/ai/agent-mode-errors";
import { refreshAgentQuotaIfNeeded } from "@/lib/ai/agent-quota-refresh";
import { modelSupportsTools } from "@/lib/ai/models";
import type { Vote } from "@/lib/db/schema";
import { ChatbotError } from "@/lib/errors";
import type { Attachment, ChatMessage } from "@/lib/types";
import { fetcher, fetchWithErrorHandlers, generateUUID } from "@/lib/utils";
import { speakText, useVoiceMode } from "@/hooks/use-voice-mode";
import { AgentActivity } from "./agent-activity";
import { Artifact } from "./artifact";
import { useDataStream } from "./data-stream-provider";
import { Messages } from "./messages";
import { MultimodalInput } from "./multimodal-input";
import { getChatHistoryPaginationKey } from "./sidebar-history";
import { toast } from "./toast";
import type { VisibilityType } from "./visibility-selector";

export function Chat({
  id,
  initialMessages,
  initialChatModel,
  initialVisibilityType,
  isReadonly,
  autoResume,
}: {
  id: string;
  initialMessages: ChatMessage[];
  initialChatModel: string;
  initialVisibilityType: VisibilityType;
  isReadonly: boolean;
  autoResume: boolean;
}) {
  const router = useRouter();

  const { visibilityType } = useChatVisibility({
    chatId: id,
    initialVisibilityType,
  });

  const { mutate } = useSWRConfig();

  // Handle browser back/forward navigation
  useEffect(() => {
    const handlePopState = () => {
      // When user navigates back/forward, refresh to sync with URL
      router.refresh();
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [router]);
  const { setDataStream } = useDataStream();

  const [input, setInput] = useState<string>("");
  const [showCreditCardAlert, setShowCreditCardAlert] = useState(false);
  const [showPaywall, setShowPaywall] = useState(false);
  const [responseStopped, setResponseStopped] = useState(false);
  const { isGuest, lang, canUseAgentMode, refreshAgentUsage } = useBilling();
  const { voiceMode } = useVoiceMode();
  const lastSpokenRef = useRef<string | null>(null);
  const searchParams = useSearchParams();
  const guestQuota = useGuestQuota();
  const isWorkAssistant = searchParams.get("mode") === "work";
  const [currentModelId, setCurrentModelId] = useState(initialChatModel);
  const [agentMode, setAgentMode] = useState(
    () =>
      searchParams.get("mode") === "work" &&
      canUseAgentMode &&
      modelSupportsTools(initialChatModel)
  );
  const currentModelIdRef = useRef(currentModelId);
  const agentModeRef = useRef(agentMode);
  const agentRunPendingRef = useRef(false);

  useEffect(() => {
    currentModelIdRef.current = currentModelId;
  }, [currentModelId]);
  useEffect(() => {
    agentModeRef.current = agentMode;
  }, [agentMode]);
  useEffect(() => {
    if (!canUseAgentMode && agentMode) {
      setAgentMode(false);
    }
  }, [agentMode, canUseAgentMode]);

  const {
    messages,
    setMessages,
    sendMessage: rawSendMessage,
    status,
    stop,
    regenerate,
    resumeStream,
    addToolApprovalResponse,
  } = useChat<ChatMessage>({
    id,
    messages: initialMessages,
    generateId: generateUUID,
    sendAutomaticallyWhen: ({ messages: currentMessages }) => {
      const lastMessage = currentMessages.at(-1);
      const shouldContinue =
        lastMessage?.parts?.some(
          (part) =>
            "state" in part &&
            part.state === "approval-responded" &&
            "approval" in part &&
            (part.approval as { approved?: boolean })?.approved === true
        ) ?? false;
      return shouldContinue;
    },
    transport: new DefaultChatTransport({
      api: "/api/chat",
      fetch: fetchWithErrorHandlers,
      prepareSendMessagesRequest(request) {
        const lastMessage = request.messages.at(-1);
        const isToolApprovalContinuation =
          lastMessage?.role !== "user" ||
          request.messages.some((msg) =>
            msg.parts?.some((part) => {
              const state = (part as { state?: string }).state;
              return (
                state === "approval-responded" || state === "output-denied"
              );
            })
          );

        return {
          body: {
            id: request.id,
            ...(isToolApprovalContinuation
              ? { messages: request.messages }
              : { message: lastMessage }),
            ...(isGuest && !isToolApprovalContinuation
              ? { history: request.messages.slice(0, -1) }
              : {}),
            selectedChatModel: currentModelIdRef.current,
            selectedVisibilityType: visibilityType,
            agentMode: agentModeRef.current,
            ...request.body,
          },
        };
      },
    }),
    onData: (dataPart) => {
      setDataStream((ds) => (ds ? [...ds, dataPart] : []));
    },
    onFinish: ({ isAbort, isDisconnect, isError }) => {
      const interrupted = isAbort || isDisconnect || isError;
      setResponseStopped(interrupted);
      const completedAgentRun =
        agentRunPendingRef.current || agentModeRef.current;
      agentRunPendingRef.current = false;
      refreshAgentQuotaIfNeeded({
        refresh: () => {
          void refreshAgentUsage().catch(() => undefined);
        },
        agentMode: completedAgentRun,
        completed: !interrupted,
        interrupted,
      });
      if (isGuest) {
        if (guestQuota.isExhausted()) {
          setShowPaywall(true);
        }
        return;
      }
      mutate(unstable_serialize(getChatHistoryPaginationKey));
    },
    onError: (error) => {
      setResponseStopped(true);
      const failedAgentRun = agentRunPendingRef.current || agentModeRef.current;
      agentRunPendingRef.current = false;
      refreshAgentQuotaIfNeeded({
        refresh: () => {
          void refreshAgentUsage().catch(() => undefined);
        },
        agentMode: failedAgentRun,
        error,
      });
      captureException(new Error("Chat stream failed"), {
        tags: { area: "chat-stream" },
      });
      if (error instanceof ChatbotError && error.type === "payment_required") {
        guestQuota.markExhausted();
        setShowPaywall(true);
      } else if (
        error.message?.includes("AI Gateway requires a valid credit card")
      ) {
        setShowCreditCardAlert(true);
      } else if (error instanceof ChatbotError) {
        const cause = localizeAgentModeErrorCause(error.cause, lang);
        toast({
          type: "error",
          description:
            typeof cause === "string"
              ? cause
              : lang === "ar"
                ? "انقطع الرد أو تعذّر إكماله. احتفظنا بالجزء المكتمل؛ أعد المحاولة."
                : "The response was interrupted. The completed text is preserved; please retry.",
        });
      } else {
        toast({
          type: "error",
          description:
            lang === "ar"
              ? "انقطع الرد أو تعذّر إكماله. احتفظنا بالجزء المكتمل؛ أعد المحاولة."
              : "The response was interrupted. The completed text is preserved; please retry.",
        });
      }
    },
  });

  const sendMessage = useCallback<typeof rawSendMessage>(
    (...args) => {
      setResponseStopped(false);
      if (isGuest) {
        if (guestQuota.isExhausted()) {
          setShowPaywall(true);
          return Promise.resolve();
        }
        guestQuota.consume();
      }
      if (!isGuest && agentModeRef.current) {
        agentRunPendingRef.current = true;
      }
      return rawSendMessage(...args);
    },
    [isGuest, guestQuota, rawSendMessage]
  );

  const query = searchParams.get("query");

  const [hasAppendedQuery, setHasAppendedQuery] = useState(false);

  useEffect(() => {
    if (query && !hasAppendedQuery) {
      sendMessage({
        role: "user" as const,
        parts: [{ type: "text", text: query }],
      });

      setHasAppendedQuery(true);
      window.history.replaceState({}, "", `/chat/${id}`);
    }
  }, [query, sendMessage, hasAppendedQuery, id]);

  const { data: votes } = useSWR<Vote[]>(
    messages.length >= 2 && !isGuest ? `/api/vote?chatId=${id}` : null,
    fetcher
  );

  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const isArtifactVisible = useArtifactSelector((state) => state.isVisible);

  useAutoResume({
    autoResume,
    initialMessages,
    resumeStream,
    setMessages,
  });

  // Voice chat: read a finished assistant reply out loud when voice mode is on.
  useEffect(() => {
    if (!voiceMode || status !== "ready") {
      return;
    }
    const lastAssistant = [...messages]
      .reverse()
      .find((message) => message.role === "assistant");
    if (!lastAssistant) {
      return;
    }
    const parts = (lastAssistant.parts ?? []) as {
      type: string;
      text?: string;
    }[];
    const text = parts
      .filter((part) => part.type === "text" && typeof part.text === "string")
      .map((part) => part.text as string)
      .join(" ")
      .trim();
    if (!text) {
      return;
    }
    const key = `${lastAssistant.id}:${text.length}`;
    if (lastSpokenRef.current === key) {
      return;
    }
    lastSpokenRef.current = key;
    speakText(text, lang);
  }, [voiceMode, status, messages, lang]);

  return (
    <>
      <div className="overscroll-behavior-contain flex h-dvh min-w-0 touch-pan-y flex-col bg-background">
        <ChatHeader
          chatId={id}
          isReadonly={isReadonly}
          selectedVisibilityType={initialVisibilityType}
        />

        <Messages
          addToolApprovalResponse={addToolApprovalResponse}
          agentModeEnabled={agentMode && modelSupportsTools(currentModelId)}
          canUseAgentMode={canUseAgentMode}
          chatId={id}
          isArtifactVisible={isArtifactVisible}
          isReadonly={isReadonly}
          isWorkAssistant={isWorkAssistant}
          lang={lang}
          messages={messages}
          onSelectWorkPrompt={setInput}
          responseStopped={responseStopped}
          regenerate={regenerate}
          selectedModelId={initialChatModel}
          setMessages={setMessages}
          status={status}
          votes={votes}
        />

        <div className="sticky bottom-0 z-1 mx-auto flex w-full max-w-4xl gap-2 border-t-0 bg-background px-2 pb-3 md:px-4 md:pb-4">
          {!isReadonly && (
            <MultimodalInput
              agentMode={agentMode}
              attachments={attachments}
              chatId={id}
              input={input}
              messages={messages}
              onAgentModeChange={setAgentMode}
              onModelChange={(modelId) => {
                setCurrentModelId(modelId);
                if (!modelSupportsTools(modelId)) {
                  setAgentMode(false);
                }
              }}
              onRetry={() => {
                setResponseStopped(false);
                regenerate().catch(() => undefined);
              }}
              selectedModelId={currentModelId}
              selectedVisibilityType={visibilityType}
              sendMessage={sendMessage}
              setAttachments={setAttachments}
              setInput={setInput}
              setMessages={setMessages}
              status={status}
              stop={stop}
            />
          )}
        </div>
      </div>

      <Artifact
        addToolApprovalResponse={addToolApprovalResponse}
        agentMode={agentMode}
        attachments={attachments}
        chatId={id}
        input={input}
        isReadonly={isReadonly}
        messages={messages}
        onAgentModeChange={setAgentMode}
        onRetry={() => {
          setResponseStopped(false);
          regenerate().catch(() => undefined);
        }}
        regenerate={regenerate}
        selectedModelId={currentModelId}
        selectedVisibilityType={visibilityType}
        sendMessage={sendMessage}
        setAttachments={setAttachments}
        setInput={setInput}
        setMessages={setMessages}
        status={status}
        stop={stop}
        votes={votes}
      />

      <AgentActivity lang={lang} messages={messages} status={status} />

      <GuestPaywallDialog onOpenChange={setShowPaywall} open={showPaywall} />

      <AlertDialog
        onOpenChange={setShowCreditCardAlert}
        open={showCreditCardAlert}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Activate AI Gateway</AlertDialogTitle>
            <AlertDialogDescription>
              This application requires{" "}
              {process.env.NODE_ENV === "production" ? "the owner" : "you"} to
              activate Vercel AI Gateway.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                window.open(
                  "https://vercel.com/d?to=%2F%5Bteam%5D%2F%7E%2Fai%3Fmodal%3Dadd-credit-card",
                  "_blank"
                );
                window.location.href = "/";
              }}
            >
              Activate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
