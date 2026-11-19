import type { NextAuthConfig } from "next-auth";

export const authConfig = {
  trustHost: true,
  useSecureCookies: process.env.NODE_ENV !== "development",
  pages: {
    signIn: "/login",
    error: "/login",
    newUser: "/",
  },
  providers: [
    // added later in auth.ts since it requires bcrypt which is only compatible with Node.js
    // while this file is also used in non-Node.js environments
  ],
  callbacks: {},
} satisfies NextAuthConfig;
