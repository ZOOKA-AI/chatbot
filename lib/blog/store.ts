import "server-only";

import postgres from "postgres";

export type BlogLang = "en" | "ar";

export type BlogPostSummary = {
  slug: string;
  lang: BlogLang;
  title: string;
  excerpt: string | null;
  keyword: string | null;
  publishedAt: string;
};

export type BlogPost = BlogPostSummary & {
  body: string;
  author: string | null;
};

/**
 * Small standalone client: the blog only reads and writes one table, so it does
 * not need the full Drizzle query layer. `prepare: false` is required because
 * production talks to the Supabase transaction pooler.
 */
let client: ReturnType<typeof postgres> | null = null;

function db() {
  if (client) return client;
  const url = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
  if (!url) throw new Error("blog_db_missing_connection_string");
  client = postgres(url, { max: 1, prepare: false, idle_timeout: 20 });
  return client;
}

type Row = {
  slug: string;
  lang: string;
  title: string;
  excerpt: string | null;
  keyword: string | null;
  body: string;
  author: string | null;
  published_at: Date | string;
};

function normaliseLang(value: string): BlogLang {
  return value === "ar" ? "ar" : "en";
}

function isoDate(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

export async function listPublishedPosts(limit = 50): Promise<BlogPostSummary[]> {
  try {
    const rows = await db()<Row[]>`
      select slug, lang, title, excerpt, keyword, body, author, published_at
      from "BlogPost"
      where status = 'published'
      order by published_at desc nulls last
      limit ${limit}
    `;
    return rows.map((row) => ({
      slug: row.slug,
      lang: normaliseLang(row.lang),
      title: row.title,
      excerpt: row.excerpt,
      keyword: row.keyword,
      publishedAt: isoDate(row.published_at),
    }));
  } catch (error) {
    console.error("blog_list_failed", error);
    return [];
  }
}

export async function getPublishedPost(slug: string): Promise<BlogPost | null> {
  try {
    const rows = await db()<Row[]>`
      select slug, lang, title, excerpt, keyword, body, author, published_at
      from "BlogPost"
      where status = 'published' and slug = ${slug}
      limit 1
    `;
    const row = rows[0];
    if (!row) return null;
    return {
      slug: row.slug,
      lang: normaliseLang(row.lang),
      title: row.title,
      excerpt: row.excerpt,
      keyword: row.keyword,
      body: row.body,
      author: row.author,
      publishedAt: isoDate(row.published_at),
    };
  } catch (error) {
    console.error("blog_get_failed", error);
    return null;
  }
}

export type PublishInput = {
  slug: string;
  lang?: string;
  title: string;
  body: string;
  excerpt?: string | null;
  keyword?: string | null;
  author?: string | null;
  status?: "draft" | "published";
  publishedAt?: string | null;
};

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 90)
    .replace(/^-|-$/g, "");
}

export async function publishPost(input: PublishInput) {
  const slug = slugify(input.slug || input.title);
  if (!slug) throw new Error("blog_invalid_slug");
  const status = input.status === "published" ? "published" : "draft";
  const publishedAt =
    status === "published" ? input.publishedAt || new Date().toISOString() : input.publishedAt || null;
  const excerpt =
    input.excerpt ?? `${input.body.replace(/[#*_>`\-\n]+/g, " ").trim().slice(0, 180)}…`;

  const rows = await db()`
    insert into "BlogPost" (slug, lang, title, excerpt, body, keyword, status, author, published_at)
    values (
      ${slug},
      ${normaliseLang(input.lang ?? "en")},
      ${input.title},
      ${excerpt},
      ${input.body},
      ${input.keyword ?? null},
      ${status},
      ${input.author ?? "Zooka AI"},
      ${publishedAt}
    )
    on conflict (slug) do update set
      lang = excluded.lang,
      title = excluded.title,
      excerpt = excluded.excerpt,
      body = excluded.body,
      keyword = excluded.keyword,
      status = excluded.status,
      author = excluded.author,
      published_at = coalesce(excluded.published_at, "BlogPost".published_at),
      updated_at = now()
    returning slug, status, published_at
  `;

  return rows[0] as { slug: string; status: string; published_at: Date | string | null };
}
