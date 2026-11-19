import type { ReactNode } from "react";

/**
 * Deliberately small Markdown renderer: the blog stores plain Markdown from the
 * writing workflow, and this covers exactly the constructs it produces
 * (headings, paragraphs, lists, quotes, code fences, bold/italic/code/links).
 * No raw HTML is ever injected, so untrusted drafts cannot add markup.
 */
function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[[^\]]+\]\([^)\s]+\))/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null = pattern.exec(text);
  let index = 0;

  while (match) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }
    const token = match[0];
    const key = `${keyPrefix}-i${index++}`;

    if (token.startsWith("**")) {
      nodes.push(<strong key={key}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith("`")) {
      nodes.push(
        <code key={key} className="rounded bg-muted px-1 py-0.5 text-[0.9em]">
          {token.slice(1, -1)}
        </code>
      );
    } else if (token.startsWith("[")) {
      const label = token.slice(1, token.indexOf("]"));
      const href = token.slice(token.indexOf("](") + 2, -1);
      const external = href.startsWith("http");
      nodes.push(
        <a
          key={key}
          href={href}
          className="text-primary underline underline-offset-4"
          {...(external ? { target: "_blank", rel: "noopener noreferrer nofollow" } : {})}
        >
          {label}
        </a>
      );
    } else {
      nodes.push(<em key={key}>{token.slice(1, -1)}</em>);
    }

    lastIndex = match.index + token.length;
    match = pattern.exec(text);
  }

  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes;
}

export function renderMarkdown(markdown: string): ReactNode {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let paragraph: string[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  let quote: string[] = [];
  let code: string[] | null = null;
  let key = 0;

  const flushParagraph = () => {
    if (!paragraph.length) return;
    const text = paragraph.join(" ");
    blocks.push(<p key={`p${key++}`}>{renderInline(text, `p${key}`)}</p>);
    paragraph = [];
  };
  const flushList = () => {
    if (!list) return;
    const items = list.items.map((item, i) => (
      <li key={`li${key}-${i}`}>{renderInline(item, `li${key}-${i}`)}</li>
    ));
    blocks.push(
      list.ordered ? (
        <ol key={`ol${key++}`} className="list-decimal space-y-2 ps-6">
          {items}
        </ol>
      ) : (
        <ul key={`ul${key++}`} className="list-disc space-y-2 ps-6">
          {items}
        </ul>
      )
    );
    list = null;
  };
  const flushQuote = () => {
    if (!quote.length) return;
    blocks.push(
      <blockquote
        key={`q${key++}`}
        className="border-primary/40 border-s-4 ps-4 text-muted-foreground"
      >
        {renderInline(quote.join(" "), `q${key}`)}
      </blockquote>
    );
    quote = [];
  };
  const flushAll = () => {
    flushParagraph();
    flushList();
    flushQuote();
  };

  for (const raw of lines) {
    const line = raw.trimEnd();

    if (line.startsWith("```")) {
      if (code) {
        blocks.push(
          <pre
            key={`c${key++}`}
            className="overflow-x-auto rounded-xl bg-muted p-4 text-xs"
            dir="ltr"
          >
            <code>{code.join("\n")}</code>
          </pre>
        );
        code = null;
      } else {
        flushAll();
        code = [];
      }
      continue;
    }
    if (code) {
      code.push(raw);
      continue;
    }

    if (!line.trim()) {
      flushAll();
      continue;
    }

    const heading = /^(#{2,4})\s+(.*)$/.exec(line);
    if (heading) {
      flushAll();
      const level = heading[1].length;
      const text = heading[2];
      const className =
        level === 2
          ? "mt-8 text-2xl font-semibold"
          : level === 3
            ? "mt-6 text-xl font-semibold"
            : "mt-5 text-lg font-semibold";
      const Tag = (`h${level}` as unknown) as "h2";
      blocks.push(<Tag key={`h${key++}`} className={className}>{renderInline(text, `h${key}`)}</Tag>);
      continue;
    }

    const bullet = /^[-*]\s+(.*)$/.exec(line);
    if (bullet) {
      flushParagraph();
      flushQuote();
      if (!list || list.ordered) {
        flushList();
        list = { ordered: false, items: [] };
      }
      list.items.push(bullet[1]);
      continue;
    }

    const numbered = /^\d+[.)]\s+(.*)$/.exec(line);
    if (numbered) {
      flushParagraph();
      flushQuote();
      if (!list || !list.ordered) {
        flushList();
        list = { ordered: true, items: [] };
      }
      list.items.push(numbered[1]);
      continue;
    }

    const quoted = /^>\s?(.*)$/.exec(line);
    if (quoted) {
      flushParagraph();
      flushList();
      quote.push(quoted[1]);
      continue;
    }

    flushList();
    flushQuote();
    paragraph.push(line.trim());
  }

  if (code) {
    blocks.push(
      <pre key={`c${key++}`} className="overflow-x-auto rounded-xl bg-muted p-4 text-xs" dir="ltr">
        <code>{code.join("\n")}</code>
      </pre>
    );
  }
  flushAll();

  return <>{blocks}</>;
}
