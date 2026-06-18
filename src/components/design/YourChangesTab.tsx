"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useDesignChanges } from "@/components/design/DesignChangesProvider";
import { useDesignMode } from "@/components/design/DesignModeContext";
import { fetchDesignBaseSha, publishDesignPatches } from "@/lib/agent-client";

export function YourChangesTab() {
  const {
    state,
    pendingCount,
    acceptedCount,
    removeAcceptedPatch,
    setPublishStatus,
    finishPublish,
  } = useDesignChanges();
  const { setMode: setDesignMode, isDesignMode } = useDesignMode();
  const [open, setOpen] = useState(false);
  const [baseSha, setBaseSha] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const isDeploying = state.publishStatus === "deploying";
  const isDeployed = state.publishStatus === "deployed";

  const hasChanges =
    state.pendingPatch !== null ||
    state.acceptedPatches.length > 0 ||
    state.deployHoldPatches.length > 0 ||
    isDeploying ||
    isDeployed ||
    state.publishStatus === "published";

  useEffect(() => {
    if (!open) return;
    void fetchDesignBaseSha()
      .then(setBaseSha)
      .catch(() => setBaseSha(null));
  }, [open]);

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

  if (!hasChanges) return null;

  async function handlePublish() {
    if (state.acceptedPatches.length === 0) return;

    setPublishStatus("publishing");

    try {
      const sha = baseSha ?? (await fetchDesignBaseSha());
      const patches = [...state.acceptedPatches];
      const result = await publishDesignPatches({
        acceptedPatches: patches,
        baseSha: sha,
      });
      finishPublish(result.commitUrl, result.commitSha, patches);
      setOpen(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Publish failed.";
      setPublishStatus("failed", null, message);
    }
  }

  const holdCount = state.deployHoldPatches.length;

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
        {pendingCount + acceptedCount > 0 ? (
          <span
            className="your-changes-tab-badge"
            aria-label={`${pendingCount + acceptedCount} patches`}
          >
            {pendingCount + acceptedCount}
          </span>
        ) : null}
      </button>

      <div id="your-changes-panel" className="your-changes-panel" hidden={!open}>
        <div className="your-changes-panel-header">
          <p className="your-changes-panel-title">Your changes</p>
          <p className="your-changes-panel-subtitle">
            Accepted patches preview locally. Publish sends them to GitHub once.
          </p>
        </div>

        {state.pendingPatch ? (
          <p className="your-changes-pending-hint">
            Pending: {state.pendingPatch.summary} — confirm on the page.
          </p>
        ) : null}

        <ul className="your-changes-list">
          {state.acceptedPatches.map((patch) => (
            <li key={patch.id}>
              <div className="your-changes-item">
                <div className="your-changes-item-main">
                  <p className="your-changes-prompt">{patch.summary}</p>
                  <p className="your-changes-meta">{patch.target.designId}</p>
                </div>
                <button
                  type="button"
                  className="your-changes-remove-btn"
                  onClick={() => removeAcceptedPatch(patch.id)}
                  aria-label={`Remove ${patch.summary}`}
                >
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>

        {state.publishError ? (
          <p className="your-changes-publish-error">{state.publishError}</p>
        ) : null}

        {isDeploying && state.publishUrl ? (
          <p className="your-changes-publish-success">
            Published —{" "}
            <a href={state.publishUrl} target="_blank" rel="noreferrer">
              view on GitHub
            </a>
            . Waiting for popped.dev to go live
            {holdCount > 0 ? ` (keeping ${holdCount} patch${holdCount === 1 ? "" : "es"} visible)` : ""}…
          </p>
        ) : null}

        {isDeployed && state.publishUrl ? (
          <p className="your-changes-publish-success">
            Live on popped.dev —{" "}
            <a href={state.publishUrl} target="_blank" rel="noreferrer">
              view commit
            </a>
          </p>
        ) : null}

        <div className="your-changes-panel-footer">
          <Button
            type="button"
            size="sm"
            disabled={
              state.acceptedPatches.length === 0 ||
              state.publishStatus === "publishing" ||
              isDeploying ||
              isDeployed
            }
            onClick={() => {
              void handlePublish();
            }}
          >
            {state.publishStatus === "publishing"
              ? "Publishing…"
              : isDeploying
                ? "Deploying…"
                : `Publish ${state.acceptedPatches.length} patch${state.acceptedPatches.length === 1 ? "" : "es"}`}
          </Button>
          {!isDesignMode ? (
            <button
              type="button"
              className="your-changes-enter-design"
              onClick={() => setDesignMode("design")}
            >
              Enter design mode
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
