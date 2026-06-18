"use client";

type PreviewProgressOverlayProps = {
  compact?: boolean;
  phase: "building" | "loading";
  progress: number;
};

function clampProgress(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function PreviewProgressOverlay({
  compact = false,
  phase,
  progress,
}: PreviewProgressOverlayProps) {
  const value = clampProgress(progress);
  const title = phase === "building" ? "Building preview" : "Loading preview";
  const subtitle =
    phase === "building"
      ? "Cloudflare Pages is deploying your branch. This usually takes under a minute."
      : "Pulling your draft into the preview pane…";

  return (
    <div
      className={
        compact
          ? "preview-build-overlay preview-build-overlay--compact"
          : "preview-build-overlay"
      }
      aria-live="polite"
      aria-busy="true"
    >
      <div className="preview-build-overlay-card">
        <span className="preview-build-overlay-spinner" aria-hidden="true" />
        <div className="preview-build-overlay-copy">
          <div className="preview-build-overlay-heading">
            <p className="preview-build-overlay-title">{title}</p>
            <span className="preview-build-overlay-percent" aria-label={`${value} percent`}>
              {value}%
            </span>
          </div>
          <div
            className="preview-build-progress"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={value}
            aria-label={title}
          >
            <span
              className="preview-build-progress-fill"
              style={{ width: `${value}%` }}
            />
          </div>
          <p className="preview-build-overlay-subtitle">{subtitle}</p>
        </div>
      </div>
    </div>
  );
}
