/** Return an absolute HTTP(S) URL for the isolated preview frame. */
export function safePreviewSrc(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const parsed = new URL(value);
    if (
      (parsed.protocol !== "http:" && parsed.protocol !== "https:") ||
      parsed.username ||
      parsed.password
    ) {
      return undefined;
    }
    return parsed.href;
  } catch {
    return undefined;
  }
}
