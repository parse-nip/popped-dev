"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  AgentActivityFeed,
  upsertActivityStep,
  type ActivityStep,
} from "@/components/design/AgentActivityFeed";
import { useDesignChanges } from "@/components/design/DesignChangesProvider";
import { useLiveDraft } from "@/components/design/LiveDraftProvider";
import { streamAgentRun, type AgentStreamEvent } from "@/lib/agent-client";
import type { DesignChange } from "@/lib/design-changes-store";

export function ChangeRunPanel() {
  const {
    focusedChange,
    focusChange,
    updateDeployStatus,
    claimStream,
    releaseStream,
    streamingRunId,
  } = useDesignChanges();
  const { startLiveDraft, showConfirm } = useLiveDraft();
  const [activitySteps, setActivitySteps] = useState<ActivityStep[]>([]);
  const [activityError, setActivityError] = useState<string | null>(null);
  const [assistantSummary, setAssistantSummary] = useState("");
  const streamCleanupRef = useRef<(() => void) | null>(null);
  const assistantBufferRef = useRef("");
  const runFinishedRef = useRef(false);

  const pushActivityStep = useCallback((step: ActivityStep) => {
    setActivitySteps((prev) => upsertActivityStep(prev, step));
  }, []);

  useEffect(() => {
    if (!showConfirm || !focusedChange) return;
    updateDeployStatus(focusedChange.runId, "ready");
  }, [focusedChange, showConfirm, updateDeployStatus]);

  const handleStreamEvent = useCallback(
    (change: DesignChange, event: AgentStreamEvent) => {
      if (event.type === "assistant") {
        assistantBufferRef.current += event.text;
        setAssistantSummary(assistantBufferRef.current);
        pushActivityStep({ id: "connect", label: "Connected to agent", state: "done" });
        updateDeployStatus(change.runId, "working");
        return;
      }

      if (event.type === "step") {
        pushActivityStep(event);
        if (event.id === "start" || event.id === "work" || event.id === "think") {
          updateDeployStatus(change.runId, "working");
        }
        return;
      }

      if (event.type === "activity") {
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
        return;
      }

      if (event.type === "error") {
        if (/no longer available|stream_expired|connection to agent stream lost/i.test(event.message)) {
          pushActivityStep({ id: "reconnect", label: "Checking final result", state: "running" });
          return;
        }
        setActivityError(event.message);
        pushActivityStep({ id: "error", label: "Something went wrong", state: "done" });
        updateDeployStatus(change.runId, "failed");
        releaseStream(change.runId);
        return;
      }

      if (event.type === "done") {
        runFinishedRef.current = true;
        releaseStream(change.runId);
        pushActivityStep({ id: "done", label: "Agent finished", state: "done" });
      }
    },
    [pushActivityStep, releaseStream, updateDeployStatus],
  );

  useEffect(() => {
    if (!focusedChange) return;

    if (focusedChange.deployStatus === "failed") {
      return;
    }

    if (streamingRunId === focusedChange.runId) {
      return;
    }

    if (!claimStream(focusedChange.runId)) {
      return;
    }

    startLiveDraft({
      runId: focusedChange.runId,
      agentId: focusedChange.agentId,
      branch: focusedChange.branch,
    });

    streamCleanupRef.current?.();
    setActivitySteps([]);
    setActivityError(null);
    assistantBufferRef.current = "";
    setAssistantSummary("");
    runFinishedRef.current = false;
    pushActivityStep({ id: "reconnect", label: "Reconnecting to agent", state: "running" });

    streamCleanupRef.current = streamAgentRun(
      focusedChange.runId,
      focusedChange.agentId,
      (event) => handleStreamEvent(focusedChange, event),
    );

    return () => {
      streamCleanupRef.current?.();
      streamCleanupRef.current = null;
      releaseStream(focusedChange.runId);
    };
  }, [
    claimStream,
    focusedChange,
    handleStreamEvent,
    pushActivityStep,
    releaseStream,
    startLiveDraft,
    streamingRunId,
  ]);

  if (!focusedChange) return null;
  if (streamingRunId === focusedChange.runId) return null;

  const isLocked = focusedChange.deployStatus === "working";

  return createPortal(
    <div
      className="change-run-panel"
      data-design-select-ui
      role="dialog"
      aria-label={`Design progress for ${focusedChange.elementLabel}`}
    >
      <div className="change-run-panel-header">
        <div>
          <p className="change-run-panel-label">{focusedChange.elementLabel}</p>
          <p className="change-run-panel-prompt">&ldquo;{focusedChange.prompt}&rdquo;</p>
        </div>
        {!isLocked ? (
          <button
            type="button"
            className="change-run-panel-close"
            aria-label="Close"
            onClick={() => focusChange(null)}
          >
            ×
          </button>
        ) : (
          <span className="change-run-panel-locked">Working…</span>
        )}
      </div>
      {assistantSummary ? (
        <p className="element-chat-popup-line element-chat-popup-line--assistant">{assistantSummary}</p>
      ) : null}
      <AgentActivityFeed steps={activitySteps} error={activityError} />
    </div>,
    document.body,
  );
}
