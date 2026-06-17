import type { RateLimitRecord, RunRecord, SessionRecord } from "./types";

const SESSION_PREFIX = "session:";
const RUN_PREFIX = "run:";
const RATE_PREFIX = "ratelimit:";

export async function getSession(
  kv: KVNamespace,
  sessionId: string,
): Promise<SessionRecord | null> {
  return kv.get<SessionRecord>(`${SESSION_PREFIX}${sessionId}`, "json");
}

export async function putSession(kv: KVNamespace, session: SessionRecord): Promise<void> {
  await kv.put(`${SESSION_PREFIX}${session.sessionId}`, JSON.stringify(session));
}

export async function getRun(kv: KVNamespace, runId: string): Promise<RunRecord | null> {
  return kv.get<RunRecord>(`${RUN_PREFIX}${runId}`, "json");
}

export async function putRun(kv: KVNamespace, run: RunRecord): Promise<void> {
  await kv.put(`${RUN_PREFIX}${run.runId}`, JSON.stringify(run));
}

export async function updateRun(
  kv: KVNamespace,
  runId: string,
  patch: Partial<RunRecord>,
): Promise<RunRecord | null> {
  const existing = await getRun(kv, runId);
  if (!existing) return null;
  const next = { ...existing, ...patch };
  await putRun(kv, next);
  return next;
}

const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;

export type RateLimitResult =
  | { allowed: true; remaining: number }
  | { allowed: false; retryAfterSeconds: number };

export async function checkRateLimit(
  kv: KVNamespace,
  key: string,
): Promise<RateLimitResult> {
  const now = Date.now();
  const record = await kv.get<RateLimitRecord>(`${RATE_PREFIX}${key}`, "json");

  if (!record || now - record.windowStart >= RATE_LIMIT_WINDOW_MS) {
    await kv.put(
      `${RATE_PREFIX}${key}`,
      JSON.stringify({ count: 1, windowStart: now } satisfies RateLimitRecord),
      { expirationTtl: 3600 },
    );
    return { allowed: true, remaining: RATE_LIMIT_MAX - 1 };
  }

  if (record.count >= RATE_LIMIT_MAX) {
    const retryAfterSeconds = Math.ceil(
      (record.windowStart + RATE_LIMIT_WINDOW_MS - now) / 1000,
    );
    return { allowed: false, retryAfterSeconds };
  }

  const next: RateLimitRecord = { count: record.count + 1, windowStart: record.windowStart };
  await kv.put(`${RATE_PREFIX}${key}`, JSON.stringify(next), { expirationTtl: 3600 });
  return { allowed: true, remaining: RATE_LIMIT_MAX - next.count };
}
