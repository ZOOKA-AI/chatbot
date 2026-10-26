import { geolocation, ipAddress } from "@vercel/functions";
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  generateId,
  stepCountIs,
  streamText,
} from "ai";
import { checkBotId } from "botid/server";
import { after } from "next/server";
import { createResumableStreamContext } from "resumable-stream";
import type { UserType } from "@/app/(auth)/auth";
import { entitlementsByUserType } from "@/lib/ai/entitlements";
import { allowedModelIds, paidModelIds } from "@/lib/ai/models";
import { type RequestHints, systemPrompt } from "@/lib/ai/prompts";
import { getLanguageModel } from "@/lib/ai/providers";
import { createDocument } from "@/lib/ai/tools/create-document";
import { getWeather } from "@/lib/ai/tools/get-weather";
import { requestSuggestions } from "@/lib/ai/tools/request-suggestions";
import { updateDocument } from "@/lib/ai/tools/update-document";
import { getWorkspaceContext } from "@/lib/auth/workspace";
import { consumeGuestMessage } from "@/lib/guest";
import { isProductionEnvironment } from "@/lib/constants";
import {
  createStreamId,
  deleteChatById,
  getChatById,
  getMessageCountByUserId,
  getMessagesByChatId,
  getWorkspaceBilling,
  saveChat,
  saveMessages,
  trackWorkspaceUsage,
  updateChatTitleById,
  updateMessage,
} from "@/lib/db/queries";
import type { DBMessage } from "@/lib/db/schema";
import { ChatbotError } from "@/lib/errors";
import { checkIpRateLimit } from "@/lib/ratelimit";
import { workspacePlans } from "@/lib/saas/plans";
import type { ChatMessage } from "@/lib/types";
import { convertToUIMessages, generateUUID } from "@/lib/utils";
import { generateTitleFromUserMessage } from "../../actions";
import { type PostRequestBody, postRequestBodySchema } from "./schema";

export const maxDuration = 60;

function getStreamContext() {
  try {
    return createResumableStreamContext({ waitUntil: after });
  } catch (_) {
    return null;
  }
}

export { getStreamContext };

function toGuestTextMessage(
  input: { role: string; parts: unknown[] },
  role: "user" | "assistant"
): ChatMessage {
  const parts = input.parts
    .filter(
      (part): part is { type: "text"; text: string } =>
        typeof part === "object" &&
        part !== null &&
        (part as { type?: unknown }).type === "text" &&
        typeof (part as { text?: unknown }).text === "string"
    )
    .map((part) => ({ type: "text" as const, text: part.text.slice(0, 4000) }));
  return { id: generateUUID(), role, parts };
}

async function handleGuestMessage({
  request,
  message,
  history,
  selectedChatModel,
}: {
  request: Request;
  message: PostRequestBody["message"];
  history: PostRequestBody["history"];
  selectedChatModel: string;
}) {
  if (message?.role !== "user") {
    return new ChatbotError("unauthorized:chat").toResponse();
  }
  if (paidModelIds.has(selectedChatModel)) {
    return Response.json(
      { error: "This model requires a Pro or Business workspace plan." },
      { status: 403 }
    );
  }

  if (process.env.GUEST_PAYWALL_ENABLED !== "true") {
    return new ChatbotError("unauthorized:chat").toResponse();
  }

  await consumeGuestMessage(ipAddress(request));

  const previousMessages = (history ?? [])
    .filter((entry) => entry.role === "user" || entry.role === "assistant")
    .slice(-6)
    .map((entry) =>
      toGuestTextMessage(entry, entry.role === "user" ? "user" : "assistant")
    )
    .filter((entry) => entry.parts.length > 0);
  const modelMessages = await convertToModelMessages([
    ...previousMessages,
    toGuestTextMessage(message, "user"),
  ]);

  const { longitude, latitude, city, country } = geolocation(request);
  const requestHints: RequestHints = { longitude, latitude, city, country };

  const stream = createUIMessageStream({
    execute: ({ writer: dataStream }) => {
      const result = streamText({
        model: getLanguageModel(selectedChatModel),
        system: systemPrompt({ selectedChatModel, requestHints }),
        messages: modelMessages,
        experimental_activeTools: [],
      });
      dataStream.merge(result.toUIMessageStream());
    },
    generateId: generateUUID,
    onError: () => "Oops, an error occurred!",
  });

  return createUIMessageStreamResponse({ stream });
}

export async function POST(request: Request) {
  let requestBody: PostRequestBody;

  try {
    const json = await request.json();
    requestBody = postRequestBodySchema.parse(json);
  } catch (_) {
    return new ChatbotError("bad_request:api").toResponse();
  }

  try {
    const {
      id,
      message,
      messages,
      history,
      selectedChatModel,
      selectedVisibilityType,
    } = requestBody;

    const [botResult, workspaceContext] = await Promise.all([
      checkBotId(),
      getWorkspaceContext(),
    ]);

    if (botResult.isBot) {
      return new ChatbotError("unauthorized:chat").toResponse();
    }

    if (!allowedModelIds.has(selectedChatModel)) {
      return new ChatbotError("bad_request:api").toResponse();
    }

    await checkIpRateLimit(ipAddress(request));

    if (!workspaceContext) {
      return await handleGuestMessage({
        request,
        message,
        history,
        selectedChatModel,
      });
    }
    const { session } = workspaceContext;

    const userType: UserType = session.user.type;

    const billing = await getWorkspaceBilling(workspaceContext.organizationId);
    const effectivePlan =
      billing.subscription &&
      ["active", "trialing"].includes(billing.subscription.status)
        ? billing.subscription.plan
        : "free";
    const plan = workspacePlans[effectivePlan];
    const messageCount = await getMessageCountByUserId({
      id: session.user.id,
      differenceInHours: 1,
    });
    const hourlyLimit =
      userType === "guest"
        ? entitlementsByUserType.guest.maxMessagesPerHour
        : effectivePlan === "business"
          ? 100
          : effectivePlan === "pro"
            ? 40
            : entitlementsByUserType.regular.maxMessagesPerHour;

    if (messageCount >= hourlyLimit) {
      return new ChatbotError("rate_limit:chat").toResponse();
    }

    if (effectivePlan === "free" && paidModelIds.has(selectedChatModel)) {
      return Response.json(
        { error: "This model requires a Pro or Business workspace plan." },
        { status: 403 }
      );
    }

    if (
      plan.monthlyMessages !== null &&
      billing.usage.messages >= plan.monthlyMessages
    ) {
      return new ChatbotError("rate_limit:chat").toResponse();
    }

    const isToolApprovalFlow = Boolean(messages);

    const chat = await getChatById({
      id,
      organizationId: workspaceContext.organizationId,
    });
    let messagesFromDb: DBMessage[] = [];
    let titlePromise: Promise<string> | null = null;

    if (chat) {
      if (chat.visibility === "private" && chat.userId !== session.user.id) {
        return new ChatbotError("forbidden:chat").toResponse();
      }
      if (!isToolApprovalFlow) {
        messagesFromDb = await getMessagesByChatId({
          id,
          organizationId: workspaceContext.organizationId,
        });
      }
    } else if (message?.role === "user") {
      await saveChat({
        id,
        userId: session.user.id,
        organizationId: workspaceContext.organizationId,
        title: "New chat",
        visibility: selectedVisibilityType,
      });
      titlePromise = generateTitleFromUserMessage({ message });
    }

    const uiMessages = isToolApprovalFlow
      ? (messages as ChatMessage[])
      : [...convertToUIMessages(messagesFromDb), message as ChatMessage];

    const { longitude, latitude, city, country } = geolocation(request);

    const requestHints: RequestHints = {
      longitude,
      latitude,
      city,
      country,
    };

    if (message?.role === "user") {
      await saveMessages({
        messages: [
          {
            chatId: id,
            id: message.id,
            role: "user",
            parts: message.parts,
            attachments: [],
            createdAt: new Date(),
          },
        ],
        organizationId: workspaceContext.organizationId,
      });
      await trackWorkspaceUsage({
        organizationId: workspaceContext.organizationId,
        userId: session.user.id,
        event: "chat_message",
      });
    }

    const isReasoningModel =
      selectedChatModel.endsWith("-thinking") ||
      (selectedChatModel.includes("reasoning") &&
        !selectedChatModel.includes("non-reasoning"));

    const modelMessages = await convertToModelMessages(uiMessages);

    const stream = createUIMessageStream({
      originalMessages: isToolApprovalFlow ? uiMessages : undefined,
      execute: async ({ writer: dataStream }) => {
        const result = streamText({
          model: getLanguageModel(selectedChatModel),
          system: systemPrompt({ selectedChatModel, requestHints }),
          messages: modelMessages,
          stopWhen: stepCountIs(5),
          experimental_activeTools: isReasoningModel
            ? []
            : [
                "getWeather",
                "createDocument",
                "updateDocument",
                "requestSuggestions",
              ],
          providerOptions: isReasoningModel
            ? {
                anthropic: {
                  thinking: { type: "enabled", budgetTokens: 10_000 },
                },
              }
            : undefined,
          tools: {
            getWeather,
            createDocument: createDocument({ session, dataStream }),
            updateDocument: updateDocument({ session, dataStream }),
            requestSuggestions: requestSuggestions({ session, dataStream }),
          },
          experimental_telemetry: {
            isEnabled: isProductionEnvironment,
            functionId: "stream-text",
          },
        });

        dataStream.merge(
          result.toUIMessageStream({ sendReasoning: isReasoningModel })
        );

        if (titlePromise) {
          const title = await titlePromise;
          dataStream.write({ type: "data-chat-title", data: title });
          updateChatTitleById({
            chatId: id,
            title,
            organizationId: workspaceContext.organizationId,
          });
        }
      },
      generateId: generateUUID,
      onFinish: async ({ messages: finishedMessages }) => {
        if (isToolApprovalFlow) {
          for (const finishedMsg of finishedMessages) {
            const existingMsg = uiMessages.find((m) => m.id === finishedMsg.id);
            if (existingMsg) {
              await updateMessage({
                id: finishedMsg.id,
                parts: finishedMsg.parts,
                organizationId: workspaceContext.organizationId,
              });
            } else {
              await saveMessages({
                messages: [
                  {
                    id: finishedMsg.id,
                    role: finishedMsg.role,
                    parts: finishedMsg.parts,
                    createdAt: new Date(),
                    attachments: [],
                    chatId: id,
                  },
                ],
                organizationId: workspaceContext.organizationId,
              });
            }
          }
        } else if (finishedMessages.length > 0) {
          await saveMessages({
            messages: finishedMessages.map((currentMessage) => ({
              id: currentMessage.id,
              role: currentMessage.role,
              parts: currentMessage.parts,
              createdAt: new Date(),
              attachments: [],
              chatId: id,
            })),
            organizationId: workspaceContext.organizationId,
          });
        }
      },
      onError: (error) => {
        if (
          error instanceof Error &&
          error.message?.includes(
            "AI Gateway requires a valid credit card on file to service requests"
          )
        ) {
          return "AI Gateway requires a valid credit card on file to service requests. Please visit https://vercel.com/d?to=%2F%5Bteam%5D%2F%7E%2Fai%3Fmodal%3Dadd-credit-card to add a card and unlock your free credits.";
        }
        return "Oops, an error occurred!";
      },
    });

    return createUIMessageStreamResponse({
      stream,
      async consumeSseStream({ stream: sseStream }) {
        if (!process.env.REDIS_URL) {
          return;
        }
        try {
          const streamContext = getStreamContext();
          if (streamContext) {
            const streamId = generateId();
            await createStreamId({
              streamId,
              chatId: id,
              organizationId: workspaceContext.organizationId,
            });
            await streamContext.createNewResumableStream(
              streamId,
              () => sseStream
            );
          }
        } catch (_) {
          // ignore redis errors
        }
      },
    });
  } catch (error) {
    const vercelId = request.headers.get("x-vercel-id");

    if (error instanceof ChatbotError) {
      return error.toResponse();
    }

    if (
      error instanceof Error &&
      error.message?.includes(
        "AI Gateway requires a valid credit card on file to service requests"
      )
    ) {
      return new ChatbotError("bad_request:activate_gateway").toResponse();
    }

    console.error("Unhandled error in chat API:", error, { vercelId });
    return new ChatbotError("offline:chat").toResponse();
  }
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return new ChatbotError("bad_request:api").toResponse();
  }

  const workspaceContext = await getWorkspaceContext();
  const session = workspaceContext?.session;

  if (!session?.user) {
    return new ChatbotError("unauthorized:chat").toResponse();
  }

  if (!workspaceContext) {
    return new ChatbotError("unauthorized:chat").toResponse();
  }

  const chat = await getChatById({
    id,
    organizationId: workspaceContext.organizationId,
  });

  if (chat?.userId !== session.user.id) {
    return new ChatbotError("forbidden:chat").toResponse();
  }

  const deletedChat = await deleteChatById({
    id,
    organizationId: workspaceContext.organizationId,
  });

  return Response.json(deletedChat, { status: 200 });
}
