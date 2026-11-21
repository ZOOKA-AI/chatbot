export const CHAT_HISTORY_PAGE_SIZE = 90;

export function normalizeChatHistoryLimit(rawLimit: string | null) {
  const value = rawLimit?.trim();
  if (!value || !/^\d+$/.test(value)) {
    return CHAT_HISTORY_PAGE_SIZE;
  }

  const requestedLimit = Number(value);
  if (!Number.isSafeInteger(requestedLimit)) {
    return CHAT_HISTORY_PAGE_SIZE;
  }

  return Math.min(CHAT_HISTORY_PAGE_SIZE, Math.max(1, requestedLimit));
}
