"use client";

import { useDesignMode } from "@/components/design/DesignModeContext";
import { useDesignWorkspace } from "@/components/design/DesignWorkspaceProvider";
import { resolveDesignStatusMessage } from "@/design/status-message";

export function DesignStatusMessage() {
  const { isDesignMode } = useDesignMode();
  const { status, showLivePreview, error, publishStatus, progressPercent, statusDetail, statusBarTone } =
    useDesignWorkspace();

  const message = resolveDesignStatusMessage({
    isDesignMode,
    status,
    showLivePreview,
    error,
    publishStatus,
    progressPercent,
    statusDetail,
    statusBarTone,
  });

  if (!message) return null;

  const isError = status === "build_error" || status === "edit_rejected";
  const isDeploySuccess = publishStatus === "deployed";
  const toneClass =
    statusBarTone === "approved" || isDeploySuccess
      ? " design-status-bar--approved"
      : statusBarTone === "approving"
        ? " design-status-bar--approving"
        : statusBarTone === "rejected" || status === "edit_rejected"
          ? " design-status-bar--rejected"
          : "";

  return (
    <div
      className={`design-status-bar${isError ? " design-status-bar--error" : ""}${toneClass}`}
      role="status"
      aria-live="polite"
      data-design-select-ui
    >
      {!isError && statusBarTone !== "approved" && !isDeploySuccess ? (
        <span className="design-status-bar-dot" aria-hidden="true" />
      ) : null}
      {statusBarTone === "approved" || isDeploySuccess ? (
        <span className="design-status-bar-check" aria-hidden="true">
          ✓
        </span>
      ) : null}
      <span className="design-status-bar-text">{message}</span>
    </div>
  );
}
