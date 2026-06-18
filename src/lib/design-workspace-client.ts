import { getContributorName } from "@/lib/agent-client";
import type {
  AgentEditResponse,
  ProjectFilesResponse,
  PublishResponse,
} from "@/design/types";

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

export async function requestAgentEdit(input: {
  prompt: string;
  files: Record<string, string>;
  selectedElement?: unknown;
}): Promise<AgentEditResponse> {
  const response = await fetch(apiUrl("/api/agent/edit"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
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
