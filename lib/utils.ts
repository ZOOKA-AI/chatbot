import type {
  AssistantModelMessage,
  ToolModelMessage,
  UIMessage,
  UIMessagePart,
} from 'ai';
import { type ClassValue, clsx } from 'clsx';
import { formatISO } from 'date-fns';
import { twMerge } from 'tailwind-merge';
import type { DBMessage, Document } from '@/lib/db/schema';
import { ChatbotError, type ErrorCode } from './errors';
import type { ChatMessage, ChatTools, CustomUIDataTypes } from './types';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const fetcher = async (url: string) => {
  const response = await fetch(url);

  if (!response.ok) {
    const { code, cause } = await response.json();
    throw new ChatbotError(code as ErrorCode, cause);
  }

  return response.json();
};

export async function fetchWithErrorHandlers(
  input: RequestInfo | URL,
  init?: RequestInit,
) {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(new DOMException("Chat request timed out", "TimeoutError")),
    45_000,
  );
  const signal = init?.signal
    ? AbortSignal.any([controller.signal, init.signal])
    : controller.signal;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(input, { ...init, signal });

      if (!response.ok) {
        clearTimeout(timeout);
        const { code, cause } = await response
          .json()
          .catch(() => ({ code: "offline:chat", cause: undefined }));
        throw new ChatbotError(code as ErrorCode, cause);
      }

      if (!response.body) {
        clearTimeout(timeout);
        return response;
      }

      const reader = response.body.getReader();
      const body = new ReadableStream<Uint8Array>({
        async pull(streamController) {
          try {
            const chunk = await reader.read();
            if (chunk.done) {
              clearTimeout(timeout);
              streamController.close();
            } else {
              streamController.enqueue(chunk.value);
            }
          } catch (error) {
            clearTimeout(timeout);
            streamController.error(error);
          }
        },
        async cancel(reason) {
          clearTimeout(timeout);
          await reader.cancel(reason);
        },
      });

      return new Response(body, {
        headers: response.headers,
        status: response.status,
        statusText: response.statusText,
      });
    } catch (error: unknown) {
      if (
        error instanceof ChatbotError ||
        controller.signal.aborted ||
        init?.signal?.aborted ||
        !(error instanceof TypeError) ||
        attempt === 2
      ) {
        clearTimeout(timeout);
        if (typeof navigator !== "undefined" && !navigator.onLine) {
          throw new ChatbotError("offline:chat");
        }
        throw error;
      }
      await new Promise((resolve) =>
        setTimeout(resolve, 500 * 2 ** attempt + Math.random() * 250)
      );
    }
  }

  clearTimeout(timeout);
  throw new ChatbotError("offline:chat");
}

export function getLocalStorage(key: string) {
  if (typeof window !== 'undefined') {
    return JSON.parse(localStorage.getItem(key) || '[]');
  }
  return [];
}

export function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

type ResponseMessageWithoutId = ToolModelMessage | AssistantModelMessage;
type ResponseMessage = ResponseMessageWithoutId & { id: string };

export function getMostRecentUserMessage(messages: UIMessage[]) {
  const userMessages = messages.filter((message) => message.role === 'user');
  return userMessages.at(-1);
}

export function getDocumentTimestampByIndex(
  documents: Document[],
  index: number,
) {
  if (!documents) { return new Date(); }
  if (index > documents.length) { return new Date(); }

  return documents[index].createdAt;
}

export function getTrailingMessageId({
  messages,
}: {
  messages: ResponseMessage[];
}): string | null {
  const trailingMessage = messages.at(-1);

  if (!trailingMessage) { return null; }

  return trailingMessage.id;
}

export function sanitizeText(text: string) {
  return text.replace('<has_function_call>', '');
}

export function convertToUIMessages(messages: DBMessage[]): ChatMessage[] {
  return messages.map((message) => ({
    id: message.id,
    role: message.role as 'user' | 'assistant' | 'system',
    parts: message.parts as UIMessagePart<CustomUIDataTypes, ChatTools>[],
    metadata: {
      createdAt: formatISO(message.createdAt),
    },
  }));
}

export function getTextFromMessage(message: ChatMessage | UIMessage): string {
  return message.parts
    .filter((part) => part.type === 'text')
    .map((part) => (part as { type: 'text'; text: string}).text)
    .join('');
}
