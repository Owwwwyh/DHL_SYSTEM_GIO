import { NextRequest, NextResponse } from "next/server";

// Lightweight in-memory token bucket. Survives within a single Node process
// (Next.js dev server, single Vercel serverless instance). For multi-instance
// deployments swap this for Upstash Ratelimit or similar — the call sites only
// import `rateLimit`, so the swap is local to this file.

interface Bucket {
  tokens: number;
  lastRefill: number;
}

const buckets = new Map<string, Bucket>();

function clientKey(req: NextRequest): string {
  const apiKey = req.headers.get("x-api-key");
  if (apiKey) return `key:${apiKey}`;
  const fwd = req.headers.get("x-forwarded-for");
  const ip = fwd?.split(",")[0].trim() || req.headers.get("x-real-ip") || "unknown";
  return `ip:${ip}`;
}

export interface RateLimitOptions {
  capacity: number;       // max tokens in bucket
  refillPerSec: number;   // tokens added per second
  scope: string;          // namespace per route
}

export function rateLimit(req: NextRequest, opts: RateLimitOptions): NextResponse | null {
  const id = `${opts.scope}|${clientKey(req)}`;
  const now = Date.now();
  let bucket = buckets.get(id);
  if (!bucket) {
    bucket = { tokens: opts.capacity, lastRefill: now };
    buckets.set(id, bucket);
  } else {
    const elapsedSec = (now - bucket.lastRefill) / 1000;
    bucket.tokens = Math.min(opts.capacity, bucket.tokens + elapsedSec * opts.refillPerSec);
    bucket.lastRefill = now;
  }

  if (bucket.tokens < 1) {
    const retryAfter = Math.ceil((1 - bucket.tokens) / opts.refillPerSec);
    return NextResponse.json(
      { error: "Rate limit exceeded. Try again later." },
      {
        status: 429,
        headers: {
          "Retry-After": String(retryAfter),
          "X-RateLimit-Limit": String(opts.capacity),
          "X-RateLimit-Remaining": "0",
        },
      }
    );
  }

  bucket.tokens -= 1;
  return null;
}

// Periodic GC so a long-running process doesn't accumulate buckets for
// transient IPs. Skipped during tests (no setInterval pollution).
if (process.env.NODE_ENV !== "test") {
  const GC_INTERVAL_MS = 10 * 60 * 1000;
  setInterval(() => {
    const cutoff = Date.now() - 60 * 60 * 1000;
    buckets.forEach((v, k) => {
      if (v.lastRefill < cutoff) buckets.delete(k);
    });
  }, GC_INTERVAL_MS).unref?.();
}
