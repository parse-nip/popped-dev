import { ATTRIBUTION_KEY } from "@/components/locked/LockedIntro";
import type { ElementContext } from "./element-context";

const SESSION_ID_KEY = "popped.dev:agent-session-id";
const AGENT_ID_KEY = "popped.dev:agent-id";

const API_BASE =
  (typeof process !== "undefined" && process.env.NEXT_PUBLIC_AGENT_API_URL) || "";

function apiUrl(path: string): string {
  return `${API_BASE}${path}`;
}

export function getContributorName(): string {
  if (typeof window === "undefined") return "";

  const stored = localStorage.getItem(ATTRIBUTION_KEY)?.trim();
  if (stored) return stored;

  const input = document.getElementById("contributor-name") as HTMLInputElement | null;
  return input?.value.trim() ?? "";
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
  const source = new EventSource(
    apiUrl(`/api/agent/runs/${encodeURIComponent(runId)}/stream?agentId=${encodeURIComponent(agentId)}`),
  );

  source.addEventListener("assistant", (event) => {
    try {
      const data = JSON.parse(event.data) as { text?: string };
      if (data.text) {
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
        onEvent({ type: "preview", previewUrl: data.previewUrl, branch: data.branch });
      }
    } catch {
      // ignore malformed events
    }
  });

  source.addEventListener("error", (event) => {
    if (event instanceof MessageEvent && event.data) {
      try {
        const data = JSON.parse(event.data) as { message?: string };
        onEvent({ type: "error", message: data.message ?? "Stream error" });
        return;
      } catch {
        // fall through
      }
    }
    onEvent({ type: "error", message: "Connection to agent stream lost." });
  });

  source.addEventListener("done", () => {
    onEvent({ type: "done" });
    source.close();
  });

  source.addEventListener("result", () => {
    onEvent({ type: "done" });
  });

  return () => source.close();
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

export function branchToPreviewUrl(branch: string): string {
  const alias = branch
    .toLowerCase()
    .replace(/\//g, "-")
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return `https://${alias}--popped-dev.pages.dev`;
}
