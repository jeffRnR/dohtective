// app/lib/auth.ts
// NextAuth v5 (Auth.js) configuration. Two sign-in paths: email+password
// (Credentials provider, checked against User.passwordHash) and Google
// OAuth. Both ultimately produce the same User row - a person who first
// signs up with a password and later uses "Sign in with Google" on the
// same email will NOT automatically link (NextAuth's default behavior
// requires explicit account linking for security; not implemented here,
// flagging as a known gap if you want it later).

import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import bcrypt from "bcryptjs";
import { prisma } from "./prisma";

// CHANGELOG: process.env.GOOGLE_CLIENT_ID/SECRET are typed string | undefined
// by TypeScript - NextAuth's Google() provider requires string. Rather than
// a silent `!` assertion that would compile but crash confusingly at
// runtime if the env var is genuinely missing, fail loudly and early with
// a clear message pointing at .env.local - same honesty pattern used
// throughout this project for missing configuration (see assertZohoConfigured
// in app/lib/zoho-client.ts).
function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable ${name} - check .env.local.`);
  }
  return value;
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: { strategy: "jwt" }, // required for Credentials provider - database sessions don't support it directly
  pages: {
    signIn: "/sign-in",
  },
  providers: [
    Google({
      clientId: requireEnv("GOOGLE_CLIENT_ID"),
      clientSecret: requireEnv("GOOGLE_CLIENT_SECRET"),
    }),
    Credentials({
      name: "Email and password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = credentials?.email as string | undefined;
        const password = credentials?.password as string | undefined;
        if (!email || !password) return null;

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user || !user.passwordHash) return null; // no password set = Google-only account

        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) return null;

        return { id: user.id, email: user.email, name: user.name, image: user.image };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) token.userId = user.id;
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.userId) {
        session.user.id = token.userId as string;
      }
      return session;
    },
  },
  events: {
    // Fires once, when the Prisma adapter creates a brand-new User row -
    // this is the Google sign-in equivalent of the invite-resolution
    // logic in app/api/auth/signup/route.ts (which only covers the
    // Credentials/password path). Without this, someone invited by email
    // who then signs in with Google would never get their membership
    // activated.
    async createUser({ user }) {
      if (!user.email || !user.id) return;
      const pendingInvites = await prisma.businessInvite.findMany({
        where: { email: user.email, acceptedAt: null },
      });
      if (pendingInvites.length === 0) return;

      await prisma.$transaction([
        ...pendingInvites.map((invite) =>
          prisma.businessMember.create({
            data: { businessId: invite.businessId, userId: user.id!, role: invite.role },
          })
        ),
        prisma.businessInvite.updateMany({
          where: { id: { in: pendingInvites.map((i) => i.id) } },
          data: { acceptedAt: new Date() },
        }),
      ]);
    },
  },
});
