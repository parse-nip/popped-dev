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
  PAGES_PROJECT_NAME: string;
  GITHUB_REPO_URL: string;
  CORS_ORIGIN: string;
};

export type GitBranchInfo = {
  branch?: string;
  prUrl?: string;
  repoUrl?: string;
};
