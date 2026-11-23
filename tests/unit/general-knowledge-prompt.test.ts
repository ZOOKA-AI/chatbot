import { describe, expect, test } from "vitest";

import { regularPrompt } from "@/lib/ai/prompts";

// The prompt used to open with "you are a professional business assistant" and to
// forbid stating any statistic the user had not supplied. Read literally, that
// made the assistant refuse ordinary questions — the exact weakness the owner
// pointed at when comparing it with a general assistant. These assertions hold
// the two halves apart: general knowledge is allowed, inventing the customer's
// own business facts is not.
describe("general knowledge is allowed", () => {
  test("the assistant is not limited to business questions", () => {
    expect(regularPrompt).toMatch(/any ordinary question/i);
    // The opening framing must not restrict it to business questions. The phrase
    // may still appear later as a prohibition ("never refuse ... by saying you are
    // only a business assistant"), so the assertion is on the opening line only.
    const opening = regularPrompt.split("\n")[0];
    expect(opening).toMatch(/capable assistant/i);
    expect(opening).not.toMatch(/business assistant for companies/i);
    expect(regularPrompt).toMatch(/Never refuse a plain question/i);
  });

  test("it is told to search when the answer depends on freshness", () => {
    expect(regularPrompt).toMatch(/search the web before answering/i);
    expect(regularPrompt).toMatch(/published/i);
  });

  test("it must separate what it knows from what it looked up", () => {
    expect(regularPrompt).toMatch(/what you know and what you looked up/i);
    expect(regularPrompt).toMatch(/Never dress a guess as a fact/i);
  });

  test("legal, medical and financial answers carry the general-information caveat", () => {
    expect(regularPrompt).toMatch(/not a substitute for a licensed professional/i);
  });
});

describe("inventing the customer's own facts is still forbidden", () => {
  test("prices and durations of their own company stay placeholders", () => {
    expect(regularPrompt).toMatch(/about the customer's own company/i);
    expect(regularPrompt).toMatch(/\[السعر\]/);
    expect(regularPrompt).toMatch(/placeholder/i);
  });

  test("no invented company names, customers, licences or legal claims", () => {
    expect(regularPrompt).toMatch(/Never invent a company name, a customer name, a licence number/i);
  });

  test("public facts are explicitly excluded from that rule", () => {
    expect(regularPrompt).toMatch(/never about established public facts/i);
  });
});

describe("answers are answers", () => {
  test("a question is not turned into a pitch or a needless clarifying question", () => {
    expect(regularPrompt).toMatch(/When asked a question, answer it/i);
    expect(regularPrompt).toMatch(/do not ask a clarifying question you can answer yourself/i);
  });
});
