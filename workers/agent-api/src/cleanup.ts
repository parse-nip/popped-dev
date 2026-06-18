import {
  branchHasOpenPullRequest,
  deleteGitBranch,
  listDesignBranchRefs,
} from "./github";
import {
  deleteRunsForSession,
  deleteSession,
  listSessions,
} from "./session-store";
import type { Env, SessionRecord } from "./types";

export const DEFAULT_CLEANUP_TTL_MS = 60 * 60 * 1000;

export function cleanupTtlMs(env: Env): number {
  const raw = env.CLEANUP_TTL_MS;
  if (raw) {
    const parsed = Number.parseInt(raw, 10);
    if (!Number.isNaN(parsed) && parsed >= 60_000) return parsed;
  }
  return DEFAULT_CLEANUP_TTL_MS;
}

export function cleanupTtlSeconds(env: Env): number {
  return Math.ceil(cleanupTtlMs(env) / 1000);
}

function isSessionStale(session: SessionRecord, ttlMs: number, now: number): boolean {
  if (session.protected) return false;
  return now - session.lastRunAt >= ttlMs;
}

async function shouldKeepBranch(
  env: Env,
  branch: string,
  session: SessionRecord | null,
  ttlMs: number,
  now: number,
): Promise<boolean> {
  if (session?.protected) return true;
  if (session && !isSessionStale(session, ttlMs, now)) return true;

  if (env.GITHUB_TOKEN) {
    const hasOpenPr = await branchHasOpenPullRequest(
      env.GITHUB_TOKEN,
      env.GITHUB_REPO_URL,
      branch,
    );
    if (hasOpenPr) return true;
  }

  return false;
}

async function purgeSessionArtifacts(env: Env, sessionId: string): Promise<void> {
  await deleteRunsForSession(env.SESSIONS, sessionId);
  await deleteSession(env.SESSIONS, sessionId);
}

export type CleanupStats = {
  sessionsScanned: number;
  sessionsPurged: number;
  branchesDeleted: number;
  branchesSkipped: number;
  orphanedBranchesDeleted: number;
  errors: string[];
};

export async function runCleanup(env: Env): Promise<CleanupStats> {
  const stats: CleanupStats = {
    sessionsScanned: 0,
    sessionsPurged: 0,
    branchesDeleted: 0,
    branchesSkipped: 0,
    orphanedBranchesDeleted: 0,
    errors: [],
  };

  if (!env.GITHUB_TOKEN) {
    stats.errors.push("GITHUB_TOKEN missing — skipping branch cleanup");
    return stats;
  }

  const ttlMs = cleanupTtlMs(env);
  const now = Date.now();
  const sessions = await listSessions(env.SESSIONS);
  stats.sessionsScanned = sessions.length;

  const sessionByBranch = new Map(sessions.map((session) => [session.branch, session]));

  for (const session of sessions) {
    if (!isSessionStale(session, ttlMs, now)) continue;

    try {
      const keepBranch = await shouldKeepBranch(env, session.branch, session, ttlMs, now);
      if (keepBranch) {
        stats.branchesSkipped += 1;
        continue;
      }

      await deleteGitBranch(env.GITHUB_TOKEN, env.GITHUB_REPO_URL, session.branch);
      stats.branchesDeleted += 1;
      await purgeSessionArtifacts(env, session.sessionId);
      stats.sessionsPurged += 1;
      sessionByBranch.delete(session.branch);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      stats.errors.push(`session ${session.sessionId}: ${message}`);
    }
  }

  try {
    const refs = await listDesignBranchRefs(env.GITHUB_TOKEN, env.GITHUB_REPO_URL);
    for (const branch of refs) {
      if (sessionByBranch.has(branch)) continue;

      try {
        const keepBranch = await shouldKeepBranch(env, branch, null, ttlMs, now);
        if (keepBranch) {
          stats.branchesSkipped += 1;
          continue;
        }

        await deleteGitBranch(env.GITHUB_TOKEN, env.GITHUB_REPO_URL, branch);
        stats.orphanedBranchesDeleted += 1;
        stats.branchesDeleted += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        stats.errors.push(`orphan branch ${branch}: ${message}`);
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    stats.errors.push(`list design branches: ${message}`);
  }

  return stats;
}
