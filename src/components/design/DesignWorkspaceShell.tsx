"use client";

import { useDesignMode } from "@/components/design/DesignModeContext";
import { useDesignWorkspace } from "@/components/design/DesignWorkspaceProvider";
import { STATUS_LABELS } from "@/design/types";

export function DesignWorkspacePreview() {
  const { isDesignMode } = useDesignMode();
  const { embedPreviewUrl, isReady } = useDesignWorkspace();

  if (!isDesignMode || !isReady || !embedPreviewUrl) return null;

  return (
    <iframe
      title="Live design preview"
      src={embedPreviewUrl}
      className="design-workspace-iframe-host"
    />
  );
}

export function DesignBootOverlay() {
  const { isDesignMode } = useDesignMode();
  const { isBooting, status, error } = useDesignWorkspace();

  if (!isDesignMode) return null;
  if (!isBooting && !error) return null;

  return (
    <div className="design-boot-overlay" data-design-select-ui>
      <div className="design-boot-overlay-card">
        <p className="design-boot-overlay-title">
          {error ? "Could not start design workspace" : "Starting design workspace"}
        </p>
        <p className="design-boot-overlay-status">
          {error ?? STATUS_LABELS[status]}
        </p>
        {error ? (
          <p className="design-boot-overlay-hint">
            The live preview runs in WebContainer with Webpack (Turbopack is not supported there).
          </p>
        ) : (
          <p className="design-boot-overlay-hint">
            Installing dependencies and starting the dev server — usually 1–2 minutes the first time.
          </p>
        )}
      </div>
    </div>
  );
}
