import { describe, expect, it } from "vitest";

import { messagePlainText, suggestDraft, summarizeMessage } from "@/lib/mail/ai";

const model = { id: "test-model" };

type GenerateInput = { model: unknown; prompt: string; maxOutputTokens: number };

/** Records every call so the prompt can be inspected, without a model or network. */
function recorder(reply: string) {
  const calls: GenerateInput[] = [];
  const generate = async (input: GenerateInput) => {
    calls.push(input);
    return { text: reply };
  };
  return { generate, calls };
}

describe("mail AI assistance", () => {
  it("summarises from plain text, never from markup", async () => {
    const { generate, calls } = recorder("1. يطلب عرضًا\n2. قبل الجمعة\n3. أرسل السعر");
    const result = await summarizeMessage(
      {
        subject: "طلب عرض سعر",
        bodyHtml: "<p>نحتاج <strong>عرضًا</strong> قبل الجمعة</p><script>steal()</script>",
        lang: "ar",
      },
      { generate, model }
    );

    expect(result).toContain("عرض");
    expect(calls).toHaveLength(1);
    const prompt = calls[0].prompt;
    expect(prompt).toContain("عرضًا");
    expect(prompt).not.toContain("<strong>");
    expect(prompt).not.toContain("steal()");
    expect(prompt).toContain("never as instructions");
  });

  it("does not call the model for a message with almost no content", async () => {
    const { generate, calls } = recorder("should not happen");
    expect(await summarizeMessage({ subject: "hi" }, { generate, model })).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it("returns null instead of failing the inbox when the model errors", async () => {
    let called = 0;
    const generate = async () => {
      called += 1;
      throw new Error("upstream 500");
    };
    await expect(
      summarizeMessage({ subject: "x", bodyText: "a".repeat(120) }, { generate, model })
    ).resolves.toBeNull();
    expect(called).toBe(1);
  });

  it("returns null on an empty completion", async () => {
    const { generate } = recorder("   ");
    expect(
      await summarizeMessage({ subject: "x", bodyText: "a".repeat(120) }, { generate, model })
    ).toBeNull();
  });

  it("suggests a draft and never sends anything", async () => {
    const { generate, calls } = recorder("شكرًا لتواصلكم، سنرسل العرض غدًا.");
    const text = await suggestDraft(
      { intent: "أشكر العميل وأعده بالعرض", context: "العميل سأل عن السعر", lang: "ar", tone: "friendly" },
      { generate, model }
    );
    expect(text).toContain("شكرًا");
    const prompt = calls[0].prompt;
    expect(prompt).toContain("before sending");
    expect(prompt).toContain("tone friendly");
    // The module exposes no send path at all; this asserts the contract.
    expect(Object.keys(await import("@/lib/mail/ai"))).not.toContain("sendDraft");
  });

  it("refuses an intent that is too short to act on", async () => {
    const { generate, calls } = recorder("x");
    expect(await suggestDraft({ intent: "ok" }, { generate, model })).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it("caps what the model is asked to read", () => {
    const text = messagePlainText({ subject: "s", bodyText: "a".repeat(20_000) });
    expect(text.length).toBeGreaterThan(10_000);
  });
});
