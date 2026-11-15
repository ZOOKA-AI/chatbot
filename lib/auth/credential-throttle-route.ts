import { clientAddress, parseCredentials, readLoginLock } from "@/lib/auth/login-guard";
import type { ThrottleStore } from "@/lib/auth/throttle-store";

type Handler<R extends Request> = (request: R) => Promise<Response> | Response;

/**
 * Puts a real HTTP answer in front of the credentials callback.
 *
 * authorize() can only return "no user", so a direct caller of
 * POST /api/auth/callback/credentials could not be told to slow down. This
 * wrapper answers 429 with a Retry-After header while the caller is locked, and
 * otherwise hands the untouched request to the NextAuth handler.
 *
 * It only reads: counting stays in authorize(), so an attempt is never counted
 * twice. Any error in here falls through to the handler; sign-in must not break
 * because the pre-check did.
 */
export function withCredentialThrottle<R extends Request>(
  handler: Handler<R>,
  getStore: () => ThrottleStore
): Handler<R> {
  return async (request: R) => {
    try {
      const { pathname } = new URL(request.url);
      if (request.method === "POST" && pathname.endsWith("/callback/credentials")) {
        const form = await request.clone().formData();
        const parsed = parseCredentials({
          email: form.get("email"),
          password: form.get("password"),
        });
        if (parsed) {
          const lock = await readLoginLock(
            getStore(),
            parsed.email,
            clientAddress(request.headers)
          );
          if (lock.locked) {
            return new Response(
              JSON.stringify({
                error: "too_many_attempts",
                retryAfterSeconds: lock.retryAfterSeconds,
              }),
              {
                status: 429,
                headers: {
                  "content-type": "application/json",
                  "retry-after": String(lock.retryAfterSeconds),
                  "cache-control": "private, no-store",
                },
              }
            );
          }
        }
      }
    } catch {
      // fall through to the real handler
    }
    return handler(request);
  };
}
