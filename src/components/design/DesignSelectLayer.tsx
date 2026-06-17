"use client";

import { useDesignMode } from "@/components/design/DesignModeContext";
import { DesignSelectLayerActive } from "@/components/design/DesignSelectLayerActive";

export function DesignSelectLayer() {
  const { isDesignMode } = useDesignMode();
  if (!isDesignMode) {
    return null;
  }
  return <DesignSelectLayerActive />;
}
