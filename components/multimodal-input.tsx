"use client";

import type { UseChatHelpers } from "@ai-sdk/react";
import Link from "next/link";
import type { UIMessage } from "ai";
import equal from "fast-deep-equal";
import { CheckIcon } from "lucide-react";
import {
  type ChangeEvent,
  type Dispatch,
  memo,
  type SetStateAction,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import { useLocalStorage, useWindowSize } from "usehooks-ts";
import {
  ModelSelector,
  ModelSelectorContent,
  ModelSelectorGroup,
  ModelSelectorInput,
  ModelSelectorItem,
  ModelSelectorList,
  ModelSelectorLogo,
  ModelSelectorName,
  ModelSelectorTrigger,
} from "@/components/ai-elements/model-selector";
import { useBilling } from "@/components/billing-provider";
import { VoiceInputButton } from "@/components/voice-input-button";
import { useVoiceMode } from "@/hooks/use-voice-mode";
import { agentPresets } from "@/lib/ai/agent-presets";
import {
  chatModels,
  DEFAULT_CHAT_MODEL,
  modelSupportsTools,
  modelsByProvider,
} from "@/lib/ai/models";
import type { Attachment, ChatMessage } from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  PromptInput,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputToolbar,
  PromptInputTools,
} from "./elements/prompt-input";
import { ArrowUpIcon, PaperclipIcon, StopIcon } from "./icons";
import { PreviewAttachment } from "./preview-attachment";
import { SuggestedActions } from "./suggested-actions";
import { Button } from "./ui/button";
import type { VisibilityType } from "./visibility-selector";

function setCookie(name: string, value: string) {
  const maxAge = 60 * 60 * 24 * 365; // 1 year
  // biome-ignore lint/suspicious/noDocumentCookie: needed for client-side cookie setting
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${maxAge}`;
}

function PureMultimodalInput({
  chatId,
  input,
  setInput,
  status,
  stop,
  attachments,
  setAttachments,
  messages,
  setMessages,
  sendMessage,
  className,
  selectedVisibilityType,
  selectedModelId,
  onModelChange,
  agentMode,
  onAgentModeChange,
  onRetry,
}: {
  chatId: string;
  input: string;
  setInput: Dispatch<SetStateAction<string>>;
  status: UseChatHelpers<ChatMessage>["status"];
  stop: () => void;
  attachments: Attachment[];
  setAttachments: Dispatch<SetStateAction<Attachment[]>>;
  messages: UIMessage[];
  setMessages: UseChatHelpers<ChatMessage>["setMessages"];
  sendMessage: UseChatHelpers<ChatMessage>["sendMessage"];
  className?: string;
  selectedVisibilityType: VisibilityType;
  selectedModelId: string;
  onModelChange?: (modelId: string) => void;
  agentMode: boolean;
  onAgentModeChange: (enabled: boolean) => void;
  onRetry: () => void;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { width } = useWindowSize();
  const { canUseAgentMode, hasAgentPlan, agentRunsRemaining, lang } =
    useBilling();
  const { voiceMode, toggleVoiceMode } = useVoiceMode();
  const agentModeAllowed =
    canUseAgentMode && modelSupportsTools(selectedModelId);
  let agentModeUnavailableMessage: string;
  if (!modelSupportsTools(selectedModelId)) {
    agentModeUnavailableMessage =
      lang === "ar"
        ? "اختر نموذجاً يدعم الأدوات لاستخدام وضع الوكيل."
        : "Choose a tool-capable model to use Agent mode.";
  } else if (hasAgentPlan) {
    agentModeUnavailableMessage =
      lang === "ar"
        ? "تم بلوغ الحد الشهري لتشغيلات الوكيل. راجع الباقة والاستخدام."
        : "Monthly agent run limit reached. See Plan and usage.";
  } else {
    agentModeUnavailableMessage =
      lang === "ar"
        ? "يتطلب وضع الوكيل خطة Pro أو Business."
        : "Agent mode requires a Pro or Business plan.";
  }
  let agentModeTooltip = agentModeUnavailableMessage;
  if (agentModeAllowed) {
    agentModeTooltip =
      lang === "ar"
        ? `متبقي ${agentRunsRemaining.toLocaleString(lang)} من تشغيلات الوكيل هذا الشهر.`
        : `${agentRunsRemaining.toLocaleString(lang)} agent runs remaining this month.`;
  }

  const adjustHeight = useCallback(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "44px";
    }
  }, []);

  useEffect(() => {
    if (textareaRef.current) {
      adjustHeight();
    }
  }, [adjustHeight]);

  const hasAutoFocused = useRef(false);
  useEffect(() => {
    if (!hasAutoFocused.current && width) {
      const timer = setTimeout(() => {
        textareaRef.current?.focus();
        hasAutoFocused.current = true;
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [width]);

  const resetHeight = useCallback(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "44px";
    }
  }, []);

  const [localStorageInput, setLocalStorageInput] = useLocalStorage(
    "input",
    ""
  );

  useEffect(() => {
    if (textareaRef.current) {
      const domValue = textareaRef.current.value;
      // Prefer DOM value over localStorage to handle hydration
      const finalValue = domValue || localStorageInput || "";
      setInput(finalValue);
      adjustHeight();
    }
    // Only run once after hydration
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adjustHeight, localStorageInput, setInput]);

  useEffect(() => {
    setLocalStorageInput(input);
  }, [input, setLocalStorageInput]);

  const handleInput = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(event.target.value);
  };

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadQueue, setUploadQueue] = useState<string[]>([]);

  const submitForm = useCallback(() => {
    const workMode =
      new URLSearchParams(window.location.search).get("mode") === "work"
        ? "?mode=work"
        : "";
    window.history.pushState({}, "", `/chat/${chatId}${workMode}`);

    sendMessage({
      role: "user",
      parts: [
        ...attachments.map((attachment) => ({
          type: "file" as const,
          url: attachment.url,
          name: attachment.name,
          mediaType: attachment.contentType,
        })),
        {
          type: "text",
          text: input,
        },
      ],
    });

    setAttachments([]);
    setLocalStorageInput("");
    resetHeight();
    setInput("");

    if (width && width > 768) {
      textareaRef.current?.focus();
    }
  }, [
    input,
    setInput,
    attachments,
    sendMessage,
    setAttachments,
    setLocalStorageInput,
    width,
    chatId,
    resetHeight,
  ]);

  const submitText = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) {
        return;
      }
      sendMessage({
        role: "user",
        parts: [{ type: "text", text: trimmed }],
      });
      setAttachments([]);
      setLocalStorageInput("");
      resetHeight();
      setInput("");
    },
    [sendMessage, setAttachments, setLocalStorageInput, resetHeight, setInput]
  );

  const handleVoiceTranscript = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) {
        return;
      }
      if (voiceMode && status !== "streaming" && status !== "submitted") {
        submitText(trimmed);
        return;
      }
      setInput((previous) =>
        previous.trim() ? `${previous.trim()} ${trimmed}` : trimmed
      );
      if (width && width > 768) {
        textareaRef.current?.focus();
      }
    },
    [voiceMode, status, submitText, setInput, width]
  );

  const uploadFile = useCallback(async (file: File) => {
    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await fetch("/api/files/upload", {
        method: "POST",
        body: formData,
      });

      if (response.ok) {
        const data = await response.json();
        const { url, pathname, contentType } = data;

        return {
          url,
          name: pathname,
          contentType,
        };
      }
      const { error } = await response.json();
      toast.error(error);
    } catch (_error) {
      toast.error("Failed to upload file, please try again!");
    }
  }, []);

  const handleFileChange = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files || []);

      setUploadQueue(files.map((file) => file.name));

      try {
        const uploadPromises = files.map((file) => uploadFile(file));
        const uploadedAttachments = await Promise.all(uploadPromises);
        const successfullyUploadedAttachments = uploadedAttachments.filter(
          (attachment) => attachment !== undefined
        );

        setAttachments((currentAttachments) => [
          ...currentAttachments,
          ...successfullyUploadedAttachments,
        ]);
      } catch (error) {
        console.error("Error uploading files!", error);
      } finally {
        setUploadQueue([]);
      }
    },
    [setAttachments, uploadFile]
  );

  const handlePaste = useCallback(
    async (event: ClipboardEvent) => {
      const items = event.clipboardData?.items;
      if (!items) {
        return;
      }

      const imageItems = Array.from(items).filter((item) =>
        item.type.startsWith("image/")
      );

      if (imageItems.length === 0) {
        return;
      }

      // Prevent default paste behavior for images
      event.preventDefault();

      setUploadQueue((prev) => [...prev, "Pasted image"]);

      try {
        const uploadPromises = imageItems
          .map((item) => item.getAsFile())
          .filter((file): file is File => file !== null)
          .map((file) => uploadFile(file));

        const uploadedAttachments = await Promise.all(uploadPromises);
        const successfullyUploadedAttachments = uploadedAttachments.filter(
          (attachment) =>
            attachment !== undefined &&
            attachment.url !== undefined &&
            attachment.contentType !== undefined
        );

        setAttachments((curr) => [
          ...curr,
          ...(successfullyUploadedAttachments as Attachment[]),
        ]);
      } catch (error) {
        console.error("Error uploading pasted images:", error);
        toast.error("Failed to upload pasted image(s)");
      } finally {
        setUploadQueue([]);
      }
    },
    [setAttachments, uploadFile]
  );

  // Add paste event listener to textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) {
      return;
    }

    textarea.addEventListener("paste", handlePaste);
    return () => textarea.removeEventListener("paste", handlePaste);
  }, [handlePaste]);

  return (
    <div className={cn("relative flex w-full flex-col gap-4", className)}>
      {messages.length === 0 &&
        !agentMode &&
        attachments.length === 0 &&
        uploadQueue.length === 0 && (
          <SuggestedActions
            chatId={chatId}
            selectedVisibilityType={selectedVisibilityType}
            sendMessage={sendMessage}
          />
        )}

      <input
        className="pointer-events-none fixed -top-4 -left-4 size-0.5 opacity-0"
        multiple
        onChange={handleFileChange}
        ref={fileInputRef}
        tabIndex={-1}
        type="file"
      />

      <PromptInput
        className="rounded-xl border border-border bg-background p-3 shadow-xs transition-all duration-200 focus-within:border-border hover:border-muted-foreground/50"
        onSubmit={(event) => {
          event.preventDefault();
          if (!input.trim() && attachments.length === 0) {
            return;
          }
          if (status === "submitted" || status === "streaming") {
            toast.error("Please wait for the model to finish its response!");
          } else {
            submitForm();
          }
        }}
      >
        {agentMode && messages.length === 0 && (
          <div className="grid gap-2" data-testid="agent-presets">
            <p className="px-2 text-sm font-medium">
              {lang === "ar"
                ? "ابدأ بمهمة جاهزة، وعدّلها قبل الإرسال:"
                : "Start with a task template and edit it before sending:"}
            </p>
            <fieldset
              aria-label={
                lang === "ar" ? "مهام الوكيل الجاهزة" : "Agent task templates"
              }
              className="flex flex-wrap gap-2 px-2"
            >
              {agentPresets.map((preset) => {
                const modelName = chatModels.find(
                  (model) => model.id === preset.modelId
                )?.name;

                return (
                  <Button
                    data-testid={`agent-preset-${preset.id}`}
                    key={preset.id}
                    onClick={() => {
                      onModelChange?.(preset.modelId);
                      setInput(preset.prompt[lang]);
                      textareaRef.current?.focus();
                    }}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    {preset.label[lang]}
                    {modelName ? (
                      <span className="text-muted-foreground text-xs">
                        · {modelName}
                      </span>
                    ) : null}
                  </Button>
                );
              })}
            </fieldset>
          </div>
        )}
        {(attachments.length > 0 || uploadQueue.length > 0) && (
          <div
            className="flex flex-row items-end gap-2 overflow-x-scroll"
            data-testid="attachments-preview"
          >
            {attachments.map((attachment) => (
              <PreviewAttachment
                attachment={attachment}
                key={attachment.url}
                onRemove={() => {
                  setAttachments((currentAttachments) =>
                    currentAttachments.filter((a) => a.url !== attachment.url)
                  );
                  if (fileInputRef.current) {
                    fileInputRef.current.value = "";
                  }
                }}
              />
            ))}

            {uploadQueue.map((filename) => (
              <PreviewAttachment
                attachment={{
                  url: "",
                  name: filename,
                  contentType: "",
                }}
                isUploading={true}
                key={filename}
              />
            ))}
          </div>
        )}
        {status === "error" && (
          <div
            className="flex items-center justify-between gap-3 px-2 text-sm text-destructive"
            role="alert"
          >
            <span>
              {lang === "ar"
                ? "انقطع الرد. يمكنك إعادة المحاولة؛ سيبقى النص المكتمل."
                : "Response interrupted. Retry while keeping completed text."}
            </span>
            <Button
              className="shrink-0"
              data-testid="retry-response"
              onClick={onRetry}
              type="button"
              variant="outline"
            >
              {lang === "ar" ? "إعادة المحاولة" : "Retry"}
            </Button>
          </div>
        )}
        <div className="flex flex-row items-start gap-1 sm:gap-2">
          <PromptInputTextarea
            className="grow resize-none border-0! border-none! bg-transparent p-2 text-base outline-none ring-0 [-ms-overflow-style:none] [scrollbar-width:none] placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0 [&::-webkit-scrollbar]:hidden"
            data-testid="multimodal-input"
            disableAutoResize={true}
            maxHeight={200}
            minHeight={44}
            onChange={handleInput}
            placeholder="Send a message..."
            ref={textareaRef}
            rows={1}
            value={input}
          />
        </div>
        <PromptInputToolbar className="border-top-0! border-t-0! p-0 shadow-none dark:border-0 dark:border-transparent!">
          <PromptInputTools className="gap-0 sm:gap-0.5">
            <Button
              aria-pressed={agentMode}
              className="h-8 px-2"
              data-testid="agent-mode-toggle"
              disabled={!agentModeAllowed}
              onClick={() => onAgentModeChange(!agentMode)}
              title={agentModeTooltip}
              type="button"
              variant={agentMode ? "default" : "ghost"}
            >
              {lang === "ar" ? "الوكيل" : "Agent"}
            </Button>
            {!(canUseAgentMode || hasAgentPlan) && (
              <Link
                className="px-1 text-muted-foreground text-xs underline underline-offset-2 hover:text-foreground"
                href="/pricing"
              >
                {lang === "ar" ? "رقّي للوكيل" : "Unlock agent"}
              </Link>
            )}
            <VoiceInputButton
              disabled={uploadQueue.length > 0}
              lang={lang}
              onTranscript={handleVoiceTranscript}
            />
            <Button
              aria-pressed={voiceMode}
              className="h-8 px-2 text-xs"
              data-testid="voice-mode-toggle"
              onClick={toggleVoiceMode}
              title={
                lang === "ar"
                  ? "المحادثة الصوتية: إرسال تلقائي بعد التسجيل وقراءة الرد بصوت عالٍ"
                  : "Voice chat: auto-send recordings and read replies aloud"
              }
              type="button"
              variant={voiceMode ? "default" : "ghost"}
            >
              {lang === "ar" ? "صوتي" : "Voice"}
            </Button>
            <AttachmentsButton
              fileInputRef={fileInputRef}
              selectedModelId={selectedModelId}
              status={status}
            />
            <ModelSelectorCompact
              onModelChange={onModelChange}
              selectedModelId={selectedModelId}
            />
          </PromptInputTools>

          {status === "submitted" ? (
            <StopButton setMessages={setMessages} stop={stop} />
          ) : (
            <PromptInputSubmit
              className="size-8 rounded-full bg-primary text-primary-foreground transition-colors duration-200 hover:bg-primary/90 disabled:bg-muted disabled:text-muted-foreground"
              data-testid="send-button"
              disabled={!input.trim() || uploadQueue.length > 0}
              status={status}
            >
              <ArrowUpIcon size={14} />
            </PromptInputSubmit>
          )}
        </PromptInputToolbar>
        {agentModeAllowed ? (
          agentMode ? (
            <p
              className="px-2 pt-2 text-xs text-muted-foreground"
              data-testid="agent-mode-usage"
            >
              {lang === "ar"
                ? `يستخدم هذا الطلب تشغيلاً من حصة مساحة العمل الشهرية. المتبقي: ${agentRunsRemaining.toLocaleString(lang)}.`
                : `This request uses one workspace agent run. ${agentRunsRemaining.toLocaleString(lang)} remain this month.`}
            </p>
          ) : null
        ) : (
          <p className="px-2 pt-2 text-xs text-muted-foreground">
            {agentModeUnavailableMessage}
          </p>
        )}
        {agentMode ? (
          <p
            className="px-2 pt-1 text-xs text-muted-foreground"
            data-testid="agent-workflow-guidance"
          >
            {lang === "ar"
              ? "سيفهم الوكيل المطلوب، ويستخدم الأدوات المتاحة عند الحاجة، ثم يوضح ما اكتمل وما تعذّر."
              : "The Agent will understand the request, use available tools when needed, and explain what succeeded or could not be completed."}
          </p>
        ) : null}
        {agentMode && (status === "submitted" || status === "streaming") ? (
          <output
            aria-live="polite"
            className="px-2 pt-1 text-sm text-muted-foreground"
            data-testid="agent-work-progress"
          >
            {status === "submitted"
              ? lang === "ar"
                ? "وصلت المهمة، ويبدأ الوكيل العمل عليها…"
                : "Task received. The Agent is getting started…"
              : lang === "ar"
                ? "الوكيل يعمل على المهمة. سيظهر الرد والنتيجة هنا."
                : "The Agent is working on the task. Its response and result will appear here."}
          </output>
        ) : null}
      </PromptInput>
    </div>
  );
}

export const MultimodalInput = memo(
  PureMultimodalInput,
  (prevProps, nextProps) => {
    if (prevProps.input !== nextProps.input) {
      return false;
    }
    if (prevProps.status !== nextProps.status) {
      return false;
    }
    if (!equal(prevProps.attachments, nextProps.attachments)) {
      return false;
    }
    if (prevProps.selectedVisibilityType !== nextProps.selectedVisibilityType) {
      return false;
    }
    if (prevProps.selectedModelId !== nextProps.selectedModelId) {
      return false;
    }
    if (prevProps.agentMode !== nextProps.agentMode) {
      return false;
    }
    if (prevProps.status !== nextProps.status) {
      return false;
    }

    return true;
  }
);

function PureAttachmentsButton({
  fileInputRef,
  status,
  selectedModelId,
}: {
  fileInputRef: React.MutableRefObject<HTMLInputElement | null>;
  status: UseChatHelpers<ChatMessage>["status"];
  selectedModelId: string;
}) {
  const isReasoningModel =
    selectedModelId.includes("reasoning") || selectedModelId.includes("think");

  return (
    <Button
      className="aspect-square h-8 rounded-lg p-1 transition-colors hover:bg-accent"
      data-testid="attachments-button"
      disabled={status !== "ready" || isReasoningModel}
      onClick={(event) => {
        event.preventDefault();
        fileInputRef.current?.click();
      }}
      variant="ghost"
    >
      <PaperclipIcon size={14} style={{ width: 14, height: 14 }} />
    </Button>
  );
}

const AttachmentsButton = memo(PureAttachmentsButton);

function PureModelSelectorCompact({
  selectedModelId,
  onModelChange,
}: {
  selectedModelId: string;
  onModelChange?: (modelId: string) => void;
}) {
  const [open, setOpen] = useState(false);

  const selectedModel =
    chatModels.find((m) => m.id === selectedModelId) ??
    chatModels.find((m) => m.id === DEFAULT_CHAT_MODEL) ??
    chatModels[0];
  const [provider] = selectedModel.id.split("/");

  // Provider display names
  const providerNames: Record<string, string> = {
    anthropic: "Anthropic",
    openai: "OpenAI",
    google: "Google",
    xai: "xAI",
    reasoning: "Reasoning",
  };

  return (
    <ModelSelector onOpenChange={setOpen} open={open}>
      <ModelSelectorTrigger asChild>
        <Button className="h-8 w-[200px] justify-between px-2" variant="ghost">
          {provider && <ModelSelectorLogo provider={provider} />}
          <ModelSelectorName>{selectedModel.name}</ModelSelectorName>
        </Button>
      </ModelSelectorTrigger>
      <ModelSelectorContent>
        <ModelSelectorInput placeholder="Search models..." />
        <ModelSelectorList>
          {Object.entries(modelsByProvider).map(
            ([providerKey, providerModels]) => (
              <ModelSelectorGroup
                heading={providerNames[providerKey] ?? providerKey}
                key={providerKey}
              >
                {providerModels.map((model) => {
                  const logoProvider = model.id.split("/")[0];
                  return (
                    <ModelSelectorItem
                      key={model.id}
                      onSelect={() => {
                        onModelChange?.(model.id);
                        setCookie("chat-model", model.id);
                        setOpen(false);
                      }}
                      value={model.id}
                    >
                      <ModelSelectorLogo provider={logoProvider} />
                      <ModelSelectorName>{model.name}</ModelSelectorName>
                      {model.id === selectedModel.id && (
                        <CheckIcon className="ml-auto size-4" />
                      )}
                    </ModelSelectorItem>
                  );
                })}
              </ModelSelectorGroup>
            )
          )}
        </ModelSelectorList>
      </ModelSelectorContent>
    </ModelSelector>
  );
}

const ModelSelectorCompact = memo(PureModelSelectorCompact);

function PureStopButton({
  stop,
  setMessages,
}: {
  stop: () => void;
  setMessages: UseChatHelpers<ChatMessage>["setMessages"];
}) {
  return (
    <Button
      className="size-7 rounded-full bg-foreground p-1 text-background transition-colors duration-200 hover:bg-foreground/90 disabled:bg-muted disabled:text-muted-foreground"
      data-testid="stop-button"
      onClick={(event) => {
        event.preventDefault();
        stop();
        setMessages((messages) => messages);
      }}
    >
      <StopIcon size={14} />
    </Button>
  );
}

const StopButton = memo(PureStopButton);
