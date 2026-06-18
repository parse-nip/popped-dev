"use client";

import { useEffect, useRef } from "react";
import { useDesignMode } from "@/components/design/DesignModeContext";
import { useDesignWorkspace } from "@/components/design/DesignWorkspaceProvider";
import { sanitizeAgentThoughtText } from "@shared/agent-thought-display";

export function AgentThoughtStream() {
  const { isDesignMode } = useDesignMode();
  const { agentThought, isAgentThinking } = useDesignWorkspace();
  const bodyRef = useRef<HTMLDivElement>(null);

  const displayText = sanitizeAgentThoughtText(agentThought ?? "");

  useEffect(() => {
    const body = bodyRef.current;
    if (!body) return;
    body.scrollTop = body.scrollHeight;
  }, [displayText]);

  if (!isDesignMode || !isAgentThinking || !displayText) return null;

  return (
    <div className="agent-thought-stream" role="log" aria-live="polite" data-design-select-ui>
      <div className="agent-thought-stream-header">
        <span className="design-status-bar-dot" aria-hidden="true" />
        <span className="agent-thought-stream-label">Agent thinking</span>
      </div>
      <div ref={bodyRef} className="agent-thought-stream-body">
        <p className="agent-thought-stream-text">{displayText}</p>
      </div>
    </div>
  );
}
