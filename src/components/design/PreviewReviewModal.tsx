"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { usePreview } from "@/components/design/PreviewContext";
import { PreviewFrame } from "@/components/design/PreviewFrame";
import { getContributorName, submitForReview } from "@/lib/agent-client";

export function PreviewReviewModal() {
  const {
    reviewOpen,
    closeReview,
    branch,
    previewUrl,
    runId,
    agentId,
    prUrl,
    setPrUrl,
  } = usePreview();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    if (!runId || !agentId || !branch) {
      setError("Missing preview session details. Try running the agent again.");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const result = await submitForReview({ runId, branch });
      if (result.prUrl) {
        setPrUrl(result.prUrl);
      } else {
        setError("PR not ready yet. Check the agent dashboard or try again shortly.");
      }
    } catch (submitError) {
      const message =
        submitError instanceof Error ? submitError.message : "Submit for review failed.";
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  const contributorName = getContributorName();

  return (
    <Dialog open={reviewOpen} onOpenChange={(open) => !open && closeReview()}>
      <DialogContent showCloseButton className="preview-review-modal">
        <DialogHeader>
          <DialogTitle>Review your design</DialogTitle>
          <DialogDescription>
            Confirm the preview looks right before opening a pull request for review.
          </DialogDescription>
        </DialogHeader>

        <div className="preview-review-modal-body">
          <div className="preview-review-modal-meta">
            {contributorName ? (
              <p>
                <span className="preview-review-modal-label">Contributor</span>
                <br />
                {contributorName}
              </p>
            ) : null}
            {branch ? (
              <p>
                <span className="preview-review-modal-label">Branch</span>
                <br />
                <code>{branch}</code>
              </p>
            ) : null}
            {previewUrl ? (
              <p>
                <span className="preview-review-modal-label">Preview</span>
                <br />
                <a href={previewUrl} target="_blank" rel="noreferrer">
                  Open in new tab
                </a>
              </p>
            ) : null}
          </div>

          {previewUrl ? (
            <PreviewFrame />
          ) : (
            <p className="preview-review-modal-empty">No preview URL available yet.</p>
          )}

          {isSubmitting ? (
            <p className="preview-review-modal-status">Opening pull request…</p>
          ) : null}
          {error ? <p className="preview-review-modal-error">{error}</p> : null}
          {prUrl ? (
            <p className="preview-review-modal-success">
              Pull request opened:{" "}
              <a href={prUrl} target="_blank" rel="noreferrer">
                View on GitHub
              </a>
              . Thanks — the owner will review.
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <button
            type="button"
            className="preview-bar-btn preview-bar-btn--ghost"
            onClick={closeReview}
            disabled={isSubmitting}
          >
            Keep editing
          </button>
          <button
            type="button"
            className="preview-bar-btn preview-bar-btn--primary"
            onClick={handleSubmit}
            disabled={isSubmitting || Boolean(prUrl)}
          >
            {isSubmitting ? "Opening PR…" : "Open PR"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
