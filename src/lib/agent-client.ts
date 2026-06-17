import { readContributorName } from "@/lib/contributor-name";
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
  | { type: "preview"; previewUrl: string; branch: string }
  | { type: "error"; message: string }
  | { type: "done" };

export type RunStatusPayload = {
  runId: string;
  agentId: string;
  status: string;
  result?: string | null;
  branch?: string;
  previewUrl?: string;
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
  flags: { previewReceived: boolean; assistantSent: boolean },
  maxAttempts = 90,
): Promise<void> {
  onEvent({ type: "status", message: "Checking agent progress…" });

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const data = await fetchRunStatus(runId, agentId);

    if (data.result && !flags.assistantSent) {
      flags.assistantSent = true;
      onEvent({ type: "assistant", text: data.result });
    }

    if (data.previewUrl && data.branch && !flags.previewReceived) {
      flags.previewReceived = true;
      onEvent({ type: "preview", previewUrl: data.previewUrl, branch: data.branch });
      onEvent({ type: "status", message: "Opening preview…" });
    }

    if (data.done) {
      if (data.status === "ERROR") {
        onEvent({ type: "error", message: "Agent run failed." });
      }
      onEvent({ type: "done" });
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  onEvent({ type: "error", message: "Agent run timed out." });
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
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error ?? "Could not start agent session.");
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
}): Promise<{ runId: string; agentId: string; branch: string }> {
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
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error ?? "Agent message failed.");
  }

  const data = (await response.json()) as {
    runId: string;
    agentId: string;
    branch: string;
  };

  storeAgentId(data.agentId);
  return data;
}

export function streamAgentRun(
  runId: string,
  agentId: string,
  onEvent: (event: AgentStreamEvent) => void,
): () => void {
  const flags = { previewReceived: false, assistantSent: false, doneReceived: false, closed: false };
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

  source.addEventListener("preview", (event) => {
    try {
      const data = JSON.parse(event.data) as { previewUrl?: string; branch?: string };
      if (data.previewUrl && data.branch) {
        flags.previewReceived = true;
        onEvent({ type: "preview", previewUrl: data.previewUrl, branch: data.branch });
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
      onEvent({ type: "done" });
      flags.doneReceived = true;
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

async function pollRun(runId: string, agentId: string, maxAttempts = 60) {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const response = await fetch(
      apiUrl(`/api/agent/runs/${encodeURIComponent(runId)}?agentId=${encodeURIComponent(agentId)}`),
    );
    if (!response.ok) {
      throw new Error("Could not poll agent run.");
    }

    const data = (await response.json()) as {
      status: string;
      prUrl?: string | null;
      done?: boolean;
    };

    if (data.prUrl) {
      return data;
    }

    if (data.done) {
      return data;
    }

    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  throw new Error("Submit run timed out.");
}

export async function submitForReview(params: {
  runId: string;
  branch: string;
}): Promise<{ prUrl: string | null; status: string; submitRunId: string }> {
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
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error ?? "Submit for review failed.");
  }

  const started = (await response.json()) as {
    runId: string;
    agentId: string;
    branch: string;
  };

  const completed = await pollRun(started.runId, started.agentId);
  return {
    prUrl: completed.prUrl ?? null,
    status: completed.status,
    submitRunId: started.runId,
  };
}

export async function fetchPreviewUrl(branch: string): Promise<{
  previewUrl: string;
  ready: boolean;
  branch: string;
}> {
  const response = await fetch(
    apiUrl(`/api/agent/preview?branch=${encodeURIComponent(branch)}`),
  );
  if (!response.ok) {
    throw new Error("Could not resolve preview URL.");
  }
  return (await response.json()) as {
    previewUrl: string;
    ready: boolean;
    branch: string;
  };
}

/** @deprecated Use fetchPreviewUrl; kept for local fallback display. */
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
