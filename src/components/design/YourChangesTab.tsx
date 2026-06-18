"use client";

import { useEffect, useRef, useState } from "react";
import { useDesignMode } from "@/components/design/DesignModeContext";
import { useDesignWorkspace } from "@/components/design/DesignWorkspaceProvider";
import { summarizeDiff } from "@/design/diff";

export function YourChangesTab() {
  const { isDesignMode } = useDesignMode();
  const {
    changes,
    editEvents,
    publishStatus,
    publishError,
    commitUrl,
  } = useDesignWorkspace();
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const isDeploying = publishStatus === "deploying";
  const isPublished = publishStatus === "published";
  const hasChanges = changes.length > 0 || isDeploying || isPublished || Boolean(commitUrl);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Node) || panelRef.current?.contains(target)) {
        return;
      }
      setOpen(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  if (!isDesignMode || !hasChanges) return null;

  return (
    <div
      ref={panelRef}
      className={`your-changes${open ? " your-changes--open" : ""}`}
      data-design-select-ui
    >
      <button
        type="button"
        className="your-changes-tab"
        aria-expanded={open}
        aria-controls="your-changes-panel"
        onClick={() => setOpen((value) => !value)}
      >
        <span className="your-changes-tab-label">Your changes</span>
        {changes.length > 0 ? (
          <span className="your-changes-tab-badge" aria-label={`${changes.length} files changed`}>
            {changes.length}
          </span>
        ) : null}
      </button>

      <div id="your-changes-panel" className="your-changes-panel" hidden={!open}>
        <div className="your-changes-panel-header">
          <p className="your-changes-panel-title">Your changes</p>
          <p className="your-changes-panel-subtitle">
            Edits apply live in WebContainer. Publish commits once to GitHub.
          </p>
        </div>

        {changes.length > 0 ? (
          <pre className="your-changes-diff">{summarizeDiff(changes)}</pre>
        ) : null}

        {editEvents[0]?.summary ? (
          <p className="your-changes-latest">{editEvents[0].summary}</p>
        ) : null}

        {publishError ? <p className="your-changes-error">{publishError}</p> : null}

        {commitUrl ? (
          <p className="your-changes-success">
            <a href={commitUrl} target="_blank" rel="noreferrer">
              View commit on GitHub
            </a>
          </p>
        ) : null}

        {isDeploying ? (
          <p className="your-changes-status">Deploying to popped.dev…</p>
        ) : null}
      </div>
    </div>
  );
}
