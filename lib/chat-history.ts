import { z } from "zod";

/** How many chats the sidebar loads per page. */
export const CHAT_HISTORY_PAGE_SIZE = 90;

/**
 * The history route validates `limit` strictly (a non-number or out-of-range value is a 400,
 * never silently clamped) but allows up to one full sidebar page.
 */
export const historyLimitSchema = z.coerce
  .number()
  .int()
  .min(1)
  .max(CHAT_HISTORY_PAGE_SIZE);
