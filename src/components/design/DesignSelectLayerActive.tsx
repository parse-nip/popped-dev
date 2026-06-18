"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ElementChatPopup } from "@/components/design/ElementChatPopup";
import { useDesignWorkspace } from "@/components/design/DesignWorkspaceProvider";
import {
  isDesignEmbedMessage,
  type DesignEmbedElementContext,
  type DesignEmbedRect,
} from "@shared/design-embed-messages";
import {
  DESIGN_HOST_SOURCE,
  type DesignHostMessage,
} from "@shared/design-host-messages";
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

function getPreviewIframe(): HTMLIFrameElement | null {
  return document.querySelector<HTMLIFrameElement>(".design-workspace-iframe-host");
}

function postToPreviewIframe(message: DesignHostMessage) {
  const iframe = getPreviewIframe();
  iframe?.contentWindow?.postMessage(message, "*");
}

export function DesignSelectLayerActive() {
  const { showLivePreview, embedPreviewUrl, runAgentEdit } = useDesignWorkspace();
  const useIframeSelection = showLivePreview && Boolean(embedPreviewUrl);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  const [hover, setHover] = useState<HoverState | null>(null);
  const [chat, setChat] = useState<ChatState | null>(null);
  const [highlight, setHighlight] = useState<Rect | null>(null);

  useEffect(() => {
    document.body.dataset.cursorMode = "design";
    return () => {
      delete document.body.dataset.cursorMode;
      postToPreviewIframe({ source: DESIGN_HOST_SOURCE, type: "clear-editing" });
    };
  }, []);

  useEffect(() => {
    iframeRef.current = getPreviewIframe();
  });

  const clearSelection = useCallback(() => {
    setChat(null);
    setHover(null);
    setHighlight(null);
    postToPreviewIframe({ source: DESIGN_HOST_SOURCE, type: "clear-editing" });
  }, []);

  const handleSubmitEdit = useCallback(
    async (prompt: string, context: ElementContext) => {
      setChat(null);
      setHover(null);
      setHighlight(null);
      postToPreviewIframe({
        source: DESIGN_HOST_SOURCE,
        type: "mark-editing",
        designId: context.designId,
      });

      try {
        await runAgentEdit(prompt, context);
      } finally {
        postToPreviewIframe({ source: DESIGN_HOST_SOURCE, type: "clear-editing" });
      }
    },
    [runAgentEdit],
  );

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

    function handleMouseMove(event: MouseEvent) {
      if (chat) return;
      updateHover(event.target);
      const element = getSelectableElement(event.target);
      setHighlight(element ? rectFromElement(element, HIGHLIGHT_INSET) : null);
    }

    function handleMouseLeave() {
      if (!chat) {
        setHover(null);
        setHighlight(null);
      }
    }

    function handleClick(event: MouseEvent) {
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
  }, [chat, updateHover, useIframeSelection]);

  useEffect(() => {
    if (!useIframeSelection) return;

    function handleMessage(event: MessageEvent) {
      if (!isDesignEmbedMessage(event.data)) return;

      const iframe = iframeRef.current ?? getPreviewIframe();
      if (!iframe) return;

      if (event.data.type === "clear") {
        if (!chat) {
          setHover(null);
          setHighlight(null);
        }
        return;
      }

      if (event.data.type === "ready") return;

      if (chat) return;

      const context = embedContextToElementContext(event.data.context);
      const rect = offsetEmbedRect(iframe, event.data.rect);

      if (event.data.type === "hover") {
        setHover({ label: context.label, context });
        setHighlight(rect);
        return;
      }

      setChat({ label: context.label, context });
      setHover({ label: context.label, context });
      setHighlight(rect);
    }

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [useIframeSelection, chat]);

  const showHighlight = Boolean(highlight && (hover || chat));
  const highlightSelected = Boolean(chat);

  return createPortal(
    <>
      {showHighlight && highlight ? (
        <div data-design-select-ui className="design-select-overlay" aria-hidden="true">
          <div
            className={
              highlightSelected
                ? "design-select-highlight design-select-highlight--selected"
                : "design-select-highlight"
            }
            style={{
              top: highlight.top,
              left: highlight.left,
              width: highlight.width,
              height: highlight.height,
            }}
          />
        </div>
      ) : null}

      {chat && highlight ? (
        <ElementChatPopup
          anchorRect={highlight}
          elementLabel={chat.label}
          elementContext={chat.context}
          onClose={clearSelection}
          onSubmitEdit={handleSubmitEdit}
        />
      ) : null}
    </>,
    document.body,
  );
}
