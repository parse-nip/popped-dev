"use client";

import { STATUS_LABELS, type DesignWorkspaceStatus, type EditEvent, type FileChange } from "./types";
import { summarizeDiff } from "./diff";

type DesignStatusPanelProps = {
  status: DesignWorkspaceStatus;
  error: string | null;
  previewUrl: string | null;
  changes: FileChange[];
  editEvents: EditEvent[];
  devLog: string;
  onPublish: () => void;
  publishDisabled: boolean;
  commitUrl: string | null;
};

export function DesignStatusPanel({
  status,
  error,
  previewUrl,
  changes,
  editEvents,
  devLog,
  onPublish,
  publishDisabled,
  commitUrl,
}: DesignStatusPanelProps) {
  const statusClass =
    status === "build_error"
      ? "design-status-pill design-status-pill--error"
      : status === "ready" || status === "ready_to_publish" || status === "published"
        ? "design-status-pill design-status-pill--ready"
        : "design-status-pill";

  return (
    <aside className="design-workspace-panel">
      <div className="design-workspace-panel-header">
        <h2 className="design-workspace-panel-title">Design workspace</h2>
        <p className="design-workspace-panel-copy">
          Live preview runs in WebContainer. Publish commits once to GitHub.
        </p>
      </div>

      <div className={statusClass}>{STATUS_LABELS[status]}</div>

      {error ? <div className="design-workspace-error">{error}</div> : null}

      {previewUrl ? (
        <div className="design-workspace-meta">
          <span className="design-workspace-meta-label">Preview</span>
          <a href={previewUrl} target="_blank" rel="noreferrer" className="design-workspace-link">
            Open dev server
          </a>
        </div>
      ) : null}

      {commitUrl ? (
        <div className="design-workspace-meta">
          <span className="design-workspace-meta-label">Commit</span>
          <a href={commitUrl} target="_blank" rel="noreferrer" className="design-workspace-link">
            View on GitHub
          </a>
        </div>
      ) : null}

      <section className="design-workspace-section">
        <h3 className="design-workspace-section-title">Changes</h3>
        {changes.length === 0 ? (
          <p className="design-workspace-muted">No file changes yet.</p>
        ) : (
          <pre className="design-workspace-diff">{summarizeDiff(changes)}</pre>
        )}
      </section>

      {editEvents.length > 0 ? (
        <section className="design-workspace-section">
          <h3 className="design-workspace-section-title">Edit history</h3>
          <ul className="design-workspace-events">
            {editEvents.map((event) => (
              <li key={event.id} className="design-workspace-event">
                <strong>{event.summary ?? event.prompt}</strong>
                <span>{event.filesChanged.join(", ") || "no files"}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <button
        type="button"
        className="design-workspace-publish"
        onClick={onPublish}
        disabled={publishDisabled}
      >
        Publish to GitHub
      </button>

      {devLog ? (
        <section className="design-workspace-section">
          <h3 className="design-workspace-section-title">Dev output</h3>
          <pre className="design-workspace-log">{devLog.slice(-4000)}</pre>
        </section>
      ) : null}
    </aside>
  );
}
