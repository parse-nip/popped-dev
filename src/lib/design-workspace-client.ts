import { getContributorName } from "@/lib/agent-client";
import type {
  AgentEditResponse,
  ProjectFilesResponse,
  PublishResponse,
} from "@/design/types";
import { DEFAULT_OPENROUTER_MODEL } from "@shared/openrouter-config";

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

export async function fetchProjectFiles(): Promise<ProjectFilesResponse> {
  const response = await fetch(apiUrl("/api/project-files"));
  const payload = (await response.json()) as ProjectFilesResponse & { error?: string };
  if (!response.ok) {
    throw new Error(payload.error ?? "Could not load project files.");
  }
  return payload;
}

export type AgentEditStreamHandlers = {
  onStatus?: (message: string) => void;
  onApproved?: (reason: string) => void;
  onRejected?: (reason: string) => void;
};

function normalizeAgentEditResult(payload: Record<string, unknown>): AgentEditResponse {
  const writes = Array.isArray(payload.writes)
    ? payload.writes.filter(
        (item): item is { path: string; content: string } =>
          Boolean(item) &&
          typeof item === "object" &&
          typeof (item as { path?: string }).path === "string" &&
          typeof (item as { content?: string }).content === "string",
      )
    : [];

  const commands = Array.isArray(payload.commands)
    ? payload.commands.filter((item): item is string => typeof item === "string")
    : [];

  return {
    ok: true,
    summary: typeof payload.summary === "string" ? payload.summary : "Applied design change.",
    writes,
    commands,
  };
}

function parseSseBlock(block: string): { event: string; data: string } | null {
  const lines = block.split("\n");
  let event = "message";
  const dataLines: string[] = [];

  for (const line of lines) {
    if (line.startsWith("event:")) {
      event = line.slice(6).trim();
    } else if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).trim());
    }
  }

  if (dataLines.length === 0) return null;
  return { event, data: dataLines.join("\n") };
}

export async function requestAgentEdit(
  input: {
    prompt: string;
    files: Record<string, string>;
    selectedElement?: unknown;
  },
  handlers: AgentEditStreamHandlers = {},
): Promise<AgentEditResponse> {
  const response = await fetch(apiUrl("/api/agent/edit"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
    },
    body: JSON.stringify({ ...input, stream: true }),
  });

  const contentType = response.headers.get("content-type") ?? "";

  if (contentType.includes("text/event-stream") && response.body) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let result: AgentEditResponse | null = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const blocks = buffer.split("\n\n");
      buffer = blocks.pop() ?? "";

      for (const block of blocks) {
        const parsed = parseSseBlock(block.trim());
        if (!parsed) continue;

        try {
          const payload = JSON.parse(parsed.data) as Record<string, unknown>;

          if (parsed.event === "status" && typeof payload.message === "string") {
            handlers.onStatus?.(payload.message);
          }

          if (parsed.event === "approved") {
            const reason =
              typeof payload.reason === "string" ? payload.reason : "Idea approved — agent is working…";
            handlers.onApproved?.(reason);
          }

          if (parsed.event === "rejected") {
            const reason =
              typeof payload.reason === "string" ? payload.reason : "This request can't run in design mode.";
            handlers.onRejected?.(reason);
            throw new Error(reason);
          }

          if (parsed.event === "result") {
            result = normalizeAgentEditResult(payload);
          }

          if (parsed.event === "error") {
            throw new Error(
              typeof payload.message === "string" ? payload.message : "Agent edit failed.",
            );
          }
        } catch (error) {
          if (parsed.event === "error") throw error;
        }
      }
    }

    if (result) {
      if (result.writes.length === 0) {
        throw new Error("Agent returned no file changes.");
      }
      return result;
    }
    throw new Error("Agent edit returned no result.");
  }

  const payload = (await response.json()) as AgentEditResponse & { error?: string };
  if (!response.ok) {
    throw new Error(payload.error ?? "Agent edit failed.");
  }
  return payload;
}

export async function publishWorkspaceChanges(input: {
  baseSha: string;
  changes: Array<{ path: string; content: string; action: "create" | "modify" | "delete" }>;
  summary?: string;
  allowContentFactChanges?: boolean;
}): Promise<PublishResponse> {
  const contributorName = getContributorName();
  const response = await fetch(apiUrl("/api/publish"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...input,
      contributorName,
    }),
  });
  const payload = (await response.json()) as PublishResponse & { error?: string };
  if (!response.ok) {
    throw new Error(payload.error ?? "Publish failed.");
  }
  return payload;
}

export async function pollDeployStatus(sha: string): Promise<{ live: boolean; state?: string }> {
  const response = await fetch(apiUrl(`/api/design/deploy-status?sha=${encodeURIComponent(sha)}`));
  const payload = (await response.json()) as { live?: boolean; state?: string; error?: string };
  if (!response.ok) {
    throw new Error(payload.error ?? "Deploy status check failed.");
  }
  return { live: payload.live === true, state: payload.state };
}

/** Default OpenRouter model for design edits (override on Worker via OPENROUTER_MODEL). */
export const DESIGN_AGENT_MODEL = DEFAULT_OPENROUTER_MODEL;
