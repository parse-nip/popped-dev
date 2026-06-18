import type { DesignWorkspaceStatus } from "./types";

export const STATUS_LABELS: Record<DesignWorkspaceStatus, string> = {
  idle: "",
  booting: "Preparing design mode…",
  loading_files: "Loading site files…",
  installing: "Installing packages…",
  starting_dev: "Starting preview…",
  ready: "Loading preview…",
  agent_editing: "Agent is thinking…",
  applying_changes: "Applying changes…",
  installing_packages: "Installing packages…",
  build_error: "Something went wrong",
  ready_to_publish: "Ready to publish",
  publishing: "Publishing to GitHub…",
  published: "Published — deploying…",
};

type StatusMessageInput = {
  isDesignMode: boolean;
  status: DesignWorkspaceStatus;
  showLivePreview: boolean;
  error: string | null;
  publishStatus: "idle" | "publishing" | "published" | "deploying" | "failed";
};

export function resolveDesignStatusMessage(input: StatusMessageInput): string | null {
  if (!input.isDesignMode) return null;

  if (input.error && input.status === "build_error") {
    return input.error;
  }

  if (input.publishStatus === "deploying") {
    return "Deploying to popped.dev…";
  }

  if (input.publishStatus === "published") {
    return "Live on popped.dev";
  }

  if (input.status === "ready" && input.showLivePreview) {
    return null;
  }

  if (input.status === "ready_to_publish" && input.showLivePreview) {
    return STATUS_LABELS.ready_to_publish;
  }

  if (input.status === "published") {
    return STATUS_LABELS.published;
  }

  const label = STATUS_LABELS[input.status];
  return label || null;
}
