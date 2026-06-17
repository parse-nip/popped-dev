"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
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
        <DialogHeader className="preview-review-modal-header">
          <DialogTitle>Submit your design</DialogTitle>
          <DialogDescription>
            Check the draft below, then open a pull request so the site owner can review and merge.
          </DialogDescription>
        </DialogHeader>

        <div className="preview-review-modal-body">
          <div className="preview-review-modal-meta">
            {contributorName ? (
              <div className="preview-review-modal-meta-item">
                <span className="preview-review-modal-label">Contributor</span>
                <span className="preview-review-modal-value">{contributorName}</span>
              </div>
            ) : null}
            {previewUrl ? (
              <div className="preview-review-modal-meta-item">
                <span className="preview-review-modal-label">Preview link</span>
                <a
                  className="preview-review-modal-link"
                  href={previewUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open draft in new tab
                </a>
              </div>
            ) : null}
          </div>

          <PreviewFrame compact />

          {isSubmitting ? (
            <p className="preview-review-modal-status">Opening pull request…</p>
          ) : null}
          {error ? <p className="preview-review-modal-error">{error}</p> : null}
          {prUrl ? (
            <p className="preview-review-modal-success">
              Pull request opened —{" "}
              <a href={prUrl} target="_blank" rel="noreferrer">
                view on GitHub
              </a>
              .
            </p>
          ) : null}
        </div>

        <DialogFooter className="preview-review-modal-footer">
          <Button type="button" variant="outline" onClick={closeReview} disabled={isSubmitting}>
            Keep editing
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={isSubmitting || Boolean(prUrl)}>
            {isSubmitting ? "Opening PR…" : "Open pull request"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
