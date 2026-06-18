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
import { formatCooldownRemaining, MERGE_COOLDOWN_MS } from "@/lib/merge-cooldown";
import { buildPreviewEmbedUrl } from "@/lib/draft-preview";

export function PreviewReviewModal() {
  const {
    reviewOpen,
    closeReview,
    branch,
    previewUrl,
    previewRevision,
    runId,
    agentId,
    publishedUrl,
    setPublishedUrl,
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
      if (result.mergeCommitUrl) {
        setPublishedUrl(result.mergeCommitUrl);
      } else {
        setError("Merge did not return a commit link. Try again shortly.");
      }
    } catch (submitError) {
      const message =
        submitError instanceof Error ? submitError.message : "Publish failed.";
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
          <DialogTitle>Publish your design</DialogTitle>
          <DialogDescription>
            Check the draft below, then merge it to main so it goes live on popped.dev.
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
                  href={buildPreviewEmbedUrl(previewUrl, previewRevision)}
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
            <p className="preview-review-modal-status">Merging to main on GitHub…</p>
          ) : null}
          {error ? <p className="preview-review-modal-error">{error}</p> : null}
          {publishedUrl ? (
            <p className="preview-review-modal-success">
              Merged to main —{" "}
              <a href={publishedUrl} target="_blank" rel="noreferrer">
                view commit on GitHub
              </a>
              . Cloudflare Pages will rebuild the live site shortly. You can start a new design in{" "}
              {formatCooldownRemaining(MERGE_COOLDOWN_MS)}.
            </p>
          ) : null}
        </div>

        <DialogFooter className="preview-review-modal-footer">
          <Button type="button" variant="outline" onClick={closeReview} disabled={isSubmitting}>
            Keep editing
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={isSubmitting || Boolean(publishedUrl)}>
            {isSubmitting ? "Merging…" : "Merge to main"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
