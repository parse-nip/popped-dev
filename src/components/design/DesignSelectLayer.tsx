"use client";

import { useDesignMode } from "@/components/design/DesignModeContext";
import { DesignSelectLayerActive } from "@/components/design/DesignSelectLayerActive";
import { useDesignWorkspace } from "@/components/design/DesignWorkspaceProvider";
import { isDraftPreviewEmbed } from "@/lib/draft-preview";

export function DesignSelectLayer() {
  const { isDesignMode } = useDesignMode();
  const { isReady } = useDesignWorkspace();
  if (!isDesignMode || !isReady || isDraftPreviewEmbed()) {
    return null;
  }
  return <DesignSelectLayerActive />;
}
