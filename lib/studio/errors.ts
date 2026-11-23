/** The studio's one error type: a stable code the routes map to an HTTP status, plus a detail. */
export class StudioError extends Error {
  constructor(readonly code: string, readonly detail: string | null = null) {
    super(code);
  }
}
