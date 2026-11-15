import { tool } from "ai";
import { z } from "zod";
import {
  getTelegramBot,
  getTelegramChat,
  sendTelegramMessage,
} from "@/lib/integrations/telegram-bot/api";

/**
 * Telegram Bot API: the bot identity, a chat lookup, and sending a text
 * message. Sending is the only write here, and the tool description tells the
 * model to confirm the chat and the text with the user first.
 */
export function createTelegramBotTools(organizationId: string) {
  return {
    readTelegramBot: tool({
      description:
        "Read the connected Telegram bot: username, display name, whether it can join groups, its webhook URL and pending update count.",
      inputSchema: z.object({}),
      execute: async () => {
        const result = await getTelegramBot(organizationId);
        if (!result.ok) {
          return { error: result.error };
        }
        return result.data;
      },
    }),

    readTelegramChat: tool({
      description:
        "Look up a Telegram chat the bot can see, by numeric chat id, and return its title and type.",
      inputSchema: z.object({
        chatId: z.string().describe("Numeric Telegram chat id."),
      }),
      execute: async ({ chatId }) => {
        const result = await getTelegramChat(organizationId, chatId.trim());
        if (!result.ok) {
          return { error: result.error };
        }
        return result.data;
      },
    }),

    sendTelegramMessage: tool({
      description:
        "Send a plain text message from the connected bot to a Telegram chat. This reaches a real person, so only call it after the user approved the chat and the exact text.",
      inputSchema: z.object({
        chatId: z.string().describe("Numeric Telegram chat id."),
        text: z.string().min(1).max(4000).describe("Message text to deliver."),
      }),
      execute: async ({ chatId, text }) => {
        const result = await sendTelegramMessage(
          organizationId,
          chatId.trim(),
          text
        );
        if (!result.ok) {
          return { error: result.error };
        }
        return result.data;
      },
    }),
  };
}
