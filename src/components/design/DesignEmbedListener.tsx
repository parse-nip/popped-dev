"use client";

import { useEffect } from "react";
import { DESIGN_EMBED_SOURCE } from "@shared/design-embed-messages";
import { buildElementContext } from "@/lib/element-context";
import { getElementLabel, getSelectableElement } from "@/lib/element-label";

const HIGHLIGHT_INSET = 6;

function expandRect(rect: DOMRect) {
  return {
    top: rect.top - HIGHLIGHT_INSET,
    left: rect.left - HIGHLIGHT_INSET,
    width: rect.width + HIGHLIGHT_INSET * 2,
    height: rect.height + HIGHLIGHT_INSET * 2,
  };
}

function post(type: "hover" | "select" | "clear", element?: Element) {
  if (typeof window === "undefined" || window.parent === window) return;

  if (type === "clear" || !element) {
    window.parent.postMessage({ source: DESIGN_EMBED_SOURCE, type: "clear" }, "*");
    return;
  }

  const context = buildElementContext(element);
  const rect = expandRect(element.getBoundingClientRect());

  window.parent.postMessage(
    {
      source: DESIGN_EMBED_SOURCE,
      type,
      rect,
      context,
    },
    "*",
  );
}

/** Runs inside the WebContainer preview iframe — forwards element selection to the host. */
export function DesignEmbedListener() {
  useEffect(() => {
    if (typeof window === "undefined") return;

    const params = new URLSearchParams(window.location.search);
    const inEmbed = params.get("designEmbed") === "1" || window.parent !== window;
    if (!inEmbed) return;

    document.body.dataset.designEmbed = "1";

    function handleMouseMove(event: MouseEvent) {
      const element = getSelectableElement(event.target);
      if (!element) {
        post("clear");
        return;
      }
      post("hover", element);
    }

    function handleMouseLeave() {
      post("clear");
    }

    function handleClick(event: MouseEvent) {
      const target = event.target;
      if (target instanceof Element && target.closest("[data-design-select-ui]")) {
        return;
      }

      const element = getSelectableElement(event.target);
      if (!element) return;

      event.preventDefault();
      event.stopPropagation();
      post("select", element);
    }

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseleave", handleMouseLeave);
    document.addEventListener("click", handleClick, true);

    return () => {
      delete document.body.dataset.designEmbed;
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseleave", handleMouseLeave);
      document.removeEventListener("click", handleClick, true);
    };
  }, []);

  return null;
}
