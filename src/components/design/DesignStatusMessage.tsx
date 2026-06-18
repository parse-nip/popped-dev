"use client";

import { useDesignMode } from "@/components/design/DesignModeContext";
import { useDesignWorkspace } from "@/components/design/DesignWorkspaceProvider";
import { resolveDesignStatusMessage } from "@/design/status-message";

export function DesignStatusMessage() {
  const { isDesignMode } = useDesignMode();
  const { status, showLivePreview, error, publishStatus } = useDesignWorkspace();

  const message = resolveDesignStatusMessage({
    isDesignMode,
    status,
    showLivePreview,
    error,
    publishStatus,
  });

  if (!message) return null;

  const isError = Boolean(error && status === "build_error");

  return (
    <div
      className={`design-status-bar${isError ? " design-status-bar--error" : ""}`}
      role="status"
      aria-live="polite"
      data-design-select-ui
    >
      {!isError ? <span className="design-status-bar-dot" aria-hidden="true" /> : null}
      <span>{message}</span>
    </div>
  );
}
