/**
 * Simple in-memory rate limiter.
 * Tracks requests per identifier (userId) per minute.
 * For production, replace the store with a Redis-backed implementation.
 */

type RateEntry = { count: number; windowStart: number };

const store = new Map<string, RateEntry>();

function clean() {
  const now = Date.now();
  for (const [key, entry] of store.entries()) {
    if (now - entry.windowStart > 60_000) store.delete(key);
  }
}

export function checkRateLimit(
  identifier: string,
  limitPerMinute: number
): { allowed: boolean; remaining: number } {
  clean();
  const now = Date.now();
  const entry = store.get(identifier);

  if (!entry || now - entry.windowStart > 60_000) {
    store.set(identifier, { count: 1, windowStart: now });
    return { allowed: true, remaining: limitPerMinute - 1 };
  }

  entry.count++;
  const remaining = Math.max(0, limitPerMinute - entry.count);
  return { allowed: entry.count <= limitPerMinute, remaining };
}
