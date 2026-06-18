"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  AgentActivityFeed,
  upsertActivityStep,
  type ActivityStep,
} from "@/components/design/AgentActivityFeed";
import { ContributorNameControl } from "@/components/community/ContributorNameControl";
import {
  branchToPreviewUrl,
  sendAgentMessage,
  streamAgentRun,
  type AgentStreamEvent,
} from "@/lib/agent-client";
import { readContributorName, subscribeContributorName } from "@/lib/contributor-name";
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
  onSelectionLockChange?: (locked: boolean) => void;
  onPreviewReady: (params: {
    previewUrl: string;
    branch: string;
    runId: string;
    agentId: string;
    ready?: boolean;
    sha?: string | null;
  }) => void;
};

const POPUP_MIN_WIDTH = 360;
const POPUP_MAX_WIDTH = 480;
const POPUP_FALLBACK_HEIGHT = 132;
const VIEWPORT_PADDING = 12;
const ANCHOR_OVERLAP = 14;

type PopupPhase = "input" | "running" | "complete";

type RunMeta = {
  runId: string;
  agentId: string;
  branch: string;
};

type PopupLayout = { left: number; top: number; width: number };

function computePopupWidth(anchorRect: ElementChatPopupProps["anchorRect"]): number {
  if (typeof window === "undefined") {
    return POPUP_MIN_WIDTH;
  }

  return Math.min(
    POPUP_MAX_WIDTH,
    Math.max(POPUP_MIN_WIDTH, anchorRect.width),
    window.innerWidth - VIEWPORT_PADDING * 2,
  );
}

function computePopupLayout(
  anchorRect: ElementChatPopupProps["anchorRect"],
  popupHeight: number,
): PopupLayout {
  if (typeof window === "undefined") {
    return {
      left: anchorRect.left,
      top: anchorRect.top + anchorRect.height - ANCHOR_OVERLAP,
      width: POPUP_MIN_WIDTH,
    };
  }

  const width = computePopupWidth(anchorRect);
  const height = Math.min(
    popupHeight,
    window.innerHeight - VIEWPORT_PADDING * 2,
  );

  let left = anchorRect.left;
  const maxLeft = window.innerWidth - width - VIEWPORT_PADDING;
  left = Math.max(VIEWPORT_PADDING, Math.min(left, maxLeft));

  const belowTop = anchorRect.top + anchorRect.height - ANCHOR_OVERLAP;
  const aboveTop = anchorRect.top - height + ANCHOR_OVERLAP;
  const spaceBelow = window.innerHeight - VIEWPORT_PADDING - belowTop;
  const spaceAbove = anchorRect.top - VIEWPORT_PADDING;

  let top: number;
  if (height <= spaceBelow || spaceBelow >= spaceAbove) {
    top = belowTop;
  } else {
    top = aboveTop;
  }

  const maxTop = window.innerHeight - VIEWPORT_PADDING - height;
  top = Math.max(VIEWPORT_PADDING, Math.min(top, maxTop));

  return { left, top, width };
}

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
  return computePopupLayout(anchorRect, POPUP_FALLBACK_HEIGHT);
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
  onSelectionLockChange,
  onPreviewReady,
}: ElementChatPopupProps) {
  const popupRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const shouldListenRef = useRef(false);
  const dictationBaseRef = useRef("");
  const streamCleanupRef = useRef<(() => void) | null>(null);
  const assistantBufferRef = useRef("");
  const runMetaRef = useRef<RunMeta | null>(null);
  const previewOpenedRef = useRef(false);
  const pendingPreviewRef = useRef<{
    previewUrl: string;
    branch: string;
    sha?: string | null;
    ready?: boolean;
  } | null>(null);
  const [activitySteps, setActivitySteps] = useState<ActivityStep[]>([]);
  const [activityError, setActivityError] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [submittedPrompt, setSubmittedPrompt] = useState("");
  const [phase, setPhase] = useState<PopupPhase>("input");
  const [isThinking, setIsThinking] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const dictationSupported =
    typeof window !== "undefined" &&
    getSpeechRecognitionCtor() !== null &&
    typeof navigator.mediaDevices?.getUserMedia === "function";
  const [dictationError, setDictationError] = useState<string | null>(null);
  const [layout, setLayout] = useState<PopupLayout>(() => getPopupLayout(anchorRect));
  const [contributorName, setContributorName] = useState(readContributorName);
  const hasThread =
    phase === "running" ||
    (phase === "complete" && (messages.length > 0 || activitySteps.length > 0));
  const assistantSummary = messages.findLast((message) => message.role === "assistant")?.content;
  const needsName = contributorName.trim().length < 2;
  const isLocked = phase === "running" || phase === "complete";

  useEffect(() => subscribeContributorName(setContributorName), []);

  useEffect(() => {
    onSelectionLockChange?.(isLocked);
    return () => onSelectionLockChange?.(false);
  }, [isLocked, onSelectionLockChange]);

  const syncPopupLayout = useCallback(() => {
    const height = popupRef.current?.offsetHeight ?? POPUP_FALLBACK_HEIGHT;
    setLayout(computePopupLayout(anchorRect, height));
  }, [anchorRect]);

  useLayoutEffect(() => {
    syncPopupLayout();
  }, [syncPopupLayout, messages, isThinking, hasThread]);

  useEffect(() => {
    const schedule = () => syncPopupLayout();
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, true);
    return () => {
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule, true);
    };
  }, [syncPopupLayout]);

  const pushActivityStep = useCallback((step: ActivityStep) => {
    setActivitySteps((prev) => upsertActivityStep(prev, step));
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

  const openPreview = useCallback(
    (previewUrl?: string, options?: { ready?: boolean; sha?: string | null }) => {
      const meta = runMetaRef.current;
      if (!meta) return;

      const pending = pendingPreviewRef.current;
      const resolvedUrl = previewUrl ?? pending?.previewUrl ?? branchToPreviewUrl(meta.branch);
      const ready = options?.ready ?? pending?.ready ?? false;

      if (previewOpenedRef.current && !ready) return;
      if (previewOpenedRef.current && ready) {
        onPreviewReady({
          previewUrl: resolvedUrl,
          branch: meta.branch,
          runId: meta.runId,
          agentId: meta.agentId,
          ready: true,
          sha: options?.sha ?? pending?.sha ?? null,
        });
        return;
      }

      previewOpenedRef.current = true;
      onPreviewReady({
        previewUrl: resolvedUrl,
        branch: meta.branch,
        runId: meta.runId,
        agentId: meta.agentId,
        ready,
        sha: options?.sha ?? pending?.sha ?? null,
      });
    },
    [onPreviewReady],
  );

  const finishRun = useCallback(() => {
    setIsThinking(false);
    if (pendingPreviewRef.current?.ready === true) {
      setPhase("complete");
      pushActivityStep({ id: "deploy", label: "Preview ready", state: "done" });
    }
    const pending = pendingPreviewRef.current;
    if (pending) {
      openPreview(pending.previewUrl, { ready: pending.ready, sha: pending.sha });
    } else {
      openPreview();
    }
  }, [openPreview, pushActivityStep]);

  const handleStreamEvent = useCallback(
    (event: AgentStreamEvent) => {
      if (event.type === "assistant") {
        assistantBufferRef.current += event.text;
        updateAssistantMessage(assistantBufferRef.current);
        pushActivityStep({ id: "connect", label: "Connected to agent", state: "done" });
        return;
      }

      if (event.type === "step") {
        pushActivityStep(event);
        return;
      }

      if (event.type === "status") {
        pushActivityStep({
          id: `status-${event.message.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 24)}`,
          label: event.message.replace(/…$/, ""),
          state: "running",
        });
        return;
      }

      if (event.type === "preview") {
        pendingPreviewRef.current = {
          previewUrl: event.previewUrl,
          branch: event.branch,
          sha: event.sha ?? null,
          ready: event.ready,
        };
        openPreview(event.previewUrl, { ready: event.ready, sha: event.sha ?? null });
        if (event.ready === true) {
          setPhase("complete");
          setIsThinking(false);
          pushActivityStep({ id: "deploy", label: "Preview ready", state: "done" });
        } else {
          pushActivityStep({ id: "deploy", label: "Building preview", state: "running" });
        }
        return;
      }

      if (event.type === "error") {
        if (/no longer available|stream_expired|connection to agent stream lost/i.test(event.message)) {
          pushActivityStep({ id: "reconnect", label: "Checking final result", state: "running" });
          return;
        }
        if (/agent_busy|still working/i.test(event.message)) {
          pushActivityStep({ id: "busy", label: "Agent finishing previous step", state: "running" });
          return;
        }
        setActivityError(event.message);
        pushActivityStep({ id: "error", label: "Something went wrong", state: "done" });
        setPhase("complete");
        setIsThinking(false);
        return;
      }

      if (event.type === "done") {
        finishRun();
      }
    },
    [finishRun, openPreview, pushActivityStep, updateAssistantMessage],
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
      if (event.key !== "Escape" || isLocked) return;
      stopDictation();
      onClose();
    }

    function handlePointerDown(event: PointerEvent) {
      if (isLocked) return;
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
  }, [isLocked, onClose, stopDictation]);

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
    setActivitySteps([]);
    setActivityError(null);
    assistantBufferRef.current = "";

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: trimmed,
    };

    setMessages((prev) => [...prev, userMessage]);
    setSubmittedPrompt(trimmed);
    setInput("");
    setPhase("running");
    setIsThinking(true);
    pushActivityStep({ id: "send", label: "Sending to agent", state: "running" });

    try {
      const { runId, agentId, branch, attachedToActiveRun } = await sendAgentMessage({
        message: trimmed,
        elementContext,
      });

      pushActivityStep({ id: "send", label: "Sent to agent", state: "done" });
      if (attachedToActiveRun) {
        pushActivityStep({ id: "reconnect", label: "Reconnecting to in-progress run", state: "running" });
      } else {
        pushActivityStep({ id: "start", label: "Starting agent", state: "running" });
      }

      runMetaRef.current = { runId, agentId, branch };
      pendingPreviewRef.current = null;
      previewOpenedRef.current = false;

      streamCleanupRef.current = streamAgentRun(runId, agentId, handleStreamEvent);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Agent request failed.";
      setActivityError(message);
      pushActivityStep({ id: "error", label: "Request failed", state: "done" });
      setPhase("complete");
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
      {needsName ? (
        <ContributorNameControl variant="prompt" id="contributor-name-chat" />
      ) : (
        <>
      <div className="element-chat-popup-body">
        <div className="element-chat-popup-tag">
          <ComponentTagIcon />
          <span className="element-chat-popup-tag-label">{elementLabel}</span>
        </div>
        {phase === "input" ? (
          <>
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
              placeholder="Describe your design change…"
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
          </>
        ) : (
          <p className="element-chat-popup-prompt-readonly">{submittedPrompt}</p>
        )}
      </div>

      <div className="element-chat-popup-toolbar">
        {!isLocked ? (
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
        ) : (
          <span className="element-chat-popup-locked-hint" aria-live="polite">
            {phase === "complete" ? "Done" : "Working…"}
          </span>
        )}

        <span className="element-chat-popup-model">Composer 2.5 Fast</span>

        {phase === "input" ? (
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
        ) : phase === "complete" ? (
          <button
            type="button"
            className="element-chat-popup-view-preview"
            onClick={() => openPreview()}
          >
            View preview
          </button>
        ) : (
          <span className="element-chat-popup-toolbar-spacer" aria-hidden="true" />
        )}
      </div>

      {hasThread ? (
        <div className="element-chat-popup-thread">
          {assistantSummary ? (
            <p className="element-chat-popup-line element-chat-popup-line--assistant">
              {assistantSummary}
            </p>
          ) : null}
          <AgentActivityFeed steps={activitySteps} error={activityError} />
        </div>
      ) : null}
        </>
      )}
    </div>
  );
}
