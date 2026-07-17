// app/lib/rate-limit.ts
// In-memory sliding window rate limiter.
//
// KNOWN LIMITATION: resets on cold start in serverless environments.
// Vercel spins up multiple instances — each has its own store — so the
// effective limit is maxRequests × instance count. Acceptable for now
// on low traffic; replace store with Upstash Redis for production scale:
// https://upstash.com (free tier works on Vercel/Render)
//
// Usage:
//   import { analyseRateLimit, zohoSyncRateLimit } from "@/lib/rate-limit";
//   const result = analyseRateLimit(businessId);
//   if (!result.allowed) return 429;

type RateLimitEntry = {
  count: number;
  resetAt: number; // unix ms
};

const store = new Map<string, RateLimitEntry>();

// Clean up expired entries every 10 minutes to prevent memory leaks
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store.entries()) {
    if (entry.resetAt < now) store.delete(key);
  }
}, 10 * 60 * 1000);

export type RateLimitResult =
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number };

export function checkRateLimit(
  key: string,
  maxRequests: number,
  windowMs: number
): RateLimitResult {
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || entry.resetAt < now) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true };
  }

  if (entry.count >= maxRequests) {
    return {
      allowed: false,
      retryAfterSeconds: Math.ceil((entry.resetAt - now) / 1000),
    };
  }

  entry.count += 1;
  return { allowed: true };
}

// ── Auth endpoints (IP-based) ─────────────────────────────────────────────

export function signupRateLimit(ip: string): RateLimitResult {
  // 5 signup attempts per hour per IP
  return checkRateLimit(`signup:${ip}`, 5, 60 * 60 * 1000);
}

export function signinRateLimit(ip: string): RateLimitResult {
  // 10 signin attempts per 15 minutes per IP
  return checkRateLimit(`signin:${ip}`, 10, 15 * 60 * 1000);
}

export function verifyRateLimit(ip: string): RateLimitResult {
  // 10 verify attempts per 15 minutes per IP
  return checkRateLimit(`verify:${ip}`, 10, 15 * 60 * 1000);
}

export function resendRateLimit(ip: string): RateLimitResult {
  // 3 resend attempts per hour per IP
  return checkRateLimit(`resend:${ip}`, 3, 60 * 60 * 1000);
}

// ── Business-scoped endpoints (businessId-based) ──────────────────────────
// Keyed on businessId rather than IP — prevents one compromised account
// from hammering the detection service, and ensures limits apply per
// business regardless of which IP the request comes from.

export function analyseRateLimit(businessId: string): RateLimitResult {
  // 10 analysis runs per hour per business.
  // Analysis is credit-gated anyway, but this prevents a tight loop from
  // hammering the detection service if credits somehow aren't checked.
  return checkRateLimit(`analyse:${businessId}`, 10, 60 * 60 * 1000);
}

export function zohoSyncRateLimit(businessId: string): RateLimitResult {
  // 20 sync calls per hour per business.
  // The dashboard's 30-min staleness gate normally prevents this, but
  // direct API calls (curl, Postman) bypass that client-side check.
  return checkRateLimit(`zoho-sync:${businessId}`, 20, 60 * 60 * 1000);
}