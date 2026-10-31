import { compare } from "bcrypt-ts";
import NextAuth, { type DefaultSession } from "next-auth";
import type { DefaultJWT } from "next-auth/jwt";
import Credentials from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import { randomBytes } from "node:crypto";
import { DUMMY_PASSWORD } from "@/lib/constants";
import {
  createGuestUser,
  createUser,
  ensureUserWorkspace,
  getUser,
} from "@/lib/db/queries";
import { sendWelcomeEmail } from "@/lib/email/send";

/** Google sign-in uses its own non-sensitive client (openid/email/profile). */
export const googleLoginEnabled = Boolean(
  process.env.GOOGLE_LOGIN_CLIENT_ID && process.env.GOOGLE_LOGIN_CLIENT_SECRET
);
import { authConfig } from "./auth.config";

export type UserType = "guest" | "regular";
export type OrganizationRole = "owner" | "admin" | "member";

declare module "next-auth" {
  interface Session extends DefaultSession {
    user: {
      id: string;
      type: UserType;
      organizationId: string;
      organizationRole: OrganizationRole;
    } & DefaultSession["user"];
  }

  interface User {
    id?: string;
    email?: string | null;
    type: UserType;
    organizationId?: string;
    organizationRole?: OrganizationRole;
  }
}

declare module "next-auth/jwt" {
  interface JWT extends DefaultJWT {
    id: string;
    type: UserType;
    organizationId: string;
    organizationRole: OrganizationRole;
  }
}

export const {
  handlers: { GET, POST },
  auth,
  signIn,
  signOut,
} = NextAuth({
  ...authConfig,
  providers: [
    ...(googleLoginEnabled
      ? [
          GoogleProvider({
            clientId: process.env.GOOGLE_LOGIN_CLIENT_ID as string,
            clientSecret: process.env.GOOGLE_LOGIN_CLIENT_SECRET as string,
            authorization: {
              params: { prompt: "select_account", scope: "openid email profile" },
            },
            allowDangerousEmailAccountLinking: true,
          }),
        ]
      : []),
    Credentials({
      credentials: {},
      async authorize({ email, password }: any) {
        const users = await getUser(email);

        if (users.length === 0) {
          await compare(password, DUMMY_PASSWORD);
          return null;
        }

        const [user] = users;

        if (!user.password) {
          await compare(password, DUMMY_PASSWORD);
          return null;
        }

        const passwordsMatch = await compare(password, user.password);

        if (!passwordsMatch) {
          return null;
        }

        return { ...user, type: "regular" };
      },
    }),
    Credentials({
      id: "guest",
      credentials: {},
      async authorize() {
        const [guestUser] = await createGuestUser();
        return { ...guestUser, type: "guest" };
      },
    }),
  ],
  callbacks: {
    async signIn({ user, account, profile }) {
      if (account?.provider !== "google") {
        return true;
      }
      const email = (profile?.email ?? user.email ?? "").toLowerCase();
      if (!email || profile?.email_verified === false) {
        return false;
      }
      let [existing] = await getUser(email);
      if (!existing) {
        // First Google login: create the local account with an unguessable
        // password so the email/password path stays closed until a reset.
        await createUser(email, randomBytes(24).toString("hex"));
        [existing] = await getUser(email);
        void sendWelcomeEmail(email, "ar");
      }
      // Replace Google's subject id with our own user id for the JWT below.
      user.id = existing.id;
      user.email = existing.email;
      user.type = "regular";
      return true;
    },
    async jwt({ token, user, account }) {
      if (user) {
        token.id = user.id as string;
        token.type = account?.provider === "google" ? "regular" : user.type;
      }

      if (token.id) {
        const workspace = await ensureUserWorkspace({
          userId: token.id,
          email: user?.email ?? token.email ?? "My workspace",
        });
        token.organizationId = workspace.id;
        token.organizationRole = workspace.role as OrganizationRole;
      }

      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.id;
        session.user.type = token.type;
        session.user.organizationId = token.organizationId;
        session.user.organizationRole = token.organizationRole;
      }

      return session;
    },
  },
});
