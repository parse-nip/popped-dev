import type { GitBranchInfo } from "./types";
import { isTerminalRunStatus } from "./stream-transform";

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

type ListRunsResponse = {
  runs?: CursorRun[];
};

export class CursorApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, body: string) {
    super(`Cursor API ${status}: ${body}`);
    this.status = status;
    this.code = code;
  }
}

function authHeader(apiKey: string): string {
  return `Basic ${btoa(`${apiKey}:`)}`;
}

function parseCursorError(status: number, body: string): CursorApiError {
  try {
    const payload = JSON.parse(body) as { error?: { code?: string; message?: string } };
    const code = payload.error?.code ?? "unknown";
    return new CursorApiError(status, code, body);
  } catch {
    return new CursorApiError(status, "unknown", body);
  }
}

export function isAgentBusyError(error: unknown): boolean {
  return error instanceof CursorApiError && error.status === 409 && error.code === "agent_busy";
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
    throw parseCursorError(response.status, body);
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

export async function listCloudRuns(
  apiKey: string,
  agentId: string,
  limit = 5,
): Promise<CursorRun[]> {
  const data = await cursorFetch<ListRunsResponse>(
    apiKey,
    `/agents/${agentId}/runs?limit=${limit}`,
  );
  return data.runs ?? [];
}

export async function getActiveRun(
  apiKey: string,
  agentId: string,
): Promise<CursorRun | null> {
  const runs = await listCloudRuns(apiKey, agentId, 5);
  return runs.find((run) => !isTerminalRunStatus(run.status)) ?? null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Wait until the agent has no CREATING/RUNNING run. */
export async function waitForAgentIdle(
  apiKey: string,
  agentId: string,
  maxWaitMs = 180_000,
): Promise<void> {
  const deadline = Date.now() + maxWaitMs;

  while (Date.now() < deadline) {
    const active = await getActiveRun(apiKey, agentId);
    if (!active) return;
    await sleep(1000);
  }

  const stillActive = await getActiveRun(apiKey, agentId);
  if (stillActive) {
    throw new CursorApiError(
      409,
      "agent_busy",
      JSON.stringify({
        error: {
          code: "agent_busy",
          message: "Agent still has an active run",
          activeRunId: stillActive.id,
        },
      }),
    );
  }
}

/** Create a run after any in-flight run finishes; retry once on agent_busy. */
export async function createCloudRunWhenReady(
  apiKey: string,
  agentId: string,
  promptText: string,
): Promise<CreateRunResponse> {
  await waitForAgentIdle(apiKey, agentId);

  try {
    return await createCloudRun(apiKey, agentId, promptText);
  } catch (error) {
    if (!isAgentBusyError(error)) throw error;
    await waitForAgentIdle(apiKey, agentId, 120_000);
    return await createCloudRun(apiKey, agentId, promptText);
  }
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

export function activeRunIdFromError(error: unknown): string | null {
  if (!(error instanceof CursorApiError)) return null;
  try {
    const payload = JSON.parse(error.message.replace(/^Cursor API \d+: /, "")) as {
      error?: { activeRunId?: string };
    };
    return payload.error?.activeRunId ?? null;
  } catch {
    return null;
  }
}
