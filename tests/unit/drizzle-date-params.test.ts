import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { describe, expect, it } from "vitest";
import { dateSafeSerialize, drizzleDateSafe } from "@/lib/db/date-params";

// GET /api/agents/status returned 500 in production after the drizzle-orm
// 0.45 upgrade: a Date bound into a raw sql template reached postgres-js
// unserialized ("Received an instance of Date").
const fakeUrl = "postgres://user:pass@127.0.0.1:1/none";

describe("Date parameters in raw sql", () => {
  it("plain drizzle() leaves the timestamptz serializer as a pass-through (the bug)", () => {
    const client = postgres(fakeUrl, { max: 1 });
    drizzle(client);
    const at = new Date("2026-11-23T06:03:38.189Z");
    expect((client.options.serializers as any)["1184"](at)).toBe(at);
  });

  it("drizzleDateSafe() turns a Date into ISO text and keeps strings as they are", () => {
    const client = postgres(fakeUrl, { max: 1 });
    drizzleDateSafe(client);
    const s = client.options.serializers as any;
    for (const type of ["1184", "1114", "1082", "1083"]) {
      expect(s[type](new Date("2026-11-23T06:03:38.189Z"))).toBe("2026-11-23T06:03:38.189Z");
      expect(s[type]("2026-11-23 06:03:38")).toBe("2026-11-23 06:03:38");
    }
  });

  it("re-applies after drizzle() rewrites the serializers on the same client", () => {
    const client = postgres(fakeUrl, { max: 1 });
    drizzleDateSafe(client);
    drizzleDateSafe(client, { logger: false });
    expect((client.options.serializers as any)["1184"](new Date(0))).toBe("1970-01-01T00:00:00.000Z");
  });

  it("dateSafeSerialize passes non-dates through", () => {
    expect(dateSafeSerialize(5)).toBe(5);
    expect(dateSafeSerialize(null)).toBe(null);
  });
});
