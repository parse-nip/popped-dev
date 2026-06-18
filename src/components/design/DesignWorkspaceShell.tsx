"use client";

import { useDesignMode } from "@/components/design/DesignModeContext";
import { useDesignWorkspace } from "@/components/design/DesignWorkspaceProvider";

/** Invisible live layer — crossfades in once the dev preview is fully ready. */
export function DesignWorkspacePreview() {
  const { isDesignMode } = useDesignMode();
  const { embedPreviewUrl, showLivePreview, onPreviewFrameLoad } = useDesignWorkspace();

  if (!isDesignMode || !embedPreviewUrl) return null;

  return (
    <iframe
      key={embedPreviewUrl}
      title="Portfolio preview"
      src={embedPreviewUrl}
      className={`design-live-layer design-workspace-iframe-host${showLivePreview ? " design-live-layer--visible" : ""}`}
      onLoad={onPreviewFrameLoad}
    />
  );
}
