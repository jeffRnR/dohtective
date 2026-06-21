// app/frontend/components/SessionProviderWrapper.tsx
"use client";

import { SessionProvider } from "next-auth/react";

// NextAuth's SessionProvider must be a Client Component, but the root
// layout should stay a Server Component (faster initial load, no
// unnecessary client JS for the parts of the page that don't need it).
// This thin wrapper is the standard pattern to bridge the two.
export default function SessionProviderWrapper({ children }: { children: React.ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>;
}