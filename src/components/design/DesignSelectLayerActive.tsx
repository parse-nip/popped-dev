"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ElementChatPopup } from "@/components/design/ElementChatPopup";
import { DraftConfirmBadge } from "@/components/design/DraftConfirmBadge";
import { useDesignWorkspace } from "@/components/design/DesignWorkspaceProvider";
import {
  isDesignEmbedMessage,
  type DesignEmbedElementContext,
  type DesignEmbedRect,
} from "@shared/design-embed-messages";
import { buildElementContext, ensureDesignIdOnElement } from "@/lib/element-context";
import type { ElementContext } from "@/lib/element-context";
import { getElementLabel, getSelectableElement } from "@/lib/element-label";

const HIGHLIGHT_INSET = 6;

type Rect = {
  top: number;
  left: number;
  width: number;
  height: number;
};

type HoverState = {
  label: string;
  context: ElementContext;
};

type ChatState = {
  label: string;
  context: ElementContext;
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

function offsetEmbedRect(iframe: HTMLIFrameElement, rect: DesignEmbedRect): Rect {
  const frame = iframe.getBoundingClientRect();
  return {
    top: frame.top + rect.top,
    left: frame.left + rect.left,
    width: rect.width,
    height: rect.height,
  };
}

function embedContextToElementContext(context: DesignEmbedElementContext): ElementContext {
  return context;
}

export function DesignSelectLayerActive() {
  const { isReady, embedPreviewUrl } = useDesignWorkspace();
  const useIframeSelection = isReady && Boolean(embedPreviewUrl);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  const [hover, setHover] = useState<HoverState | null>(null);
  const [chat, setChat] = useState<ChatState | null>(null);
  const [highlight, setHighlight] = useState<Rect | null>(null);
  const [selectionLocked, setSelectionLocked] = useState(false);

  useEffect(() => {
    document.body.dataset.cursorMode = "design";
    return () => {
      delete document.body.dataset.cursorMode;
    };
  }, []);

  useEffect(() => {
    iframeRef.current = document.querySelector<HTMLIFrameElement>(".design-workspace-iframe-host");
  });

  const clearSelection = useCallback(() => {
    setChat(null);
    setHover(null);
    setHighlight(null);
  }, []);

  const updateHover = useCallback((target: EventTarget | null) => {
    const element = getSelectableElement(target);
    if (!element) {
      setHover(null);
      return;
    }

    ensureDesignIdOnElement(element);
    setHover({
      label: getElementLabel(element),
      context: buildElementContext(element),
    });
  }, []);

  useEffect(() => {
    if (useIframeSelection) return;

    const tracked = chat?.context.designId ?? hover?.context.designId;
    if (!tracked) return;

    // Static page highlight sync handled via DOM element lookup below
  }, [useIframeSelection, chat, hover]);

  useEffect(() => {
    if (useIframeSelection) return;

    function handleMouseMove(event: MouseEvent) {
      if (chat || selectionLocked) return;
      updateHover(event.target);
      const element = getSelectableElement(event.target);
      setHighlight(element ? rectFromElement(element, HIGHLIGHT_INSET) : null);
    }

    function handleMouseLeave() {
      if (!chat && !selectionLocked) {
        setHover(null);
        setHighlight(null);
      }
    }

    function handleClick(event: MouseEvent) {
      if (selectionLocked) {
        const target = event.target;
        if (target instanceof Element && target.closest("[data-design-select-ui]")) return;
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      const element = getSelectableElement(event.target);
      if (!element) return;

      event.preventDefault();
      event.stopPropagation();

      ensureDesignIdOnElement(element);
      const context = buildElementContext(element);
      setChat({ label: getElementLabel(element), context });
      setHover({ label: getElementLabel(element), context });
      setHighlight(rectFromElement(element, HIGHLIGHT_INSET));
    }

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseleave", handleMouseLeave);
    document.addEventListener("click", handleClick, true);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseleave", handleMouseLeave);
      document.removeEventListener("click", handleClick, true);
    };
  }, [chat, selectionLocked, updateHover, useIframeSelection]);

  useEffect(() => {
    if (!useIframeSelection) return;

    function handleMessage(event: MessageEvent) {
      if (!isDesignEmbedMessage(event.data)) return;

      const iframe = iframeRef.current;
      if (!iframe) return;

      if (event.data.type === "clear") {
        if (!chat && !selectionLocked) {
          setHover(null);
          setHighlight(null);
        }
        return;
      }

      const context = embedContextToElementContext(event.data.context);
      const rect = offsetEmbedRect(iframe, event.data.rect);

      if (event.data.type === "hover") {
        if (chat || selectionLocked) return;
        setHover({ label: context.label, context });
        setHighlight(rect);
        return;
      }

      if (selectionLocked) return;

      setChat({ label: context.label, context });
      setHover({ label: context.label, context });
      setHighlight(rect);
    }

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [useIframeSelection, chat, selectionLocked]);

  const displayHighlight = highlight;

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
        <>
          <ElementChatPopup
            anchorRect={displayHighlight}
            elementLabel={chat.label}
            elementContext={chat.context}
            onClose={clearSelection}
            onSelectionLockChange={setSelectionLocked}
          />
          <DraftConfirmBadge
            anchorRect={displayHighlight}
            onRejected={clearSelection}
            onAccepted={clearSelection}
          />
        </>
      ) : null}
    </>,
    document.body,
  );
}
