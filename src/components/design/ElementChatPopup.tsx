"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  sendAgentMessage,
  streamAgentRun,
  type AgentStreamEvent,
} from "@/lib/agent-client";
import type { ElementContext } from "@/lib/element-context";

type Message = {
  id: string;
  role: "user" | "assistant" | "status";
  content: string;
};

type ElementChatPopupProps = {
  anchorRect: { top: number; left: number; width: number; height: number };
  elementLabel: string;
  elementContext: ElementContext;
  onClose: () => void;
  onPreviewReady: (params: {
    previewUrl: string;
    branch: string;
    runId: string;
    agentId: string;
  }) => void;
};

const POPUP_MIN_WIDTH = 360;
const POPUP_MAX_WIDTH = 480;
const POPUP_ESTIMATED_HEIGHT = 96;
const VIEWPORT_PADDING = 12;
const ANCHOR_OVERLAP = 14;

type SpeechRecognitionResultList = {
  length: number;
  [index: number]: {
    0?: { transcript?: string };
  };
};

type SpeechRecognitionResultEvent = {
  resultIndex: number;
  results: SpeechRecognitionResultList;
};

type SpeechRecognitionErrorEvent = Event & {
  error?: string;
};

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onstart: (() => void) | null;
  onresult: ((event: SpeechRecognitionResultEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
};

function getSpeechRecognitionCtor(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === "undefined") return null;

  const scope = window as Window & {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };

  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition ?? null;
}

function getPopupLayout(anchorRect: ElementChatPopupProps["anchorRect"]) {
  if (typeof window === "undefined") {
    return { left: anchorRect.left, top: anchorRect.top + anchorRect.height - ANCHOR_OVERLAP, width: POPUP_MIN_WIDTH };
  }

  const width = Math.min(
    POPUP_MAX_WIDTH,
    Math.max(POPUP_MIN_WIDTH, anchorRect.width),
    window.innerWidth - VIEWPORT_PADDING * 2,
  );

  let left = anchorRect.left;
  let top = anchorRect.top + anchorRect.height - ANCHOR_OVERLAP;

  const maxLeft = window.innerWidth - width - VIEWPORT_PADDING;
  left = Math.max(VIEWPORT_PADDING, Math.min(left, maxLeft));

  const maxTop = window.innerHeight - POPUP_ESTIMATED_HEIGHT - VIEWPORT_PADDING;
  top = Math.max(VIEWPORT_PADDING, Math.min(top, maxTop));

  return { left, top, width };
}

function buildTranscript(event: SpeechRecognitionResultEvent) {
  let transcript = "";
  for (let index = 0; index < event.results.length; index += 1) {
    transcript += event.results[index]?.[0]?.transcript ?? "";
  }
  return transcript.trim();
}

function ComponentTagIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path
        d="M7 1.75L11.25 4.375V9.625L7 12.25L2.75 9.625V4.375L7 1.75Z"
        stroke="currentColor"
        strokeWidth="1.15"
        strokeLinejoin="round"
      />
      <path d="M7 5.25V8.75" stroke="currentColor" strokeWidth="1.15" strokeLinecap="round" />
    </svg>
  );
}

export function ElementChatPopup({
  anchorRect,
  elementLabel,
  elementContext,
  onClose,
  onPreviewReady,
}: ElementChatPopupProps) {
  const popupRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const shouldListenRef = useRef(false);
  const dictationBaseRef = useRef("");
  const streamCleanupRef = useRef<(() => void) | null>(null);
  const assistantBufferRef = useRef("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const dictationSupported =
    typeof window !== "undefined" &&
    getSpeechRecognitionCtor() !== null &&
    typeof navigator.mediaDevices?.getUserMedia === "function";
  const [dictationError, setDictationError] = useState<string | null>(null);
  const layout = getPopupLayout(anchorRect);
  const hasThread = messages.length > 0 || isThinking;

  const appendMessage = useCallback((role: Message["role"], content: string) => {
    setMessages((prev) => [...prev, { id: crypto.randomUUID(), role, content }]);
  }, []);

  const updateAssistantMessage = useCallback((content: string) => {
    setMessages((prev) => {
      const last = prev[prev.length - 1];
      if (last?.role === "assistant") {
        return [...prev.slice(0, -1), { ...last, content }];
      }
      return [...prev, { id: crypto.randomUUID(), role: "assistant", content }];
    });
  }, []);

  const handleStreamEvent = useCallback(
    (event: AgentStreamEvent, runId: string, agentId: string) => {
      if (event.type === "assistant") {
        assistantBufferRef.current += event.text;
        updateAssistantMessage(assistantBufferRef.current);
        return;
      }

      if (event.type === "status") {
        appendMessage("status", event.message);
        return;
      }

      if (event.type === "preview") {
        appendMessage("status", "Preview ready — loading draft…");
        onPreviewReady({
          previewUrl: event.previewUrl,
          branch: event.branch,
          runId,
          agentId,
        });
        return;
      }

      if (event.type === "error") {
        appendMessage("status", event.message);
        setIsThinking(false);
        return;
      }

      if (event.type === "done") {
        setIsThinking(false);
      }
    },
    [appendMessage, onPreviewReady, updateAssistantMessage],
  );

  const stopDictation = useCallback(() => {
    shouldListenRef.current = false;
    const active = recognitionRef.current;
    recognitionRef.current = null;
    active?.stop();
    setIsListening(false);
  }, []);

  const startRecognition = useCallback(() => {
    const SpeechRecognition = getSpeechRecognitionCtor();
    if (!SpeechRecognition) return;

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = navigator.language || "en-US";

    recognition.onstart = () => {
      setIsListening(true);
      setDictationError(null);
    };

    recognition.onresult = (event) => {
      const transcript = buildTranscript(event);
      if (!transcript) return;

      const prefix = dictationBaseRef.current;
      const next = prefix ? `${prefix} ${transcript}` : transcript;
      setInput(next.trim());
    };

    recognition.onerror = (event) => {
      const code = event.error ?? "unknown";

      if (code === "no-speech" || code === "aborted") {
        return;
      }

      shouldListenRef.current = false;
      recognitionRef.current = null;
      setIsListening(false);

      if (code === "not-allowed" || code === "service-not-allowed") {
        setDictationError("Microphone access denied");
        return;
      }

      setDictationError("Dictation unavailable");
    };

    recognition.onend = () => {
      if (!shouldListenRef.current) {
        recognitionRef.current = null;
        setIsListening(false);
        return;
      }

      try {
        recognition.start();
      } catch {
        shouldListenRef.current = false;
        recognitionRef.current = null;
        setIsListening(false);
      }
    };

    recognitionRef.current = recognition;

    try {
      recognition.start();
    } catch {
      shouldListenRef.current = false;
      recognitionRef.current = null;
      setIsListening(false);
      setDictationError("Could not start dictation");
    }
  }, []);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        stopDictation();
        onClose();
      }
    }

    function handlePointerDown(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Node) || popupRef.current?.contains(target)) {
        return;
      }
      stopDictation();
      onClose();
    }

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("pointerdown", handlePointerDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [onClose, stopDictation]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    return () => {
      shouldListenRef.current = false;
      recognitionRef.current?.abort();
      recognitionRef.current = null;
      streamCleanupRef.current?.();
      streamCleanupRef.current = null;
    };
  }, []);

  async function handleSend() {
    const trimmed = input.trim();
    if (!trimmed || isThinking) return;

    stopDictation();
    streamCleanupRef.current?.();
    assistantBufferRef.current = "";

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: trimmed,
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsThinking(true);

    try {
      const { runId, agentId } = await sendAgentMessage({
        message: trimmed,
        elementContext,
      });

      streamCleanupRef.current = streamAgentRun(runId, agentId, (event) => {
        handleStreamEvent(event, runId, agentId);
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Agent request failed.";
      appendMessage("status", message);
      setIsThinking(false);
    }
  }

  async function toggleDictation(event: React.MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();

    if (isListening) {
      stopDictation();
      return;
    }

    if (!dictationSupported) {
      setDictationError("Dictation is not supported in this browser");
      return;
    }

    setDictationError(null);
    dictationBaseRef.current = input.trim();

    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setDictationError("Microphone access denied");
      return;
    }

    shouldListenRef.current = true;
    startRecognition();
  }

  return (
    <div
      ref={popupRef}
      data-design-select-ui
      className="element-chat-popup"
      style={{ left: layout.left, top: layout.top, width: layout.width }}
      role="dialog"
      aria-label={`Design chat for ${elementLabel}`}
    >
      <div className="element-chat-popup-body">
        <div className="element-chat-popup-tag">
          <ComponentTagIcon />
          <span className="element-chat-popup-tag-label">{elementLabel}</span>
        </div>
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              handleSend();
            }
          }}
          placeholder=""
          disabled={isThinking}
          aria-label="Message to design agent"
          className="element-chat-popup-input"
        />
        <button
          type="button"
          onClick={handleSend}
          disabled={!input.trim() || isThinking}
          className="element-chat-popup-send"
          aria-label="Send message"
        >
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
            <path
              d="M6.5 10.5V2.5M6.5 2.5L3.5 5.5M6.5 2.5L9.5 5.5"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>

      <div className="element-chat-popup-toolbar">
        <button
          type="button"
          className="element-chat-popup-icon-btn element-chat-popup-icon-btn--muted"
          aria-label="Close"
          onClick={() => {
            stopDictation();
            onClose();
          }}
        >
          <svg width="11" height="11" viewBox="0 0 11 11" fill="none" aria-hidden="true">
            <path
              d="M2.75 2.75L8.25 8.25M8.25 2.75L2.75 8.25"
              stroke="currentColor"
              strokeWidth="1.25"
              strokeLinecap="round"
            />
          </svg>
        </button>

        <span className="element-chat-popup-model">Composer 2.5 Fast</span>

        <button
          type="button"
          className={`element-chat-popup-icon-btn element-chat-popup-icon-btn--muted${isListening ? " element-chat-popup-icon-btn--listening" : ""}${dictationError ? " element-chat-popup-icon-btn--error" : ""}`}
          aria-label={isListening ? "Stop dictation" : "Start dictation"}
          aria-pressed={isListening}
          disabled={!dictationSupported || isThinking}
          title={
            dictationError ??
            (dictationSupported
              ? isListening
                ? "Stop dictation"
                : "Start dictation"
              : "Dictation is not supported in this browser")
          }
          onClick={toggleDictation}
        >
          <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true">
            <rect x="5.25" y="1.5" width="4.5" height="7.5" rx="2.25" stroke="currentColor" strokeWidth="1.15" />
            <path
              d="M3 7.75C3 9.85 4.9 11.75 7.5 11.75C10.1 11.75 12 9.85 12 7.75M7.5 11.75V13.25"
              stroke="currentColor"
              strokeWidth="1.15"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>

      {hasThread ? (
        <div className="element-chat-popup-thread">
          {messages.map((message) => (
            <p
              key={message.id}
              className={
                message.role === "user"
                  ? "element-chat-popup-line element-chat-popup-line--user"
                  : message.role === "status"
                    ? "element-chat-popup-line element-chat-popup-line--status"
                    : "element-chat-popup-line element-chat-popup-line--assistant"
              }
            >
              {message.content}
            </p>
          ))}
          {isThinking ? <p className="element-chat-popup-line element-chat-popup-line--status">…</p> : null}
        </div>
      ) : null}
    </div>
  );
}
