"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { usePreview } from "@/components/design/PreviewContext";
import { ElementChatPopup } from "@/components/design/ElementChatPopup";
import { buildElementContext } from "@/lib/element-context";
import { getElementLabel, getSelectableElement } from "@/lib/element-label";

const HIGHLIGHT_INSET = 6;

type Rect = {
  top: number;
  left: number;
  width: number;
  height: number;
};

type HoverState = {
  element: Element;
  label: string;
};

type ChatState = {
  element: Element;
  label: string;
};

function expandRect(rect: DOMRect, inset: number): Rect {
  return {
    top: rect.top - inset,
    left: rect.left - inset,
    width: rect.width + inset * 2,
    height: rect.height + inset * 2,
  };
}

function rectFromElement(element: Element, inset: number): Rect {
  return expandRect(element.getBoundingClientRect(), inset);
}

export function DesignSelectLayerActive() {
  const { showPreview } = usePreview();
  const [hover, setHover] = useState<HoverState | null>(null);
  const [chat, setChat] = useState<ChatState | null>(null);
  const [highlight, setHighlight] = useState<Rect | null>(null);

  const handlePreviewReady = useCallback(
    (params: Parameters<typeof showPreview>[0]) => {
      showPreview(params);
      setChat(null);
      setHover(null);
      setHighlight(null);
    },
    [showPreview],
  );

  useEffect(() => {
    document.body.dataset.cursorMode = "design";
    return () => {
      delete document.body.dataset.cursorMode;
    };
  }, []);

  const updateHover = useCallback((target: EventTarget | null) => {
    const element = getSelectableElement(target);
    if (!element) {
      setHover(null);
      return;
    }

    setHover({
      element,
      label: getElementLabel(element),
    });
  }, []);

  const clearSelection = useCallback(() => {
    setChat(null);
    setHover(null);
    setHighlight(null);
  }, []);

  const trackedElement = chat?.element ?? hover?.element;

  useEffect(() => {
    if (!trackedElement) {
      return;
    }

    let frame = 0;

    const syncHighlight = () => {
      if (!document.contains(trackedElement)) {
        clearSelection();
        return;
      }

      setHighlight(rectFromElement(trackedElement, HIGHLIGHT_INSET));
    };

    const scheduleSync = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(syncHighlight);
    };

    scheduleSync();
    window.addEventListener("scroll", scheduleSync, true);
    window.addEventListener("resize", scheduleSync);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", scheduleSync, true);
      window.removeEventListener("resize", scheduleSync);
    };
  }, [trackedElement, clearSelection]);

  useEffect(() => {
    function handleMouseMove(event: MouseEvent) {
      if (chat) return;
      updateHover(event.target);
    }

    function handleMouseLeave() {
      if (!chat) {
        setHover(null);
      }
    }

    function handleClick(event: MouseEvent) {
      const element = getSelectableElement(event.target);
      if (!element) return;

      event.preventDefault();
      event.stopPropagation();

      const label = getElementLabel(element);
      setChat({ element, label });
      setHover({ element, label });
    }

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseleave", handleMouseLeave);
    document.addEventListener("click", handleClick, true);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseleave", handleMouseLeave);
      document.removeEventListener("click", handleClick, true);
    };
  }, [chat, updateHover]);

  const displayHighlight = trackedElement ? highlight : null;

  return createPortal(
    <>
      {displayHighlight ? (
        <div data-design-select-ui className="design-select-overlay" aria-hidden="true">
          <div
            className={`design-select-highlight${chat ? " design-select-highlight--selected" : ""}`}
            style={{
              top: displayHighlight.top,
              left: displayHighlight.left,
              width: displayHighlight.width,
              height: displayHighlight.height,
            }}
          />
        </div>
      ) : null}

      {chat && displayHighlight ? (
        <ElementChatPopup
          anchorRect={displayHighlight}
          elementLabel={chat.label}
          elementContext={buildElementContext(chat.element)}
          onClose={clearSelection}
          onPreviewReady={handlePreviewReady}
        />
      ) : null}
    </>,
    document.body,
  );
}
