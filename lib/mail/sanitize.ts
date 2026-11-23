/**
 * HTML sanitiser for inbound mail.
 *
 * An inbox renders markup written by strangers. A regex that strips <script> is
 * not a sanitiser: it misses <scr<script>ipt>, unclosed tags, and attributes
 * whose value contains a tag. So this module does not filter HTML, it rebuilds
 * it: the input is tokenised, and the output is assembled only from tags and
 * attributes on an explicit allowlist. Anything not understood is dropped, and
 * text is escaped. The result cannot contain a construct this file did not
 * choose to emit.
 *
 * Two product rules ride on top of that:
 *   - Remote images are off by default. A tracking pixel is a read receipt the
 *     recipient never agreed to, and it confirms the address is live.
 *   - Links are forced to rel="noopener noreferrer nofollow" and target=_blank,
 *     so a mail cannot navigate the tab that renders it.
 */

const MAX_INPUT_CHARS = 500_000;
const MAX_OUTPUT_CHARS = 200_000;

/** Tags that may appear in the output, with the attributes each may carry. */
const ALLOWED_TAGS: Record<string, ReadonlySet<string>> = {
  p: new Set(),
  br: new Set(),
  hr: new Set(),
  div: new Set(),
  span: new Set(),
  strong: new Set(),
  b: new Set(),
  em: new Set(),
  i: new Set(),
  u: new Set(),
  s: new Set(),
  small: new Set(),
  sub: new Set(),
  sup: new Set(),
  blockquote: new Set(),
  pre: new Set(),
  code: new Set(),
  ul: new Set(),
  ol: new Set(),
  li: new Set(),
  h1: new Set(),
  h2: new Set(),
  h3: new Set(),
  h4: new Set(),
  h5: new Set(),
  h6: new Set(),
  table: new Set(),
  thead: new Set(),
  tbody: new Set(),
  tfoot: new Set(),
  tr: new Set(),
  td: new Set(["colspan", "rowspan"]),
  th: new Set(["colspan", "rowspan"]),
  caption: new Set(),
  a: new Set(["href", "title"]),
  img: new Set(["src", "alt", "width", "height"]),
};

const VOID_TAGS = new Set(["br", "hr", "img"]);

/**
 * Dropped together with everything inside them. `svg` and `math` are here
 * because both can carry script in foreign-content namespaces, where ordinary
 * tag filtering does not apply.
 */
const DROP_WITH_CONTENT = new Set([
  "script", "style", "iframe", "object", "embed", "noscript", "template",
  "form", "input", "button", "select", "option", "textarea", "link", "meta",
  "base", "svg", "math", "frame", "frameset", "applet", "audio", "video",
  "source", "track", "canvas",
]);

const SAFE_HREF_SCHEMES = ["https:", "http:", "mailto:", "tel:"];
const SAFE_SRC_SCHEMES = ["https:", "http:"];

function escapeText(value: string): string {
  return value
    .replace(/&(?!#?\w+;)/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeAttribute(value: string): string {
  return value
    // Entity-aware: "&amp;" in a URL must not become "&amp;amp;", which would
    // change the link the sender wrote.
    .replace(/&(?!#?\w+;)/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Browsers ignore tabs, newlines and NULs inside a scheme, so "java\tscript:"
 * is a working javascript URL. Those characters are removed before the scheme
 * is read, which is why the check is on the cleaned value and not the raw one.
 */
function cleanUrl(value: string): string {
  return value.replace(/[\u0000-\u001f\u007f]/g, "").trim();
}

function isSafeUrl(value: string, allowedSchemes: string[]): boolean {
  const cleaned = cleanUrl(value);
  if (!cleaned) return false;
  const lower = cleaned.toLowerCase();
  // A relative URL inherits whatever origin renders it; refuse rather than guess.
  if (!/^[a-z][a-z0-9+.-]*:/.test(lower)) return false;
  return allowedSchemes.some((scheme) => lower.startsWith(scheme));
}

type ParsedTag = {
  name: string;
  closing: boolean;
  attributes: Array<{ name: string; value: string }>;
  selfClosing: boolean;
  end: number;
};

/** Reads one tag starting at `start` (which points at "<"). Returns null if it is not a tag. */
function readTag(input: string, start: number): ParsedTag | null {
  const head = /^<\/?([a-zA-Z][a-zA-Z0-9:-]*)/.exec(input.slice(start, start + 64));
  if (!head) return null;
  const closing = input[start + 1] === "/";
  const name = head[1].toLowerCase();

  let i = start + head[0].length;
  const attributes: Array<{ name: string; value: string }> = [];
  let selfClosing = false;

  while (i < input.length) {
    const char = input[i];
    if (char === ">") {
      i += 1;
      break;
    }
    if (char === "/" && input[i + 1] === ">") {
      selfClosing = true;
      i += 2;
      break;
    }
    if (/\s/.test(char)) {
      i += 1;
      continue;
    }
    const nameMatch = /^[a-zA-Z_:][-a-zA-Z0-9_:.]*/.exec(input.slice(i, i + 128));
    if (!nameMatch) {
      i += 1;
      continue;
    }
    const attrName = nameMatch[0].toLowerCase();
    i += nameMatch[0].length;
    while (i < input.length && /\s/.test(input[i])) i += 1;
    if (input[i] !== "=") {
      attributes.push({ name: attrName, value: "" });
      continue;
    }
    i += 1;
    while (i < input.length && /\s/.test(input[i])) i += 1;
    const quote = input[i];
    if (quote === '"' || quote === "'") {
      const close = input.indexOf(quote, i + 1);
      const end = close === -1 ? input.length : close;
      attributes.push({ name: attrName, value: input.slice(i + 1, end) });
      i = end + 1;
    } else {
      const bare = /^[^\s>]*/.exec(input.slice(i))?.[0] ?? "";
      attributes.push({ name: attrName, value: bare });
      i += bare.length;
    }
  }

  return { name, closing, attributes, selfClosing, end: i };
}

/** Index just past the matching close tag for a tag dropped with its content. */
function skipElement(input: string, name: string, from: number): number {
  const pattern = new RegExp(`</${name}\\s*>`, "i");
  const rest = input.slice(from);
  const found = pattern.exec(rest);
  return found ? from + found.index + found[0].length : input.length;
}

function renderAttributes(
  tag: string,
  attributes: Array<{ name: string; value: string }>,
  allowImages: boolean
): string {
  const allowed = ALLOWED_TAGS[tag];
  if (!allowed) return "";
  const rendered: string[] = [];
  const seen = new Set<string>();

  for (const attribute of attributes) {
    const name = attribute.name;
    // Event handlers, style, and anything carrying its own URL policy are not
    // on the allowlist at all; this check is the second line.
    if (!allowed.has(name) || seen.has(name)) continue;
    if (name.startsWith("on")) continue;

    let value = attribute.value;
    if (name === "href") {
      if (!isSafeUrl(value, SAFE_HREF_SCHEMES)) continue;
      value = cleanUrl(value);
    }
    if (name === "src") {
      // Remote images are the tracking-pixel path; when images are off the tag
      // is dropped entirely rather than rendered broken.
      if (!allowImages || !isSafeUrl(value, SAFE_SRC_SCHEMES)) continue;
      value = cleanUrl(value);
    }
    if (name === "colspan" || name === "rowspan" || name === "width" || name === "height") {
      if (!/^\d{1,4}$/.test(value.trim())) continue;
      value = value.trim();
    }
    if (name === "alt" || name === "title") {
      value = value.slice(0, 300);
    }

    seen.add(name);
    rendered.push(`${name}="${escapeAttribute(value)}"`);
  }

  if (tag === "a" && seen.has("href")) {
    rendered.push('target="_blank"', 'rel="noopener noreferrer nofollow"');
  }

  return rendered.length ? ` ${rendered.join(" ")}` : "";
}

export type SanitizeOptions = {
  /** Off by default: a remote image is a read receipt. */
  allowImages?: boolean;
};

/**
 * Returns HTML that is safe to inject into the inbox. Output length is capped
 * so a pathological message cannot be used to exhaust the renderer.
 */
export function sanitizeHtml(input: string, options: SanitizeOptions = {}): string {
  const allowImages = options.allowImages === true;
  const source = String(input ?? "").slice(0, MAX_INPUT_CHARS);
  const out: string[] = [];
  // Unclosed tags are the normal case in mail HTML. Left alone they would be
  // closed by the browser at the end of our container, so styling from one
  // message could bleed into the next element on the page. We close them
  // ourselves, in reverse order.
  const open: string[] = [];
  let i = 0;
  let textStart = 0;

  const flushText = (end: number) => {
    if (end > textStart) out.push(escapeText(source.slice(textStart, end)));
  };

  while (i < source.length) {
    const lt = source.indexOf("<", i);
    if (lt === -1) break;

    // Comments and doctypes never reach the output.
    if (source.startsWith("<!--", lt)) {
      const close = source.indexOf("-->", lt + 4);
      flushText(lt);
      i = close === -1 ? source.length : close + 3;
      textStart = i;
      continue;
    }
    if (source.startsWith("<!", lt) || source.startsWith("<?", lt)) {
      const close = source.indexOf(">", lt);
      flushText(lt);
      i = close === -1 ? source.length : close + 1;
      textStart = i;
      continue;
    }

    const tag = readTag(source, lt);
    if (!tag) {
      // A lone "<" is text, not markup. Escape it by advancing past it.
      flushText(lt + 1);
      i = lt + 1;
      textStart = i;
      continue;
    }

    flushText(lt);

    if (DROP_WITH_CONTENT.has(tag.name)) {
      i = tag.closing ? tag.end : skipElement(source, tag.name, tag.end);
      textStart = i;
      continue;
    }

    if (tag.name === "img" && !allowImages) {
      i = tag.end;
      textStart = i;
      continue;
    }

    if (!ALLOWED_TAGS[tag.name]) {
      // Unknown tag: drop the tag, keep whatever it contained.
      i = tag.end;
      textStart = i;
      continue;
    }

    if (tag.closing) {
      if (!VOID_TAGS.has(tag.name) && open.includes(tag.name)) {
        // Close anything left open inside it, then the tag itself.
        for (let index = open.length - 1; index >= 0; index -= 1) {
          const name = open.pop() as string;
          out.push(`</${name}>`);
          if (name === tag.name) break;
        }
      }
    } else {
      const attributes = renderAttributes(tag.name, tag.attributes, allowImages);
      out.push(`<${tag.name}${attributes}>`);
      if (!VOID_TAGS.has(tag.name) && !tag.selfClosing) open.push(tag.name);
    }

    i = tag.end;
    textStart = i;
  }

  flushText(source.length);
  while (open.length > 0) out.push(`</${open.pop()}>`);

  return out.join("").slice(0, MAX_OUTPUT_CHARS);
}

/**
 * Plain text for the AI step and for previews. Never used as the rendered body,
 * so a tag that survives here cannot become markup anywhere.
 */
export function htmlToText(input: string): string {
  return String(input ?? "")
    .replace(/<(script|style)[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    // &amp; is decoded last so "&amp;lt;" stays the literal text "&lt;".
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Display name of an RFC 5322 From header: everything before the address. Splitting on "<"
 * keeps no markup at all, where stripping tags with a regex could leave a partial "<script".
 */
export function displayName(from: string): string | null {
  const name = from.split("<")[0].replace(/["<>]/g, "").trim();
  return name || null;
}
