"use client";

import { useDesignMode } from "@/components/design/DesignModeContext";
import { DesignSelectLayerActive } from "@/components/design/DesignSelectLayerActive";
import { useDesignWorkspace } from "@/components/design/DesignWorkspaceProvider";
import { isDraftPreviewEmbed } from "@/lib/draft-preview";

export function DesignSelectLayer() {
  const { isDesignMode } = useDesignMode();
  const { showLivePreview, embedPreviewUrl } = useDesignWorkspace();
  if (!isDesignMode || !showLivePreview || isDraftPreviewEmbed()) {
    return null;
  }
  return <DesignSelectLayerActive />;
}
