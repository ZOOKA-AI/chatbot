import {
  createPersistentSession,
  disposePersistentSession,
  mintHandle,
  navigateInSession,
  clickInSession,
  readBrowserState,
  scrollInSession,
  sessionScreenshotPng,
  typeInSession,
  type PersistentHandle,
} from "./persistent";

/**
 * The bridge between a stored browser session and a Chromium that outlives the worker.
 *
 * The rows in BrowserSession hold two ids, not a connection. Whoever needs the browser mints a signed
 * handle from those ids plus the workspace on the row, opens a short CDP connection, does one thing,
 * and closes it. Nothing is cached across requests, so a killed worker costs nothing: the context
 * belongs to Chromium (created with disposeOnDetach=false), not to a socket this process holds.
 *
 * The workspace always comes from the stored row, never from the request body or a header, so a
 * caller cannot promote itself into another tenant by asserting an organization id.
 */

export type PersistentSessionRow = {
  id: string;
  organizationId: string;
  browserContextId: string | null;
  targetId: string | null;
};

export type AdapterResult<T> = { ok: true; value: T } | { ok: false; code: string; message: string };

/** The engine endpoint, or null when this environment has no persistent browser configured. */
export function persistentEngine(): string | null {
  const raw = process.env.BROWSER_CDP_URL?.trim();
  if (!raw) return null;
  if (!/^(wss?|https?):\/\//.test(raw)) return null;
  return raw;
}

export function hasPersistentHandle(row: { browserContextId: string | null; targetId: string | null }): boolean {
  return Boolean(row.browserContextId && row.targetId);
}

/** Mint a signed handle from stored ids. Throws nothing: a missing endpoint is a soft "no browser". */
export function handleFor(row: PersistentSessionRow): AdapterResult<PersistentHandle> {
  const endpoint = persistentEngine();
  if (!endpoint) return { ok: false, code: "engine_not_configured", message: "BROWSER_CDP_URL is not set" };
  if (!row.browserContextId || !row.targetId) {
    return { ok: false, code: "not_resumable", message: "session has no persistent ids" };
  }
  return {
    ok: true,
    value: mintHandle({
      endpoint,
      browserContextId: row.browserContextId,
      targetId: row.targetId,
      organizationId: row.organizationId,
    }),
  };
}

/** Start a session whose context is owned by Chromium, then report where it actually landed. */
export async function startPersistentSession(input: {
  organizationId: string;
  startUrl: string | null;
}): Promise<AdapterResult<{ browserContextId: string; targetId: string; url: string; title: string }>> {
  const endpoint = persistentEngine();
  if (!endpoint) return { ok: false, code: "engine_not_configured", message: "BROWSER_CDP_URL is not set" };
  const created = await createPersistentSession({
    endpoint,
    url: input.startUrl ?? "about:blank",
    organizationId: input.organizationId,
  });
  if (created.ok === false) return { ok: false, code: created.code, message: created.message };
  const handle = created.value;

  // The title is read back from the page rather than assumed from the start URL: a redirect or a
  // refused connection must show up as what the customer would see.
  const state = await readBrowserState({
    handle,
    owner: { organizationId: input.organizationId },
    asker: { organizationId: input.organizationId },
  });
  return {
    ok: true,
    value: {
      browserContextId: handle.browserContextId,
      targetId: handle.targetId,
      url: state.ok ? state.value.url : (input.startUrl ?? "about:blank"),
      title: state.ok ? state.value.title : "",
    },
  };
}

/** Read the page as it is right now. Also the cheapest proof that the browser is still alive. */
export async function persistentState(row: PersistentSessionRow) {
  const handle = handleFor(row);
  if (handle.ok === false) return handle;
  return readBrowserState({
    handle: handle.value,
    owner: { organizationId: row.organizationId },
    asker: { organizationId: row.organizationId },
  });
}

/** One PNG of the live tab, ready to be served as an image. */
export async function persistentFrame(row: PersistentSessionRow): Promise<AdapterResult<{ base64: string }>> {
  const handle = handleFor(row);
  if (handle.ok === false) return handle;
  return sessionScreenshotPng({
    handle: handle.value,
    owner: { organizationId: row.organizationId },
    asker: { organizationId: row.organizationId },
  });
}

/** Apply a person's input to the adopted tab. Returns the url the page reports afterwards. */
export async function persistentInput(input: {
  row: PersistentSessionRow;
  command:
    | { kind: "click"; x: number; y: number }
    | { kind: "type"; text: string; submit?: boolean }
    | { kind: "scroll"; deltaY: number }
    | { kind: "navigate"; url: string };
}): Promise<AdapterResult<{ url: string; title: string; note: string }>> {
  const handle = handleFor(input.row);
  if (handle.ok === false) return handle;
  const base = { handle: handle.value, owner: { organizationId: input.row.organizationId }, asker: { organizationId: input.row.organizationId } };

  if (input.command.kind === "click") {
    const clicked = await clickInSession({ ...base, x: input.command.x, y: input.command.y });
    if (clicked.ok === false) return clicked;
  } else if (input.command.kind === "type") {
    const typed = await typeInSession({ ...base, text: input.command.text, submit: input.command.submit });
    if (typed.ok === false) return typed;
  } else if (input.command.kind === "scroll") {
    const scrolled = await scrollInSession({ ...base, deltaY: input.command.deltaY });
    if (scrolled.ok === false) return scrolled;
    const state = await readBrowserState(base);
    return {
      ok: true,
      value: {
        url: state.ok ? state.value.url : "",
        title: state.ok ? state.value.title : "",
        note: `scrolledY=${scrolled.value.scrolledY}`,
      },
    };
  } else {
    const navigated = await navigateInSession({ ...base, url: input.command.url });
    if (navigated.ok === false) return navigated;
    return { ok: true, value: { url: navigated.value.url, title: navigated.value.title, note: "navigated" } };
  }

  // Click and type are followed by a read so the stored url/title reflect the consequence, not the
  // request (a click can change the page, a typed Enter can submit a form).
  const state = await readBrowserState(base);
  return {
    ok: true,
    value: {
      url: state.ok ? state.value.url : "",
      title: state.ok ? state.value.title : "",
      note: input.command.kind,
    },
  };
}

/** Close the browser-side context. Best effort: a session can be over before the browser answers. */
export async function releasePersistentSession(row: PersistentSessionRow): Promise<boolean> {
  const handle = handleFor(row);
  if (handle.ok === false) return false;
  const disposed = await disposePersistentSession(handle.value);
  return disposed.ok === true;
}
