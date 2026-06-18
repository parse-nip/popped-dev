import { readContributorName } from "@/lib/contributor-name";
import { clearDesignChanges } from "@/lib/design-changes-store";
import {
  MERGE_COOLDOWN_MS,
  setLocalMergeCooldown,
} from "@/lib/merge-cooldown";
import type { ElementContext } from "./element-context";

const SESSION_ID_KEY = "popped.dev:agent-session-id";
const AGENT_ID_KEY = "popped.dev:agent-id";

/** Pages hosts have no /api — call the Worker directly (works when popped.dev is blocked). */
const PAGES_AGENT_API = "https://popped-dev-agent-api.parse-nip.workers.dev";

function isPagesDevHost(hostname: string): boolean {
  return (
    hostname === "popped-dev.pages.dev" ||
    hostname.endsWith("--popped-dev.pages.dev") ||
    hostname.endsWith(".popped-dev.pages.dev")
  );
}

function getApiBase(): string {
  const fromEnv =
    typeof process !== "undefined" ? process.env.NEXT_PUBLIC_AGENT_API_URL?.trim() : "";
  if (fromEnv) return fromEnv;

  if (typeof window !== "undefined" && isPagesDevHost(window.location.hostname)) {
    return PAGES_AGENT_API;
  }

  return "";
}

function apiUrl(path: string): string {
  return `${getApiBase()}${path}`;
}

export function getContributorName(): string {
  if (typeof window === "undefined") return "";
  return readContributorName();
}

export function getSessionId(): string {
  if (typeof window === "undefined") return "";

  const existing = sessionStorage.getItem(SESSION_ID_KEY);
  if (existing) return existing;

  const sessionId = crypto.randomUUID();
  sessionStorage.setItem(SESSION_ID_KEY, sessionId);
  return sessionId;
}

export function clearAgentSession(): void {
  if (typeof window === "undefined") return;
  clearDesignChanges(getSessionId());
  sessionStorage.removeItem(SESSION_ID_KEY);
  sessionStorage.removeItem(AGENT_ID_KEY);
}

function parseAgentError(
  response: Response,
  payload: {
    error?: string;
    message?: string;
    code?: string;
    retryAfterSeconds?: number;
  } | null,
): Error {
  if (response.status === 429 && payload?.code === "merge_cooldown") {
    const seconds = payload.retryAfterSeconds ?? MERGE_COOLDOWN_MS / 1000;
    setLocalMergeCooldown(Date.now() + seconds * 1000);
    const minutes = Math.ceil(seconds / 60);
    return new Error(
      `You just merged a design — wait ~${minutes} min before starting a new cloud agent.`,
    );
  }
  return new Error(payload?.message ?? payload?.error ?? "Agent request failed.");
}

export function getStoredAgentId(): string | null {
  if (typeof window === "undefined") return null;
  return sessionStorage.getItem(AGENT_ID_KEY);
}

export function storeAgentId(agentId: string): void {
  sessionStorage.setItem(AGENT_ID_KEY, agentId);
}

export type AgentStreamEvent =
  | { type: "assistant"; text: string }
  | { type: "status"; message: string }
  | {
      type: "activity";
      kind: "thinking" | "tool" | "status";
      text: string;
      streamId?: string;
      done?: boolean;
    }
  | { type: "step"; id: string; label: string; state: "running" | "done" }
  | { type: "preview"; previewUrl: string; branch: string; ready?: boolean; sha?: string | null; progress?: number; phase?: string }
  | { type: "error"; message: string }
  | { type: "done" };

export type BranchDraftPayload = {
  branch: string;
  sha: string | null;
  css: string | null;
  changedFiles: string[];
  hasCssChanges: boolean;
  hasTsxChanges: boolean;
  ready: boolean;
};

export type RunStatusPayload = {
  runId: string;
  agentId: string;
  status: string;
  result?: string | null;
  branch?: string;
  previewUrl?: string;
  previewReady?: boolean;
  previewSha?: string | null;
  done: boolean;
};

export async function fetchRunStatus(runId: string, agentId: string): Promise<RunStatusPayload> {
  const response = await fetch(
    apiUrl(`/api/agent/runs/${encodeURIComponent(runId)}?agentId=${encodeURIComponent(agentId)}`),
  );
  if (!response.ok) {
    throw new Error("Could not fetch agent run status.");
  }
  return (await response.json()) as RunStatusPayload;
}

async function pollRunUntilDone(
  runId: string,
  agentId: string,
  onEvent: (event: AgentStreamEvent) => void,
  flags: { previewReceived: boolean; assistantSent: boolean; previewReady: boolean },
  maxAttempts = 90,
): Promise<void> {
  onEvent({ type: "step", id: "reconnect", label: "Checking agent progress", state: "running" });

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const data = await fetchRunStatus(runId, agentId);

    if (data.result && !flags.assistantSent) {
      flags.assistantSent = true;
      onEvent({ type: "assistant", text: data.result });
    }

    if (data.previewUrl && data.branch && !flags.previewReceived) {
      flags.previewReceived = true;
      onEvent({
        type: "preview",
        previewUrl: data.previewUrl,
        branch: data.branch,
        ready: data.previewReady,
        sha: data.previewSha ?? null,
      });
    } else if (
      data.previewUrl &&
      data.branch &&
      (data.previewReady && !flags.previewReady || data.previewSha)
    ) {
      if (data.previewReady) flags.previewReady = true;
      onEvent({
        type: "preview",
        previewUrl: data.previewUrl,
        branch: data.branch,
        ready: data.previewReady,
        sha: data.previewSha ?? null,
      });
    }

    if (data.done) {
      if (data.status === "ERROR") {
        onEvent({ type: "error", message: "Agent run failed." });
      }
      onEvent({ type: "done" });
      return;
    }

    const step =
      data.status === "RUNNING"
        ? { id: "work", label: "Working on your design", state: "running" as const }
        : data.status === "CREATING"
          ? { id: "start", label: "Starting agent", state: "running" as const }
          : null;
    if (step) {
      onEvent({ type: "step", ...step });
    }

    await new Promise((resolve) => setTimeout(resolve, 1500));
  }

  onEvent({ type: "done" });
}

export async function ensureSession(): Promise<{
  sessionId: string;
  agentId: string;
  branch: string;
}> {
  const contributorName = getContributorName();
  if (!contributorName) {
    throw new Error("Enter your name in the intro section before chatting with the agent.");
  }

  const sessionId = getSessionId();

  const response = await fetch(apiUrl("/api/agent/session"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId, contributorName }),
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as {
      error?: string;
      message?: string;
      code?: string;
      retryAfterSeconds?: number;
    } | null;
    if (response.status === 409 && payload?.code === "session_merged") {
      clearAgentSession();
      throw new Error(payload.message ?? "This session ended after merge. Try again.");
    }
    throw parseAgentError(response, payload);
  }

  const data = (await response.json()) as {
    sessionId: string;
    agentId: string;
    branch: string;
  };

  storeAgentId(data.agentId);
  return data;
}

export async function sendAgentMessage(params: {
  message: string;
  elementContext: ElementContext;
}): Promise<{
  runId: string;
  agentId: string;
  branch: string;
  baselineSha?: string | null;
  attachedToActiveRun?: boolean;
}> {
  const contributorName = getContributorName();
  if (!contributorName) {
    throw new Error("Enter your name in the intro section before chatting with the agent.");
  }

  const sessionId = getSessionId();

  const response = await fetch(apiUrl("/api/agent/message"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sessionId,
      contributorName,
      message: params.message,
      elementContext: params.elementContext,
    }),
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as {
      error?: string;
      message?: string;
      code?: string;
      retryAfterSeconds?: number;
    } | null;
    if (response.status === 409 && payload?.code === "session_merged") {
      clearAgentSession();
      throw new Error(payload.message ?? "This session ended after merge. Try again.");
    }
    if (response.status === 409 && payload?.code === "agent_busy") {
      throw new Error("Agent is still working on your last request. Wait for it to finish.");
    }
    throw parseAgentError(response, payload);
  }

  const data = (await response.json()) as {
    runId: string;
    agentId: string;
    branch: string;
    baselineSha?: string | null;
    attachedToActiveRun?: boolean;
  };

  storeAgentId(data.agentId);
  return data;
}

export function streamAgentRun(
  runId: string,
  agentId: string,
  onEvent: (event: AgentStreamEvent) => void,
): () => void {
  const flags = {
    previewReceived: false,
    assistantSent: false,
    previewReady: false,
    doneReceived: false,
    closed: false,
  };
  let source: EventSource | null = null;

  const finish = () => {
    if (flags.closed) return;
    flags.closed = true;
    source?.close();
    source = null;
  };

  const maybePoll = () => {
    if (flags.doneReceived || flags.closed) return;
    void pollRunUntilDone(runId, agentId, (event) => {
      if (event.type === "preview") flags.previewReceived = true;
      if (event.type === "assistant") flags.assistantSent = true;
      if (event.type === "preview" && event.ready) flags.previewReady = true;
      if (event.type === "done") flags.doneReceived = true;
      onEvent(event);
    }, flags).finally(finish);
  };

  source = new EventSource(
    apiUrl(`/api/agent/runs/${encodeURIComponent(runId)}/stream?agentId=${encodeURIComponent(agentId)}`),
  );

  source.addEventListener("assistant", (event) => {
    try {
      const data = JSON.parse(event.data) as { text?: string };
      if (data.text) {
        flags.assistantSent = true;
        onEvent({ type: "assistant", text: data.text });
      }
    } catch {
      // ignore malformed events
    }
  });

  source.addEventListener("step", (event) => {
    try {
      const data = JSON.parse(event.data) as {
        id?: string;
        label?: string;
        state?: "running" | "done";
      };
      if (data.id && data.label && data.state) {
        onEvent({
          type: "step",
          id: data.id,
          label: data.label,
          state: data.state,
        });
      }
    } catch {
      // ignore malformed events
    }
  });

  source.addEventListener("status", (event) => {
    try {
      const data = JSON.parse(event.data) as { message?: string; status?: string };
      const message = data.message ?? data.status;
      if (message) {
        onEvent({ type: "status", message });
      }
    } catch {
      // ignore malformed events
    }
  });

  source.addEventListener("activity", (event) => {
    try {
      const data = JSON.parse(event.data) as {
        kind?: "thinking" | "tool" | "status";
        text?: string;
        streamId?: string;
        done?: boolean;
      };
      if (data.text) {
        onEvent({
          type: "activity",
          kind: data.kind ?? "status",
          text: data.text,
          streamId: data.streamId,
          done: data.done,
        });
      }
    } catch {
      // ignore malformed events
    }
  });

  source.addEventListener("preview", (event) => {
    try {
      const data = JSON.parse(event.data) as {
        previewUrl?: string;
        branch?: string;
        ready?: boolean;
        sha?: string | null;
        progress?: number;
        phase?: string;
      };
      if (data.previewUrl && data.branch) {
        flags.previewReceived = true;
        if (data.ready) flags.previewReady = true;
        onEvent({
          type: "preview",
          previewUrl: data.previewUrl,
          branch: data.branch,
          ready: data.ready,
          sha: data.sha ?? null,
          progress: data.progress,
          phase: data.phase,
        });
      }
    } catch {
      // ignore malformed events
    }
  });

  source.addEventListener("error", (event) => {
    if (flags.doneReceived || flags.closed) return;

    if (event instanceof MessageEvent && event.data) {
      try {
        const data = JSON.parse(event.data) as { message?: string };
        const message = data.message ?? "Stream error";
        if (/no longer available|stream_expired|stream expired/i.test(message)) {
          maybePoll();
          return;
        }
        onEvent({ type: "error", message });
        return;
      } catch {
        // fall through
      }
    }

    if (!flags.previewReceived) {
      maybePoll();
      return;
    }

    if (!flags.doneReceived) {
      maybePoll();
      return;
    }
    finish();
  });

  source.addEventListener("done", () => {
    if (flags.doneReceived) return;
    flags.doneReceived = true;
    onEvent({ type: "done" });
    finish();
  });

  source.addEventListener("result", () => {
    if (flags.doneReceived) return;
    flags.doneReceived = true;
    onEvent({ type: "done" });
    finish();
  });

  return finish;
}

export async function submitForReview(params: {
  runId: string;
  branch: string;
}): Promise<{ mergeCommitUrl: string | null; status: string; submitRunId: string }> {
  const contributorName = getContributorName();
  if (!contributorName) {
    throw new Error("Contributor name is required.");
  }

  const response = await fetch(
    apiUrl(`/api/agent/runs/${encodeURIComponent(params.runId)}/submit`),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contributorName,
      }),
    },
  );

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as {
      error?: string;
      message?: string;
      code?: string;
    } | null;
    throw new Error(payload?.message ?? payload?.error ?? "Publish failed.");
  }

  const result = (await response.json()) as {
    runId: string;
    branch: string;
    mergeCommitUrl?: string | null;
    cooldownSeconds?: number;
  };

  const cooldownSeconds = result.cooldownSeconds ?? MERGE_COOLDOWN_MS / 1000;
  setLocalMergeCooldown(Date.now() + cooldownSeconds * 1000);
  clearAgentSession();

  return {
    mergeCommitUrl: result.mergeCommitUrl ?? null,
    status: "merged",
    submitRunId: result.runId,
  };
}

export async function fetchBranchDraft(branch: string): Promise<BranchDraftPayload> {
  const params = new URLSearchParams({ branch });
  const response = await fetch(apiUrl(`/api/agent/draft?${params.toString()}`));
  if (!response.ok) {
    throw new Error("Could not fetch branch draft.");
  }
  return (await response.json()) as BranchDraftPayload;
}

export type PreviewDeployPhase =
  | "waiting_for_push"
  | "queued"
  | "building"
  | "live"
  | "failed";

export type PreviewDeployStatus = {
  previewUrl: string;
  ready: boolean;
  branch: string;
  sha: string | null;
  progress: number;
  phase: PreviewDeployPhase;
};
export async function fetchPreviewUrl(
  branch: string,
  baselineSha?: string | null,
): Promise<PreviewDeployStatus> {
  const params = new URLSearchParams({ branch });
  if (baselineSha) {
    params.set("baselineSha", baselineSha);
  }
  const response = await fetch(apiUrl(`/api/agent/preview?${params.toString()}`));
  if (!response.ok) {
    throw new Error("Could not resolve preview URL.");
  }
  const data = (await response.json()) as {
    previewUrl: string;
    ready: boolean;
    branch: string;
    sha: string | null;
    progress?: number;
    phase?: PreviewDeployPhase;
  };
  return {
    previewUrl: data.previewUrl,
    ready: data.ready,
    branch: data.branch,
    sha: data.sha,
    progress: data.progress ?? (data.ready ? 100 : 35),
    phase: data.phase ?? (data.ready ? "live" : "building"),
  };
}

/** Heuristic Cloudflare Pages preview URL from branch name (used before API resolves). */
export function branchToPreviewUrl(branch: string): string {
  const alias = branch
    .toLowerCase()
    .replace(/\//g, "-")
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 28)
    .replace(/-$/, "");
  return `https://${alias}.popped-dev.pages.dev`;
}
