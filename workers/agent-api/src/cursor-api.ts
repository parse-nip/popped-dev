import type { GitBranchInfo } from "./types";

const CURSOR_API_BASE = "https://api.cursor.com/v1";

export type CursorRun = {
  id: string;
  agentId: string;
  status: string;
  result?: string;
  git?: {
    branches?: GitBranchInfo[];
  };
};

type CreateAgentResponse = {
  agent: { id: string; latestRunId?: string };
  run: CursorRun;
};

type CreateRunResponse = {
  run: CursorRun;
};

function authHeader(apiKey: string): string {
  return `Basic ${btoa(`${apiKey}:`)}`;
}

async function cursorFetch<T>(
  apiKey: string,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(`${CURSOR_API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: authHeader(apiKey),
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Cursor API ${response.status}: ${body}`);
  }

  return response.json() as Promise<T>;
}

export async function createCloudAgent(
  apiKey: string,
  options: {
    promptText: string;
    branch: string;
    repoUrl: string;
    autoCreatePR: boolean;
  },
): Promise<CreateAgentResponse> {
  return cursorFetch<CreateAgentResponse>(apiKey, "/agents", {
    method: "POST",
    body: JSON.stringify({
      prompt: { text: options.promptText },
      model: { id: "composer-2.5" },
      repos: [{ url: options.repoUrl, startingRef: options.branch }],
      workOnCurrentBranch: true,
      autoCreatePR: options.autoCreatePR,
      skipReviewerRequest: true,
    }),
  });
}

export async function createCloudRun(
  apiKey: string,
  agentId: string,
  promptText: string,
): Promise<CreateRunResponse> {
  return cursorFetch<CreateRunResponse>(apiKey, `/agents/${agentId}/runs`, {
    method: "POST",
    body: JSON.stringify({ prompt: { text: promptText } }),
  });
}

export async function getCloudRun(
  apiKey: string,
  agentId: string,
  runId: string,
): Promise<CursorRun> {
  return cursorFetch<CursorRun>(apiKey, `/agents/${agentId}/runs/${runId}`);
}

export async function streamCloudRun(
  apiKey: string,
  agentId: string,
  runId: string,
  lastEventId?: string,
): Promise<Response> {
  const headers: Record<string, string> = {
    Authorization: authHeader(apiKey),
    Accept: "text/event-stream",
  };

  if (lastEventId) {
    headers["Last-Event-ID"] = lastEventId;
  }

  return fetch(`${CURSOR_API_BASE}/agents/${agentId}/runs/${runId}/stream`, { headers });
}

export function extractBranch(git?: { branches?: GitBranchInfo[] }): string | null {
  const branch = git?.branches?.[0]?.branch;
  return branch ?? null;
}

export function extractPrUrl(git?: { branches?: GitBranchInfo[] }): string | null {
  return git?.branches?.find((entry) => entry.prUrl)?.prUrl ?? null;
}
