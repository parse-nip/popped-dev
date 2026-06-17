"use client";

import { usePreview } from "@/components/design/PreviewContext";

export function PreviewBar() {
  const { branch, backToLive, openReview } = usePreview();

  return (
    <div className="preview-bar" role="status" aria-live="polite">
      <div className="preview-bar-inner">
        <p className="preview-bar-label">
          <span className="preview-bar-badge">Preview — not live yet</span>
          {branch ? (
            <span className="preview-bar-branch">
              Viewing draft · branch <code>{branch}</code>
            </span>
          ) : (
            <span className="preview-bar-branch">Viewing draft</span>
          )}
        </p>
        <div className="preview-bar-actions">
          <button type="button" className="preview-bar-btn preview-bar-btn--ghost" onClick={backToLive}>
            Back to live
          </button>
          <button type="button" className="preview-bar-btn preview-bar-btn--primary" onClick={openReview}>
            Submit for review
          </button>
        </div>
      </div>
    </div>
  );
}
