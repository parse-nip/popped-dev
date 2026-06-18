import type { RateLimitRecord, RunRecord, SessionRecord } from "./types";

const SESSION_PREFIX = "session:";
const RUN_PREFIX = "run:";
const RATE_PREFIX = "ratelimit:";
const MERGE_COOLDOWN_PREFIX = "merge-cooldown:";

export const MERGE_COOLDOWN_MS = 30 * 60 * 1000;

export async function getSession(
  kv: KVNamespace,
  sessionId: string,
): Promise<SessionRecord | null> {
  return kv.get<SessionRecord>(`${SESSION_PREFIX}${sessionId}`, "json");
}

export async function putSession(
  kv: KVNamespace,
  session: SessionRecord,
  expirationTtl?: number,
): Promise<void> {
  const options = expirationTtl ? { expirationTtl } : undefined;
  await kv.put(`${SESSION_PREFIX}${session.sessionId}`, JSON.stringify(session), options);
}

export async function deleteSession(kv: KVNamespace, sessionId: string): Promise<void> {
  await kv.delete(`${SESSION_PREFIX}${sessionId}`);
}

export async function listSessions(kv: KVNamespace): Promise<SessionRecord[]> {
  const sessions: SessionRecord[] = [];
  let cursor: string | undefined;

  do {
    const page = await kv.list({ prefix: SESSION_PREFIX, cursor });
    for (const key of page.keys) {
      const session = await kv.get<SessionRecord>(key.name, "json");
      if (session) sessions.push(session);
    }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);

  return sessions;
}

export async function getRun(kv: KVNamespace, runId: string): Promise<RunRecord | null> {
  return kv.get<RunRecord>(`${RUN_PREFIX}${runId}`, "json");
}

export async function putRun(
  kv: KVNamespace,
  run: RunRecord,
  expirationTtl?: number,
): Promise<void> {
  const options = expirationTtl ? { expirationTtl } : undefined;
  await kv.put(`${RUN_PREFIX}${run.runId}`, JSON.stringify(run), options);
}

export async function deleteRunsForSession(
  kv: KVNamespace,
  sessionId: string,
): Promise<number> {
  let deleted = 0;
  let cursor: string | undefined;

  do {
    const page = await kv.list({ prefix: RUN_PREFIX, cursor });
    for (const key of page.keys) {
      const run = await kv.get<RunRecord>(key.name, "json");
      if (run?.sessionId === sessionId) {
        await kv.delete(key.name);
        deleted += 1;
      }
    }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);

  return deleted;
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
const DESIGN_RATE_PREFIX = "design-ratelimit:";
const DESIGN_RATE_LIMIT_MAX = 60;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;

export type RateLimitResult =
  | { allowed: true; remaining: number }
  | { allowed: false; retryAfterSeconds: number };

async function consumeRateLimit(
  kv: KVNamespace,
  prefix: string,
  key: string,
  max: number,
): Promise<RateLimitResult> {
  const now = Date.now();
  const record = await kv.get<RateLimitRecord>(`${prefix}${key}`, "json");

  if (!record || now - record.windowStart >= RATE_LIMIT_WINDOW_MS) {
    await kv.put(
      `${prefix}${key}`,
      JSON.stringify({ count: 1, windowStart: now } satisfies RateLimitRecord),
      { expirationTtl: 3600 },
    );
    return { allowed: true, remaining: max - 1 };
  }

  if (record.count >= max) {
    const retryAfterSeconds = Math.ceil(
      (record.windowStart + RATE_LIMIT_WINDOW_MS - now) / 1000,
    );
    return { allowed: false, retryAfterSeconds };
  }

  const next: RateLimitRecord = { count: record.count + 1, windowStart: record.windowStart };
  await kv.put(`${prefix}${key}`, JSON.stringify(next), { expirationTtl: 3600 });
  return { allowed: true, remaining: max - next.count };
}

/** Cursor cloud agent runs — keep strict. */
export async function checkRateLimit(
  kv: KVNamespace,
  key: string,
): Promise<RateLimitResult> {
  return consumeRateLimit(kv, RATE_PREFIX, key, RATE_LIMIT_MAX);
}

/** Local CSS patch runs — cheap Workers AI, allow more prompts per hour. */
export async function checkDesignRateLimit(
  kv: KVNamespace,
  key: string,
): Promise<RateLimitResult> {
  return consumeRateLimit(kv, DESIGN_RATE_PREFIX, key, DESIGN_RATE_LIMIT_MAX);
}

export type CooldownResult =
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number };

export async function checkMergeCooldown(
  kv: KVNamespace,
  ip: string,
): Promise<CooldownResult> {
  const record = await kv.get<{ until: number }>(`${MERGE_COOLDOWN_PREFIX}${ip}`, "json");
  if (!record) return { allowed: true };

  const now = Date.now();
  if (now >= record.until) {
    await kv.delete(`${MERGE_COOLDOWN_PREFIX}${ip}`);
    return { allowed: true };
  }

  return {
    allowed: false,
    retryAfterSeconds: Math.ceil((record.until - now) / 1000),
  };
}

export async function setMergeCooldown(
  kv: KVNamespace,
  ip: string,
  durationMs = MERGE_COOLDOWN_MS,
): Promise<void> {
  const until = Date.now() + durationMs;
  const ttlSeconds = Math.ceil(durationMs / 1000);
  await kv.put(
    `${MERGE_COOLDOWN_PREFIX}${ip}`,
    JSON.stringify({ until }),
    { expirationTtl: ttlSeconds },
  );
}
