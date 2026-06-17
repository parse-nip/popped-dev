"use client";

import { Button } from "@/components/ui/button";
import { usePreview } from "@/components/design/PreviewContext";

function shortBranchLabel(branch: string | null): string {
  if (!branch) return "your draft";
  const sessionId = branch.split("/").pop() ?? branch;
  return sessionId.slice(0, 8);
}

export function PreviewBar() {
  const { branch, backToLive, openReview } = usePreview();

  return (
    <div className="preview-bar" role="status" aria-live="polite">
      <div className="preview-bar-inner">
        <div className="preview-bar-copy">
          <span className="preview-bar-badge">Draft preview</span>
          <p className="preview-bar-text">
            Viewing session <strong>{shortBranchLabel(branch)}</strong> — not live on popped.dev yet.
          </p>
        </div>
        <div className="preview-bar-actions">
          <Button type="button" variant="outline" size="sm" onClick={backToLive}>
            Back to live site
          </Button>
          <Button type="button" size="sm" onClick={openReview}>
            Submit for review
          </Button>
        </div>
      </div>
    </div>
  );
}
