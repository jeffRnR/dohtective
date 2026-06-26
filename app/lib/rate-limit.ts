// app/lib/rate-limit.ts
// In-memory sliding window rate limiter.
// Limitation: resets on cold start in serverless environments.
// For production, replace the store with Upstash Redis:
// https://upstash.com (free tier, works on Vercel/Render)

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

// Pre-configured limiters for each sensitive route
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