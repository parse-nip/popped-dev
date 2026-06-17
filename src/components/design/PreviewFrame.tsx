"use client";

import { usePreview } from "@/components/design/PreviewContext";

export function PreviewFrame() {
  const { previewUrl } = usePreview();

  if (!previewUrl) {
    return null;
  }

  return (
    <iframe
      className="preview-frame"
      src={previewUrl}
      title="Design preview"
      sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
    />
  );
}
