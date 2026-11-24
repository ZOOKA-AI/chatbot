/**
 * Which selectable models cannot be served by this deployment's configuration.
 *
 * Pure (reads only the env object it is given) so it can be unit tested and
 * exposed as booleans to the browser. It never returns a key or a key's shape.
 *
 * Today the only hard dependency is Groq: a groq/* id is routed straight to
 * Groq and throws when GROQ_API_KEY is absent, which production showed as
 * "AI model request failed { modelId: 'groq/gpt-oss-20b', statusCode: undefined }"
 * after the user had already sent the message. Every other id falls back through
 * the provider chain in providers.ts, so it is not listed here.
 */
export function unavailableModelIds(
  modelIds: readonly string[],
  env: Record<string, string | undefined>
): string[] {
  const groqConfigured = Boolean(env.GROQ_API_KEY?.trim());
  return modelIds.filter((id) => id.startsWith("groq/") && !groqConfigured);
}
