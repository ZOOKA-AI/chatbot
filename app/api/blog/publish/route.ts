import { createHmac, timingSafeEqual } from "node:crypto";
import { publishPost } from "@/lib/blog/store";


/**
 * Publishing endpoint used by the daily writing workflow.
 *
 * Auth is an HMAC derived from AUTH_SECRET, so no extra environment variable is
 * needed: key = HMAC-SHA256(AUTH_SECRET, "zooka-blog-publish") as hex.
 * Bodies are stored as Markdown and rendered without raw HTML.
 */
function expectedKey(): string | null {
  const secret = process.env.AUTH_SECRET;
  if (!secret) return null;
  return createHmac("sha256", secret).update("zooka-blog-publish").digest("hex");
}

function authorised(request: Request): boolean {
  const provided = request.headers.get("x-blog-key") ?? "";
  const expected = expectedKey();
  if (!expected || provided.length !== expected.length) return false;
  try {
    return timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  if (!authorised(request)) {
    return Response.json({ ok: false, error: "unauthorised" }, { status: 401 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const title = typeof payload.title === "string" ? payload.title.trim() : "";
  const body = typeof payload.body === "string" ? payload.body.trim() : "";
  const slugInput =
    typeof payload.slug === "string" && payload.slug.trim() ? payload.slug : title;

  if (!title || body.length < 200) {
    return Response.json(
      { ok: false, error: "title_and_body_required", hint: "body must be at least 200 characters" },
      { status: 400 }
    );
  }

  try {
    const result = await publishPost({
      slug: slugInput,
      lang: typeof payload.lang === "string" ? payload.lang : "en",
      title,
      body,
      excerpt: typeof payload.excerpt === "string" ? payload.excerpt : null,
      keyword: typeof payload.keyword === "string" ? payload.keyword : null,
      author: typeof payload.author === "string" ? payload.author : "Zooka AI",
      status: payload.status === "published" ? "published" : "draft",
      publishedAt: typeof payload.publishedAt === "string" ? payload.publishedAt : null,
    });

    return Response.json({
      ok: true,
      slug: result.slug,
      status: result.status,
      url: result.status === "published" ? `https://zooka-ai.com/blog/${result.slug}` : null,
    });
  } catch (error) {
    return Response.json(
      { ok: false, error: "publish_failed", detail: String((error as Error)?.message ?? error) },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  if (!authorised(request)) {
    return Response.json({ ok: false, error: "unauthorised" }, { status: 401 });
  }
  return Response.json({ ok: true, endpoint: "blog_publish", method: "POST" });
}
