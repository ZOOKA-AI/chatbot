import { createHash } from "node:crypto";
import { NextRequest } from "next/server";

const cookieNames = [
  "authjs.pkce.code_verifier",
  "authjs.state",
] as const;

export const googleLoginChecks: ("pkce" | "state")[] = ["pkce", "state"];

function transactionSuffix(state: string | null) {
  if (!state || state.length > 4096) {
    return null;
  }
  return createHash("sha256").update(state).digest("base64url");
}

export function withGoogleTransactionCookies(
  handler: (request: NextRequest) => Promise<Response>
) {
  return async (request: NextRequest) => {
    const path = request.nextUrl.pathname;
    const isSignIn = path === "/api/auth/signin/google";
    const isCallback = path === "/api/auth/callback/google";
    if (!(isSignIn || isCallback)) {
      return handler(request);
    }

    const prefix = process.env.NODE_ENV === "development" ? "" : "__Secure-";
    const names = cookieNames.map((name) => `${prefix}${name}`);
    const suffix = isCallback
      ? transactionSuffix(request.nextUrl.searchParams.get("state"))
      : null;
    let forwarded = request;
    if (isCallback) {
      forwarded = new NextRequest(request, {
        headers: new Headers(request.headers),
      });
      for (const name of names) {
        const value = suffix && request.cookies.get(`${name}.${suffix}`)?.value;
        forwarded.cookies.delete(name);
        if (value) {
          forwarded.cookies.set(name, value);
        }
      }
    }

    const response = await handler(forwarded);
    const location = response.headers.get("location");
    const signInSuffix =
      isSignIn && location
        ? transactionSuffix(new URL(location, request.url).searchParams.get("state"))
        : null;
    const activeSuffix = isSignIn ? signInSuffix : suffix;
    if (!activeSuffix) {
      return response;
    }

    const headers = new Headers(response.headers);
    const cookies = headers.getSetCookie();
    headers.delete("set-cookie");
    for (const cookie of cookies) {
      const name = cookie.slice(0, cookie.indexOf("="));
      headers.append(
        "set-cookie",
        names.includes(name)
          ? `${name}.${activeSuffix}${cookie.slice(name.length)}`
          : cookie
      );
    }
    if (isCallback) {
      for (const name of names) {
        headers.append(
          "set-cookie",
          `${name}.${activeSuffix}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${prefix ? "; Secure" : ""}`
        );
      }
    }
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  };
}
