// app/lib/next-auth.d.ts
// Module augmentation for NextAuth's Session type. Without this,
// session.user.id (added via the session callback in app/lib/auth.ts)
// is not recognized by TypeScript anywhere it's accessed - every
// session.user!.id! usage across the API routes depends on this
// declaration existing.

import { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
    } & DefaultSession["user"];
  }
}
