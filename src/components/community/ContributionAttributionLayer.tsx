"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { useDesignMode } from "@/components/design/DesignModeContext";
import { usePreview } from "@/components/design/PreviewContext";
import { hasAttribution, resolveContributorName } from "@/lib/contributions";

type TooltipState = {
  name: string;
  top: number;
  left: number;
};

const TOOLTIP_OFFSET = 10;

function findAttributedElement(target: EventTarget | null): Element | null {
  if (!(target instanceof Element)) {
    return null;
  }

  const element = target.closest("[data-contribution-id]");
  if (!element) {
    return null;
  }

  const contributionId = element.getAttribute("data-contribution-id");
  if (!contributionId || !hasAttribution(contributionId)) {
    return null;
  }

  return element;
}

function positionTooltip(element: Element): Pick<TooltipState, "top" | "left"> {
  const rect = element.getBoundingClientRect();
  return {
    top: rect.bottom + TOOLTIP_OFFSET,
    left: Math.min(rect.right - 8, window.innerWidth - 220),
  };
}

function useIsClient() {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

export function ContributionAttributionLayer() {
  const mounted = useIsClient();
  const { isDesignMode } = useDesignMode();
  const { mode: previewMode } = usePreview();
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  const clearTooltip = useCallback(() => {
    setTooltip(null);
  }, []);

  const updateTooltip = useCallback((target: EventTarget | null) => {
    const element = findAttributedElement(target);
    if (!element) {
      setTooltip(null);
      return;
    }

    const contributionId = element.getAttribute("data-contribution-id");
    if (!contributionId) {
      setTooltip(null);
      return;
    }

    const name = resolveContributorName(contributionId);
    if (!name) {
      setTooltip(null);
      return;
    }

    const position = positionTooltip(element);
    setTooltip({ name, ...position });
  }, []);

  useEffect(() => {
    if (!mounted || isDesignMode || previewMode === "preview") {
      setTooltip(null);
      return;
    }

    const handlePointerMove = (event: PointerEvent) => {
      updateTooltip(event.target);
    };

    const handleScroll = () => {
      setTooltip(null);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("scroll", handleScroll, true);
    window.addEventListener("resize", clearTooltip);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("scroll", handleScroll, true);
      window.removeEventListener("resize", clearTooltip);
    };
  }, [mounted, isDesignMode, previewMode, updateTooltip, clearTooltip]);

  if (!mounted || !tooltip || isDesignMode || previewMode === "preview") {
    return null;
  }

  return createPortal(
    <div
      className="contribution-attribution-tooltip"
      role="tooltip"
      style={{
        top: tooltip.top,
        left: Math.max(12, tooltip.left),
      }}
    >
      <span className="contribution-attribution-tooltip-label">Styled by</span>
      <span className="contribution-attribution-tooltip-name">{tooltip.name}</span>
    </div>,
    document.body,
  );
}
