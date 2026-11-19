"use client";

import { signIn } from "next-auth/react";

export function GoogleSignInButton({ lang }: { lang: "ar" | "en" }) {
  return (
    <div className="flex flex-col gap-3 px-4 sm:px-16">
      <button
        className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md border bg-background font-medium text-sm transition-colors hover:bg-accent"
        onClick={() => signIn("google", { callbackUrl: "/" })}
        type="button"
      >
        <svg aria-hidden="true" height="18" viewBox="0 0 48 48" width="18">
          <path d="M44.5 20H24v8.5h11.8C34.7 33.9 30.1 37 24 37c-7.2 0-13-5.8-13-13s5.8-13 13-13c3.1 0 5.9 1.1 8.1 2.9l6.4-6.4C34.6 4.1 29.6 2 24 2 11.8 2 2 11.8 2 24s9.8 22 22 22c11 0 21-8 21-22 0-1.3-.2-2.7-.5-4z" fill="#FFC107"/>
          <path d="M4.5 14.7l7 5.1C13.4 15.6 18.3 11 24 11c3.1 0 5.9 1.1 8.1 2.9l6.4-6.4C34.6 4.1 29.6 2 24 2 15.4 2 8 6.9 4.5 14.7z" fill="#FF3D00"/>
          <path d="M24 46c5.5 0 10.4-1.8 14.2-4.9l-6.6-5.4C29.6 37.1 26.9 38 24 38c-6.1 0-11.2-4.1-12.9-9.6l-7 5.4C7.7 41 15.3 46 24 46z" fill="#4CAF50"/>
          <path d="M44.5 20H24v8.5h11.8c-.8 2.3-2.3 4.3-4.2 5.7l6.6 5.4C42.3 36.1 45 30.7 45 24c0-1.3-.2-2.7-.5-4z" fill="#1976D2"/>
        </svg>
        {lang === "ar" ? "المتابعة بحساب Google" : "Continue with Google"}
      </button>
      <div className="flex items-center gap-3 text-muted-foreground text-xs">
        <span className="h-px flex-1 bg-border" />
        {lang === "ar" ? "أو بالبريد الإلكتروني" : "or with email"}
        <span className="h-px flex-1 bg-border" />
      </div>
    </div>
  );
}
