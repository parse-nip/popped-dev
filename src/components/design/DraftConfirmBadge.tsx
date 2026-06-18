"use client";

import { Button } from "@/components/ui/button";
import { useLiveDraft } from "@/components/design/LiveDraftProvider";

type DraftConfirmBadgeProps = {
  anchorRect: { top: number; left: number; width: number; height: number };
  onRejected?: () => void;
  onAccepted?: () => void;
};

export function DraftConfirmBadge({
  anchorRect,
  onRejected,
  onAccepted,
}: DraftConfirmBadgeProps) {
  const {
    showConfirm,
    hasTsxChanges,
    isAccepting,
    mergeUrl,
    error,
    acceptLiveDraft,
    rejectLiveDraft,
  } = useLiveDraft();

  if (mergeUrl) {
    return (
      <div
        data-design-select-ui
        className="draft-confirm-badge draft-confirm-badge--success"
        style={{
          top: anchorRect.top + anchorRect.height + 8,
          left: anchorRect.left + anchorRect.width / 2,
        }}
        role="status"
      >
        <span className="draft-confirm-badge-message">
          Merged —{" "}
          <a href={mergeUrl} target="_blank" rel="noreferrer">
            view on GitHub
          </a>
        </span>
      </div>
    );
  }

  if (!showConfirm) return null;

  return (
    <div
      data-design-select-ui
      className="draft-confirm-badge"
      style={{
        top: anchorRect.top + anchorRect.height + 8,
        left: anchorRect.left + anchorRect.width / 2,
      }}
      role="group"
      aria-label="Confirm design change"
    >
      {hasTsxChanges ? (
        <p className="draft-confirm-badge-hint">
          Layout files changed too — publish to see everything live.
        </p>
      ) : null}
      {error ? <p className="draft-confirm-badge-error">{error}</p> : null}
      <div className="draft-confirm-badge-actions">
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="draft-confirm-badge-btn draft-confirm-badge-btn--reject"
          disabled={isAccepting}
          onClick={() => {
            rejectLiveDraft();
            onRejected?.();
          }}
          aria-label="Reject change"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
            <path
              d="M3 3L9 9M9 3L3 9"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </Button>
        <Button
          type="button"
          size="sm"
          className="draft-confirm-badge-btn draft-confirm-badge-btn--accept"
          disabled={isAccepting}
          onClick={() => {
            void acceptLiveDraft().then((accepted) => {
              if (accepted) onAccepted?.();
            });
          }}
          aria-label="Accept and publish change"
        >
          {isAccepting ? (
            "Publishing…"
          ) : (
            <>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                <path
                  d="M2.5 6.25L5 8.75L9.5 3.75"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              Publish
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
