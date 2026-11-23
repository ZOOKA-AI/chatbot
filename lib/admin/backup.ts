const SENSITIVE_COLUMN =
  /(password|passwd|hash|salt|secret|token|api[-_]?key)/i;

export function redactRow(
  row: Record<string, unknown>
): Record<string, unknown> {
  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    clean[key] = SENSITIVE_COLUMN.test(key) ? "[redacted]" : value;
  }
  return clean;
}
