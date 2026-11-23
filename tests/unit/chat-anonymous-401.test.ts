import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * An anonymous POST to /api/chat answered 400 (body validation ran first), which
 * both mislabels the failure and describes the validation rules to a caller with
 * no session. The session check must come before the body is read.
 */
const source = readFileSync("app/(chat)/api/chat/route.ts", "utf8");
const handler = source.slice(source.indexOf("async function POSTImpl"));

describe("/api/chat anonymous caller", () => {
  it("checks the session before parsing the body", () => {
    const session = handler.indexOf("await getWorkspaceContext()");
    const unauthorized = handler.indexOf('"unauthorized:chat"');
    const body = handler.indexOf("request.json()");
    expect(session).toBeGreaterThan(-1);
    expect(unauthorized).toBeGreaterThan(session);
    expect(body).toBeGreaterThan(unauthorized);
  });
});
