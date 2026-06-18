"use client";

import { useEffect } from "react";
import { useDesignMode } from "@/components/design/DesignModeContext";
import { usePreview } from "@/components/design/PreviewContext";
import { isDraftPreviewEmbed } from "@/lib/draft-preview";

/** Keeps design mode off while viewing a draft preview shell or embed. */
export function DesignModePreviewGuard() {
  const { mode: previewMode } = usePreview();
  const { isDesignMode, setMode } = useDesignMode();

  useEffect(() => {
    if ((previewMode === "preview" || isDraftPreviewEmbed()) && isDesignMode) {
      setMode("browse");
    }
  }, [previewMode, isDesignMode, setMode]);

  return null;
}
