"use client";

import { useEffect, useRef, useState } from "react";
import { useDesignChanges } from "@/components/design/DesignChangesProvider";
import { useDesignMode } from "@/components/design/DesignModeContext";
import {
  deployStatusLabel,
  formatChangeAge,
  type DesignChange,
} from "@/lib/design-changes-store";

function statusClassName(status: DesignChange["deployStatus"]): string {
  return `your-changes-status your-changes-status--${status}`;
}

export function YourChangesTab() {
  const { changes, pendingCount, focusChange } = useDesignChanges();
  const { setMode: setDesignMode, isDesignMode } = useDesignMode();
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

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

  if (changes.length === 0) return null;

  function handleChangeClick(change: DesignChange) {
    focusChange(change.runId);
    if (!isDesignMode) {
      setDesignMode("design");
    }
    setOpen(false);
  }

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
        {pendingCount > 0 ? (
          <span className="your-changes-tab-badge" aria-label={`${pendingCount} in progress`}>
            {pendingCount}
          </span>
        ) : null}
      </button>

      <div id="your-changes-panel" className="your-changes-panel" hidden={!open}>
        <div className="your-changes-panel-header">
          <p className="your-changes-panel-title">Your changes</p>
          <p className="your-changes-panel-subtitle">
            Tap a prompt to resume its chat and confirm on the page.
          </p>
        </div>

        <ul className="your-changes-list">
          {changes.map((change) => (
            <li key={change.runId}>
              <button
                type="button"
                className="your-changes-item your-changes-item--clickable"
                onClick={() => handleChangeClick(change)}
              >
                <div className="your-changes-item-main">
                  <p className="your-changes-prompt">&ldquo;{change.prompt}&rdquo;</p>
                  <p className="your-changes-meta">
                    {change.elementLabel} · {formatChangeAge(change.createdAt)}
                  </p>
                </div>
                <div className="your-changes-item-actions">
                  <span className={statusClassName(change.deployStatus)}>
                    {deployStatusLabel(change.deployStatus)}
                  </span>
                  <span className="your-changes-view-btn">
                    {change.deployStatus === "ready" ? "Confirm" : "Open"}
                  </span>
                </div>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
