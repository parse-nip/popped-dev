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
  agentId: string;
  contributorName: string;
  branch: string;
  createdAt: number;
  lastRunAt: number;
  runCount: number;
  /** Set when a contributor submits for review — branch is kept until PR is closed. */
  protected?: boolean;
};

export type RunRecord = {
  runId: string;
  sessionId: string;
  agentId: string;
  branch?: string;
  prUrl?: string;
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
};

export type GitBranchInfo = {
  branch?: string;
  prUrl?: string;
  repoUrl?: string;
};
