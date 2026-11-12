import type { LegacyMessage } from "./types";

/**
 * مزوّد احتياطي لهذا المسار التجريبي فقط. مسار المنتج يستخدم
 * lib/ai/providers (AI SDK) ولا يمرّ من هنا.
 */

type CallResult = { content: string; model: string };

async function callGroq(messages: LegacyMessage[]): Promise<CallResult> {
  const response = await fetch(
    "https://api.groq.com/openai/v1/chat/completions",
    {
      body: JSON.stringify({
        max_tokens: 2048,
        messages: messages.map(({ role, content }) => ({ content, role })),
        model: "llama-3.3-70b-versatile",
        temperature: 0.4,
      }),
      headers: {
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      method: "POST",
    }
  );
  if (!response.ok) {
    throw new Error(`groq_${response.status}`);
  }
  const data = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  return {
    content: data.choices?.[0]?.message?.content ?? "",
    model: "llama-3.3-70b",
  };
}

async function callGemini(messages: LegacyMessage[]): Promise<CallResult> {
  const system = messages.find((m) => m.role === "system")?.content ?? "";
  const contents = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({
      parts: [{ text: m.content }],
      role: m.role === "assistant" ? "model" : "user",
    }));

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
    {
      body: JSON.stringify({
        contents,
        generationConfig: { maxOutputTokens: 2048, temperature: 0.4 },
        systemInstruction: { parts: [{ text: system }] },
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    }
  );
  if (!response.ok) {
    throw new Error(`gemini_${response.status}`);
  }
  const data = (await response.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  return {
    content: data.candidates?.[0]?.content?.parts?.[0]?.text ?? "",
    model: "gemini-1.5-flash",
  };
}

export async function callLegacyProvider(
  messages: LegacyMessage[]
): Promise<CallResult> {
  const errors: string[] = [];
  if (process.env.GROQ_API_KEY) {
    try {
      return await callGroq(messages);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "groq_failed");
    }
  }
  if (process.env.GEMINI_API_KEY) {
    try {
      return await callGemini(messages);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "gemini_failed");
    }
  }
  throw new Error(
    `no_provider_available${errors.length > 0 ? `:${errors.join("|")}` : ""}`
  );
}
