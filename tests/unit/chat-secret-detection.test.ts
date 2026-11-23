import { describe, expect, it, vi } from "vitest";
import { detectChatSecrets, redactChatMessages } from "@/lib/chat-secret-detection";

const fixtures = [
  ["GITHUB_TOKEN", ["gh", "p_", "a".repeat(36)].join("")],
  ["GITHUB_TOKEN", ["gh", "o_", "a".repeat(36)].join("")],
  ["GITHUB_TOKEN", ["gh", "s_", "a".repeat(36)].join("")],
  ["GITHUB_TOKEN", ["gh", "u_", "a".repeat(36)].join("")],
  ["GITHUB_TOKEN", ["gh", "r_", "a".repeat(36)].join("")],
  ["GITHUB_TOKEN", ["github", "_pat_", "a".repeat(24), "_"].join("")],
  ["VERCEL_TOKEN", ["vc", "p_", "b".repeat(24), "-"].join("")],
  ["SUPABASE_TOKEN", ["sb", "p_", "c".repeat(24), "_"].join("")],
  ["OPENAI_KEY", ["s", "k-", "d".repeat(24)].join("")],
  ["ANTHROPIC_KEY", ["sk", "-ant-", "e".repeat(24), "_"].join("")],
  ["GROQ_KEY", ["gs", "k_", "f".repeat(24)].join("")],
  ["GEMINI_KEY", ["AI", "za", "g".repeat(35)].join("")],
  ["TELEGRAM_TOKEN", ["123456", ":", "h".repeat(34), "-"].join("")],
  ["JWT", ["eyJ", "a".repeat(12), ".", "b".repeat(12), ".", "c".repeat(12)].join("")],
  ["STRIPE_KEY", ["sk", "_live_", "z".repeat(24)].join("")],
  ["STRIPE_KEY", ["rk", "_live_", "z".repeat(24)].join("")],
];

describe("chat secret detection", () => {
  it("detects complete common credentials, including trailing punctuation in their alphabet", () => {
    for (const [kind, value] of fixtures) {
      expect(detectChatSecrets(`use ${value} now`)).toEqual([
        { kind, value, start: 4, end: 4 + value.length },
      ]);
    }
  });

  it("ignores ordinary text, placeholders and short prefixes", () => {
    for (const text of [
      "hello world", "use a key in settings", "ghp_short",
      ...["o", "s", "u", "r"].map((prefix) => ["gh", prefix, "_short"].join("")),
      ["gh", "x_", "a".repeat(36)].join(""),
      "sk-test", "example.com", "abc.def.ghi",
    ]) {
      expect(detectChatSecrets(text)).toEqual([]);
    }
  });

  it("deduplicates values, replaces all occurrences and handles split and nested parts", async () => {
    const secret = fixtures[0][1];
    const save = vi.fn(async () => "GITHUB_TOKEN_ABC");
    const input = [
      { id: "1", parts: [{ type: "text", text: `before ${secret.slice(0, 10)}` }, { type: "text", text: `${secret.slice(10)} after` }] },
      { id: "2", parts: [{ type: "tool", input: { token: secret, repeat: `${secret} ${secret}` } }] },
    ];
    const safe = await redactChatMessages(input, save);
    expect(save).toHaveBeenCalledTimes(1);
    expect(safe[0].parts[0]).toMatchObject({ text: "before 🔒 $GITHUB_TOKEN_ABC" });
    expect(safe[0].parts[1]).toMatchObject({ text: " after" });
    expect(JSON.stringify(safe)).not.toContain(secret);
    expect(JSON.stringify(input)).toContain(secret);
  });

  it("fails closed on vault errors and hidden credentials inside data URLs", async () => {
    const secret = fixtures[0][1];
    await expect(redactChatMessages([{ parts: [{ type: "text", text: secret }] }], async () => { throw new Error(secret); })).rejects.toThrow();
    const encoded = Buffer.from(`image${secret}`).toString("base64");
    await expect(redactChatMessages([{ parts: [{ type: "file", url: `data:image/png;base64,${encoded}` }] }], async () => "NAME")).rejects.toThrow("unsafe chat input");
  });

  it("preserves safe image data URLs", async () => {
    const url = `data:image/png;base64,${Buffer.from("safe image bytes").toString("base64")}`;
    const messages = [{ parts: [{ type: "file", url }, { type: "file", url: "data:image/jpeg,safe%20image" }, { type: "text", text: "data: example" }] }];
    expect(await redactChatMessages(messages, async () => "NAME")).toEqual(messages);
  });
});
