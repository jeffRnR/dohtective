// app/api/auth/[...nextauth]/route.ts
// NextAuth's required catch-all route - handles /api/auth/signin,
// /api/auth/callback/google, /api/auth/session, /api/auth/signout, etc.
// Do not add custom logic here; everything routes through app/lib/auth.ts.

import { handlers } from "../../../lib/auth";

export const { GET, POST } = handlers;
