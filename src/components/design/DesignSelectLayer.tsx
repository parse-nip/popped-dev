"use client";

import { useDesignMode } from "@/components/design/DesignModeContext";
import { DesignSelectLayerActive } from "@/components/design/DesignSelectLayerActive";
import { isDraftPreviewEmbed } from "@/lib/draft-preview";

export function DesignSelectLayer() {
  const { isDesignMode } = useDesignMode();
  if (!isDesignMode || isDraftPreviewEmbed()) {
    return null;
  }
  return <DesignSelectLayerActive />;
}
