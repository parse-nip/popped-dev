"use client";

import { useEffect, useState } from "react";
import { usePreview } from "@/components/design/PreviewContext";
import { fetchPreviewUrl } from "@/lib/agent-client";

type PreviewFrameProps = {
  compact?: boolean;
};

export function PreviewFrame({ compact = false }: PreviewFrameProps) {
  const { previewUrl, branch, updatePreviewUrl } = usePreview();
  const [status, setStatus] = useState<"loading" | "ready" | "building">("loading");
  const [frameUrl, setFrameUrl] = useState<string | null>(previewUrl);

  useEffect(() => {
    setFrameUrl(previewUrl);
    setStatus(previewUrl ? "loading" : "building");
  }, [previewUrl]);

  useEffect(() => {
    if (!branch) return;
    const branchName = branch;

    let cancelled = false;

    async function resolvePreview() {
      try {
        for (let attempt = 0; attempt < 45; attempt += 1) {
          const result = await fetchPreviewUrl(branchName);
          if (cancelled) return;

          setFrameUrl(result.previewUrl);
          updatePreviewUrl(result.previewUrl);

          if (result.ready) {
            setStatus("ready");
            return;
          }

          setStatus("building");
          await new Promise((resolve) => setTimeout(resolve, 2000));
        }
      } catch {
        if (!cancelled) {
          setStatus("building");
        }
      }
    }

    void resolvePreview();
    return () => {
      cancelled = true;
    };
  }, [branch, updatePreviewUrl]);

  if (!frameUrl) {
    return (
      <div className={compact ? "preview-frame-shell preview-frame-shell--compact" : "preview-frame-shell"}>
        <p className="preview-frame-message">Waiting for preview URL…</p>
      </div>
    );
  }

  return (
    <div className={compact ? "preview-frame-shell preview-frame-shell--compact" : "preview-frame-shell"}>
      {status !== "ready" ? (
        <div className="preview-frame-overlay" aria-live="polite">
          <p className="preview-frame-message">
            {status === "building"
              ? "Cloudflare Pages is building your draft…"
              : "Loading preview…"}
          </p>
        </div>
      ) : null}
      <iframe
        className="preview-frame"
        src={frameUrl}
        title="Design preview"
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
        onLoad={() => setStatus("ready")}
      />
    </div>
  );
}
