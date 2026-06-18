import type { DesignWorkspaceStatus, StatusBarTone } from "./types";
import { formatStatusWithPercent, isReadableStatusDetail } from "./install-progress";

export const STATUS_LABELS: Record<DesignWorkspaceStatus, string> = {
  idle: "",
  booting: "Preparing design mode…",
  loading_files: "Loading site files…",
  installing: "Installing packages…",
  starting_dev: "Starting preview…",
  ready: "Loading preview…",
  agent_editing: "Agent is working…",
  applying_changes: "Applying changes…",
  installing_packages: "Installing packages…",
  build_error: "Something went wrong",
  edit_rejected: "Request not approved",
  ready_to_publish: "Ready to publish",
  publishing: "Publishing to GitHub…",
  published: "Published — waiting for popped.dev deploy…",
};

type StatusMessageInput = {
  isDesignMode: boolean;
  status: DesignWorkspaceStatus;
  showLivePreview: boolean;
  error: string | null;
  publishStatus: "idle" | "publishing" | "published" | "deploying" | "failed";
  progressPercent: number | null;
  statusDetail: string | null;
  statusBarTone: StatusBarTone;
};

const PROGRESS_STATUSES = new Set<DesignWorkspaceStatus>([
  "installing",
  "starting_dev",
  "installing_packages",
  "ready",
]);

export function resolveDesignStatusMessage(input: StatusMessageInput): string | null {
  if (!input.isDesignMode) return null;

  if (input.error && input.status === "build_error") {
    return input.error;
  }

  if (input.status === "edit_rejected" && input.error) {
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
  if (!label) return null;

  if (input.status === "agent_editing") {
    if (input.statusBarTone === "approving") {
      return input.statusDetail && isReadableStatusDetail(input.statusDetail)
        ? input.statusDetail
        : "Checking your idea…";
    }
    if (input.statusBarTone === "approved") {
      return input.statusDetail && isReadableStatusDetail(input.statusDetail)
        ? input.statusDetail
        : "Idea approved";
    }
    if (isReadableStatusDetail(input.statusDetail)) {
      return input.statusDetail;
    }
    return label;
  }

  if (input.status === "applying_changes") {
    return input.statusDetail && isReadableStatusDetail(input.statusDetail)
      ? `${label} — ${input.statusDetail}`
      : label;
  }

  if (PROGRESS_STATUSES.has(input.status) && input.progressPercent !== null) {
    return formatStatusWithPercent(label, input.progressPercent);
  }

  return label;
}
