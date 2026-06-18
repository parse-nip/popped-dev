"use client";

type WebContainerPreviewProps = {
  previewUrl: string | null;
  statusMessage: string;
};

export function WebContainerPreview({ previewUrl, statusMessage }: WebContainerPreviewProps) {
  return (
    <div className="design-workspace-preview">
      {previewUrl ? (
        <iframe
          title="Live design preview"
          src={previewUrl}
          className="design-workspace-iframe"
          allow="cross-origin-isolated"
        />
      ) : (
        <div className="design-workspace-preview-placeholder">
          <p>{statusMessage}</p>
        </div>
      )}
    </div>
  );
}
