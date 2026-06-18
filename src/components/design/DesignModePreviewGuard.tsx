"use client";

import { useEffect } from "react";
import { useDesignMode } from "@/components/design/DesignModeContext";
import { isDraftPreviewEmbed } from "@/lib/draft-preview";

/** Keeps design mode off inside draft preview embeds. */
export function DesignModePreviewGuard() {
  const { isDesignMode, setMode } = useDesignMode();

  useEffect(() => {
    if (isDraftPreviewEmbed() && isDesignMode) {
      setMode("browse");
    }
  }, [isDesignMode, setMode]);

  return null;
}
