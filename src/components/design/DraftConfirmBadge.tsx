"use client";

import { Button } from "@/components/ui/button";
import { useDesignChanges } from "@/components/design/DesignChangesProvider";

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
  const { state, confirmPendingPatch, rejectPendingPatch } = useDesignChanges();
  const pendingPatch = state.pendingPatch;

  if (!pendingPatch) return null;

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
      <p className="draft-confirm-badge-hint">{pendingPatch.summary}</p>
      <div className="draft-confirm-badge-actions">
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="draft-confirm-badge-btn draft-confirm-badge-btn--reject"
          onClick={() => {
            rejectPendingPatch();
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
          onClick={() => {
            confirmPendingPatch();
            onAccepted?.();
          }}
          aria-label="Accept change"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
            <path
              d="M2.5 6.25L5 8.75L9.5 3.75"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </Button>
      </div>
    </div>
  );
}
