import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  streamText,
  type UIMessage,
  wrapLanguageModel,
} from "ai";
import { demoBusyMessage, demoRetryMiddleware, rateLimitRetrySeconds } from "@/lib/ai/demo-rate-limit";
import { DEFAULT_CHAT_MODEL } from "@/lib/ai/models";
import { getLanguageModel } from "@/lib/ai/providers";
import { ChatbotError } from "@/lib/errors";
import {
  commitGuestMessage,
  checkDemoMinuteLimit,
  releaseGuestHold,
  reserveGuestMessage,
} from "@/lib/guest-quota";
import { getLang } from "@/lib/i18n";
import { generateUUID } from "@/lib/utils";

/**
 * Public preview endpoint.
 *
 * Deliberately narrow: no tools, no documents, no chat rows, no chat id lookup.
 * It cannot read or write anything that belongs to an account, so the landing
 * page never has to touch `/api/chat` — which stays behind a session.
 */
export const maxDuration = 30;

type DemoBody = {
  id?: string;
  message?: UIMessage;
  history?: UIMessage[];
  agentMode?: boolean;
};

const DEMO_SYSTEM = `You are ZOOKA-AI's public preview inside the marketing site.
Answer in the user's language (Arabic or English).
You cannot access Gmail, Drive, files, calendars, code or any account, and you have no tools.
If the visitor asks you to connect a tool or read their inbox, say that real connections and Agent mode start on the Pro plan after sign-up, then finish the writing task they asked for with what you have.
Never invent prices, discounts, licence numbers or client names; write placeholders such as [السعر] for the user to fill in.
Keep replies short and immediately useful.`;

function textOf(message: UIMessage | undefined) {
  return (message?.parts ?? [])
    .filter((part): part is { type: "text"; text: string } => part.type === "text")
    .map((part) => part.text)
    .join("")
    .trim();
}

export async function POST(request: Request) {
  let body: DemoBody;
  try {
    body = (await request.json()) as DemoBody;
  } catch {
    return new ChatbotError("bad_request:api").toResponse();
  }

  const text = textOf(body.message);
  if (!text || body.agentMode) {
    return new ChatbotError("bad_request:api").toResponse();
  }

  const lang = await getLang();
  const hold = await reserveGuestMessage(request);
  if (!hold.ok) {
    return new ChatbotError("payment_required:chat").toResponse();
  }

  let allowed: boolean;
  try {
    allowed = await checkDemoMinuteLimit(hold.id);
  } catch {
    await releaseGuestHold(hold.id);
    return new ChatbotError("offline:chat").toResponse();
  }
  if (!allowed) {
    await releaseGuestHold(hold.id);
    return Response.json(
      { code: "demo_busy", message: demoBusyMessage(60, lang), retryAfter: 60 },
      { status: 429, headers: { "Retry-After": "60" } }
    );
  }
  let committed = false;
  const commit = () => {
    if (committed) {
      return;
    }
    committed = true;
    commitGuestMessage(hold.id);
  };
  const releaseOnce = () => {
    if (committed) {
      return;
    }
    committed = true;
    void releaseGuestHold(hold.id);
  };

  // A visitor who drops the connection before the first token keeps their allowance.
  request.signal.addEventListener("abort", releaseOnce, { once: true });

  const history = (body.history ?? [])
    .filter((entry) => entry.role === "user" || entry.role === "assistant")
    .slice(-6);

  try {
    const modelMessages = await convertToModelMessages([
      ...history,
      body.message,
    ] as UIMessage[]);

    const stream = createUIMessageStream({
      execute: ({ writer }) => {
        const result = streamText({
          model: wrapLanguageModel({
            model: getLanguageModel(DEFAULT_CHAT_MODEL),
            middleware: demoRetryMiddleware,
          }),
          system: DEMO_SYSTEM,
          messages: modelMessages,
          providerOptions: {
            gateway: { models: ["google/gemini-2.5-flash-lite"] },
          },
          maxRetries: 0,
          abortSignal: request.signal,
          experimental_activeTools: [],
          onChunk: commit,
        });
        writer.merge(
          result.toUIMessageStream({
            onError: (error) => {
              releaseOnce();
              const retrySeconds = rateLimitRetrySeconds(error);
              if (retrySeconds !== null) {
                return `demo_busy:${retrySeconds}:${demoBusyMessage(retrySeconds, lang)}`;
              }
              console.error({
                code: "offline:chat",
                surface: "demo",
                cause: String(error).slice(0, 200),
              });
              return lang === "ar"
                ? "انقطع الرد قبل ما يكتمل. أعد المحاولة، ولن يُحسب من رصيدك."
                : "The reply stopped early. Try again — it will not use one of your messages.";
            },
          })
        );
      },
      generateId: generateUUID,
      onError: (error) => {
        releaseOnce();
        const retrySeconds = rateLimitRetrySeconds(error);
        if (retrySeconds !== null) {
          return `demo_busy:${retrySeconds}:${demoBusyMessage(retrySeconds, lang)}`;
        }
        console.error({
          code: "offline:chat",
          surface: "demo",
          cause: String(error).slice(0, 200),
        });
        return lang === "ar"
          ? "تعذّر إكمال الرد. أعد المحاولة."
          : "Could not finish the reply. Please try again.";
      },
    });

    return createUIMessageStreamResponse({ stream });
  } catch (error) {
    releaseOnce();
    const retrySeconds = rateLimitRetrySeconds(error);
    if (retrySeconds !== null) {
      return Response.json(
        { code: "demo_busy", message: demoBusyMessage(retrySeconds, lang), retryAfter: retrySeconds },
        { status: 429, headers: { "Retry-After": String(retrySeconds) } }
      );
    }
    console.error({
      code: "offline:chat",
      surface: "demo",
      cause: String(error).slice(0, 200),
    });
    return new ChatbotError("offline:chat").toResponse();
  }
}
