export type ElementContextPayload = {
  label: string;
  selectorPath: string;
  factId?: string;
  contributionId?: string;
  tagName: string;
  classNames: string[];
  textPreview: string;
  suggestedFiles: string[];
};

export type SessionRecord = {
  sessionId: string;
  /** Empty until the first design message creates a Cursor cloud agent. */
  agentId: string;
  contributorName: string;
  branch: string;
  createdAt: number;
  lastRunAt: number;
  runCount: number;
  /** Latest run that may still be in progress. */
  activeRunId?: string;
  /** Set after contributor publishes — branch is kept until cleanup TTL. */
  protected?: boolean;
  /** Timestamp when the design was merged to main. */
  mergedAt?: number;
};

export type RunRecord = {
  runId: string;
  sessionId: string;
  agentId: string;
  branch?: string;
  /** Branch head SHA when this run started — preview is ready only after a newer commit deploys. */
  baselineSha?: string | null;
  prUrl?: string;
  mergeCommitUrl?: string;
  status?: string;
  createdAt: number;
};

export type RateLimitRecord = {
  count: number;
  windowStart: number;
};

export type Env = {
  SESSIONS: KVNamespace;
  CURSOR_API_KEY: string;
  GITHUB_TOKEN: string;
  PAGES_PROJECT_NAME: string;
  GITHUB_REPO_URL: string;
  GITHUB_DEFAULT_BRANCH?: string;
  CORS_ORIGIN: string;
  /** Milliseconds of inactivity before session branch + KV are cleaned up. Default: 3600000 (1 hour). */
  CLEANUP_TTL_MS?: string;
  /** Cooldown after merge before a new cloud agent can start. Default: 1800000 (30 minutes). */
  MERGE_COOLDOWN_MS?: string;
};

export type GitBranchInfo = {
  branch?: string;
  prUrl?: string;
  repoUrl?: string;
};
