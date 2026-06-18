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
            Preview updates instantly in your browser. Publish sends styling files to GitHub, then deploys to popped.dev.
          </p>
        </div>

        <div className="your-changes-publish-guide">
          <p className="your-changes-publish-guide-title">What Publish to GitHub does</p>
          <ol className="your-changes-publish-guide-list">
            <li>Commits your styling changes to the repo (not locked resume facts).</li>
            <li>Cloudflare rebuilds popped.dev — the button shows Deploying… for a minute or two.</li>
            <li>When done, it becomes View on GitHub so you can open the commit.</li>
          </ol>
        </div>

        {changes.length > 0 ? (
          <pre className="your-changes-diff">{summarizeDiff(changes)}</pre>
        ) : null}

        {editEvents[0]?.summary ? (
          <p className="your-changes-latest">{editEvents[0].summary}</p>
        ) : null}

        {publishError ? (
          <p className="your-changes-error" role="alert">
            {publishError}
            {publishError.includes("changed since you started") ||
            publishError.includes("Turn Design mode off") ? (
              <span> Turn Design mode off and on, then try Publish again.</span>
            ) : null}
          </p>
        ) : null}

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
