"use client";

import { useDesignMode } from "@/components/design/DesignModeContext";
import { DesignSelectLayerActive } from "@/components/design/DesignSelectLayerActive";
import { usePreview } from "@/components/design/PreviewContext";
import { isDraftPreviewEmbed } from "@/lib/draft-preview";

export function DesignSelectLayer() {
  const { isDesignMode } = useDesignMode();
  const { mode } = usePreview();
  if (!isDesignMode || mode === "preview" || isDraftPreviewEmbed()) {
    return null;
  }
  return <DesignSelectLayerActive />;
}
