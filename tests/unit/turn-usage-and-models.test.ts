import { describe, expect, it } from "vitest";

import { unavailableModelIds } from "@/lib/ai/model-availability";
import { chatModels } from "@/lib/ai/models";
import { assistantProducedOutput, classifyTurn } from "@/lib/saas/turn-usage";

const user = { id: "u1", role: "user", parts: [{ type: "text", text: "hi" }] };

describe("turn billing", () => {
  it("bills a successful turn", () => {
    const messages = [user, { id: "a1", role: "assistant", parts: [{ type: "text", text: "OK" }] }];
    expect(classifyTurn({ modelFailed: false, messages })).toBe("billable");
  });

  it("does not bill a failed turn that produced no assistant output", () => {
    const messages = [user, { id: "a1", role: "assistant", parts: [{ type: "step-start" }] }];
    expect(classifyTurn({ modelFailed: true, messages })).toBe("failed_unbilled");
    expect(classifyTurn({ modelFailed: true, messages: [user] })).toBe("failed_unbilled");
  });

  it("still bills a failed turn that streamed output first (tokens were charged)", () => {
    const messages = [user, { id: "a1", role: "assistant", parts: [{ type: "text", text: "partial ans" }] }];
    expect(classifyTurn({ modelFailed: true, messages })).toBe("billable");
    const tool = [user, { id: "a1", role: "assistant", parts: [{ type: "tool-webSearch" }] }];
    expect(classifyTurn({ modelFailed: true, messages: tool })).toBe("billable");
  });

  it("ignores assistant messages that existed before this turn", () => {
    const old = { id: "a0", role: "assistant", parts: [{ type: "text", text: "earlier" }] };
    expect(assistantProducedOutput([old, user], new Set(["a0"]))).toBe(false);
    expect(classifyTurn({ modelFailed: true, messages: [old, user], priorIds: new Set(["a0"]) })).toBe("failed_unbilled");
  });

  it("whitespace-only text is not output", () => {
    expect(assistantProducedOutput([{ role: "assistant", parts: [{ type: "text", text: "  " }] }])).toBe(false);
  });
});

describe("model availability", () => {
  const ids = chatModels.map((model) => model.id);

  it("hides groq models when GROQ_API_KEY is missing or blank", () => {
    expect(unavailableModelIds(ids, {})).toEqual(ids.filter((id) => id.startsWith("groq/")));
    expect(unavailableModelIds(ids, { GROQ_API_KEY: "   " })).toEqual(ids.filter((id) => id.startsWith("groq/")));
    expect(unavailableModelIds(["groq/gpt-oss-20b"], {})).toEqual(["groq/gpt-oss-20b"]);
  });

  it("offers groq models when the key is configured, and never lists other providers", () => {
    expect(unavailableModelIds(ids, { GROQ_API_KEY: "configured" })).toEqual([]);
    expect(unavailableModelIds(["openai/gpt-4.1-mini", "google/gemini-2.5-flash-lite"], {})).toEqual([]);
  });
});
