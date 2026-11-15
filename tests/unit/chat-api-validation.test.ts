import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { beforeEach, describe, test, vi } from "vitest";

/**
 * D1: validation on the chat endpoints.
 *
 * Honest scope note: two of the seven endpoints were already validated before
 * this work (chat POST parses a zod schema, workspace PATCH parses a rename
 * schema behind an admin check), and chat/[id]/stream is a stub that returns 204
 * and reads nothing. The five below were the ones handing raw query strings to
 * the database, plus the chat POST body, which was validated but unbounded.
 */

const mocks = vi.hoisted(() => ({
  getDocumentsById: vi.fn(),
  getVotesByChatId: vi.fn(),
  getChatById: vi.fn(),
  getSuggestionsByDocumentId: vi.fn(),
  getChatsByOrganizationId: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("@/lib/db/queries", () => ({
  getDocumentsById: mocks.getDocumentsById,
  deleteDocumentsByIdAfterTimestamp: vi.fn(),
  saveDocument: vi.fn(),
  getVotesByChatId: mocks.getVotesByChatId,
  getChatById: mocks.getChatById,
  voteMessage: vi.fn(),
  getSuggestionsByDocumentId: mocks.getSuggestionsByDocumentId,
  getChatsByOrganizationId: mocks.getChatsByOrganizationId,
  deleteAllChatsByOrganizationId: vi.fn(),
}));

vi.mock("@/lib/auth/workspace", () => ({
  getWorkspaceContext: async () => ({
    organizationId: "org-alpha",
    user: { id: "user-1" },
    session: { user: { id: "user-1" } },
  }),
  requireWorkspaceRole: async () => ({ organizationId: "org-alpha" }),
}));

import { uuidSchema, limitSchema, queryParamIsValid, timestampSchema } from "@/lib/validation/chat";
import { postRequestBodySchema } from "@/app/(chat)/api/chat/schema";

const UUID = "3f6a1d2e-4b5c-4d7e-8f90-1a2b3c4d5e6f";

const get = (url: string) => new Request(`https://zooka.test${url}`);

beforeEach(() => {
  for (const fn of Object.values(mocks)) fn.mockReset();
  mocks.getDocumentsById.mockResolvedValue([{ id: UUID }]);
  mocks.getVotesByChatId.mockResolvedValue([]);
  mocks.getChatById.mockResolvedValue({ id: UUID, organizationId: "org-alpha", userId: "user-1" });
  mocks.getSuggestionsByDocumentId.mockResolvedValue([{ id: "s1" }]);
  mocks.getChatsByOrganizationId.mockResolvedValue([]);
});

describe("the query parameter guard preserves the absent case", () => {
  test("absent and empty are left to the handler's own missing-parameter path", () => {
    assert.equal(queryParamIsValid(null, uuidSchema, "id", "rule").ok, true);
    assert.equal(queryParamIsValid("", uuidSchema, "id", "rule").ok, true);
  });

  test("a malformed value is refused, a good one passes", () => {
    const bad = queryParamIsValid("not-a-uuid", uuidSchema, "id", "must be a valid id");
    assert.equal(bad.ok, false);
    assert.ok(bad.ok === false && bad.response.status === 400);
    assert.equal(queryParamIsValid(UUID, uuidSchema, "id", "must be a valid id").ok, true);
  });

  test("the limit rule rejects NaN, zero and absurd numbers", () => {
    for (const raw of ["abc", "0", "-1", "51", "1.5", ""]) {
      assert.equal(limitSchema.safeParse(raw).success, false, raw);
    }
    for (const raw of ["1", "10", "50"]) {
      assert.equal(limitSchema.safeParse(raw).success, true, raw);
    }
  });

  test("the timestamp rule rejects text and negatives", () => {
    assert.equal(timestampSchema.safeParse("abc").success, false);
    assert.equal(timestampSchema.safeParse("-5").success, false);
    assert.equal(timestampSchema.safeParse("1730000000000").success, true);
  });
});

describe("document endpoint", () => {
  test("a malformed id is refused before the database is touched", async () => {
    const { GET } = await import("@/app/(chat)/api/document/route");
    const response = await GET(get("/api/document?id=../../etc/passwd"));
    assert.equal(response.status, 400);
    assert.equal(mocks.getDocumentsById.mock.calls.length, 0);
  });

  test("a valid id reaches the query scoped to the caller's organisation", async () => {
    const { GET } = await import("@/app/(chat)/api/document/route");
    const response = await GET(get(`/api/document?id=${UUID}`));
    assert.equal(response.status, 200);
    const [args] = mocks.getDocumentsById.mock.calls[0];
    assert.equal(args.id, UUID);
    assert.equal(args.organizationId, "org-alpha");
  });

  test("a missing id keeps the original contract", async () => {
    const { GET } = await import("@/app/(chat)/api/document/route");
    const response = await GET(get("/api/document"));
    assert.equal(response.status, 400);
  });
});

describe("vote endpoint", () => {
  test("a malformed chatId is refused before the lookup", async () => {
    const { GET } = await import("@/app/(chat)/api/vote/route");
    const response = await GET(get("/api/vote?chatId=1'or'1"));
    assert.equal(response.status, 400);
    assert.equal(mocks.getChatById.mock.calls.length, 0);
  });

  test("a valid chatId is looked up inside the organisation", async () => {
    const { GET } = await import("@/app/(chat)/api/vote/route");
    const response = await GET(get(`/api/vote?chatId=${UUID}`));
    assert.equal(response.status, 200);
    assert.equal(mocks.getChatById.mock.calls[0][0].organizationId, "org-alpha");
  });
});

describe("suggestions endpoint", () => {
  test("a malformed documentId is refused", async () => {
    const { GET } = await import("@/app/(chat)/api/suggestions/route");
    const response = await GET(get("/api/suggestions?documentId=x"));
    assert.equal(response.status, 400);
    assert.equal(mocks.getSuggestionsByDocumentId.mock.calls.length, 0);
  });

  test("a valid documentId is scoped", async () => {
    const { GET } = await import("@/app/(chat)/api/suggestions/route");
    const response = await GET(get(`/api/suggestions?documentId=${UUID}`));
    assert.equal(response.status, 200);
    assert.equal(
      mocks.getSuggestionsByDocumentId.mock.calls[0][0].organizationId,
      "org-alpha"
    );
  });
});

describe("history endpoint", () => {
  test("a non-numeric or out-of-range limit is refused", async () => {
    const { GET } = await import("@/app/(chat)/api/history/route");
    for (const query of ["limit=abc", "limit=0", "limit=500", "limit=2.5"]) {
      const response = await GET(new NextRequest(`https://zooka.test/api/history?${query}`));
      assert.equal(response.status, 400, query);
    }
    assert.equal(mocks.getChatsByOrganizationId.mock.calls.length, 0);
  });

  test("an oversized cursor is refused instead of reaching the query builder", async () => {
    const { GET } = await import("@/app/(chat)/api/history/route");
    const response = await GET(
      new NextRequest(`https://zooka.test/api/history?starting_after=${"z".repeat(200)}`)
    );
    assert.equal(response.status, 400);
    assert.equal(mocks.getChatsByOrganizationId.mock.calls.length, 0);
  });

  test("a valid request passes with a defaulted limit", async () => {
    const { GET } = await import("@/app/(chat)/api/history/route");
    const response = await GET(new NextRequest("https://zooka.test/api/history"));
    assert.equal(response.status, 200);
    assert.equal(mocks.getChatsByOrganizationId.mock.calls.length, 1);
  });
});

describe("vote PATCH body", () => {
  const patch = (body: unknown) =>
    new Request("https://zooka.test/api/vote", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    });

  test("malformed JSON, bad ids, unknown vote type and extra fields are refused", async () => {
    const { PATCH } = await import("@/app/(chat)/api/vote/route");
    for (const body of [
      "{oops",
      { chatId: "x", messageId: UUID, type: "up" },
      { chatId: UUID, messageId: "not-a-uuid", type: "up" },
      { chatId: UUID, messageId: UUID, type: "sideways" },
      { chatId: UUID, messageId: UUID, type: "up", isAdmin: true },
    ]) {
      const response = await PATCH(patch(body));
      assert.equal(response.status, 400, JSON.stringify(body).slice(0, 40));
    }
  });

  test("a valid vote reaches the handler", async () => {
    const { PATCH } = await import("@/app/(chat)/api/vote/route");
    const response = await PATCH(patch({ chatId: UUID, messageId: UUID, type: "down" }));
    assert.notEqual(response.status, 400);
  });
});

describe("chat POST body", () => {
  const base = {
    id: UUID,
    selectedChatModel: "chat-model",
    selectedVisibilityType: "private" as const,
  };

  test("the message array is bounded", () => {
    const many = Array.from({ length: 201 }, (_, i) => ({
      id: `m${i}`,
      role: "user",
      parts: [{ type: "text", text: "hi" }],
    }));
    assert.equal(postRequestBodySchema.safeParse({ ...base, messages: many }).success, false);

    const long = Array.from({ length: 60 }, (_, i) => ({
      id: `m${i}`,
      role: "user",
      parts: [{ type: "text", text: "hi" }],
    }));
    assert.equal(
      postRequestBodySchema.safeParse({ ...base, messages: long }).success,
      true,
      "an ordinary long conversation must still be accepted"
    );
  });

  test("parts per message and text length are bounded", () => {
    const tooManyParts = {
      ...base,
      message: {
        id: UUID,
        role: "user",
        parts: Array.from({ length: 9 }, () => ({ type: "text", text: "x" })),
      },
    };
    assert.equal(postRequestBodySchema.safeParse(tooManyParts).success, false);

    const tooLongText = {
      ...base,
      message: { id: UUID, role: "user", parts: [{ type: "text", text: "x".repeat(2001) }] },
    };
    assert.equal(postRequestBodySchema.safeParse(tooLongText).success, false);
  });

  test("the model identifier is bounded and shaped", () => {
    for (const model of ["", "x".repeat(65), "../../etc/passwd", "model name"]) {
      assert.equal(
        postRequestBodySchema.safeParse({ ...base, selectedChatModel: model }).success,
        false,
        model
      );
    }
    assert.equal(
      postRequestBodySchema.safeParse({ ...base, selectedChatModel: "chat-model-reasoning" })
        .success,
      true
    );
  });

  test("an unknown role is refused", () => {
    const bad = {
      ...base,
      messages: [{ id: "m1", role: "root", parts: [] }],
    };
    assert.equal(postRequestBodySchema.safeParse(bad).success, false);
  });
});
