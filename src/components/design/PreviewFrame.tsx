"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PreviewProgressOverlay } from "@/components/design/PreviewProgressOverlay";
import { usePreview } from "@/components/design/PreviewContext";
import { fetchPreviewUrl } from "@/lib/agent-client";
import { buildPreviewEmbedUrl } from "@/lib/draft-preview";

type PreviewFrameProps = {
  compact?: boolean;
};

function nextMonotonicProgress(current: number, incoming: number): number {
  return Math.max(current, Math.min(99, incoming));
}

type PreviewFrameInnerProps = {
  compact: boolean;
  branch: string;
  baselineSha: string | null;
  contextPreviewUrl: string | null;
  previewRevision: string | null;
  previewDeployReady: boolean;
  updatePreviewUrl: (url: string, revision?: string | null) => void;
};

function PreviewFrameInner({
  compact,
  branch,
  baselineSha,
  contextPreviewUrl,
  previewRevision,
  previewDeployReady,
  updatePreviewUrl,
}: PreviewFrameInnerProps) {
  const [status, setStatus] = useState<"loading" | "ready" | "building">("building");
  const [frameUrl, setFrameUrl] = useState<string | null>(null);
  const [frameRevision, setFrameRevision] = useState<string | null>(null);
  const [progress, setProgress] = useState(6);
  const [reloadKey, setReloadKey] = useState(0);
  const progressRef = useRef(6);
  const loadedRevisionRef = useRef<string | null>(null);

  const setMonotonicProgress = useCallback((incoming: number) => {
    const next = nextMonotonicProgress(progressRef.current, incoming);
    progressRef.current = next;
    setProgress(next);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function resolvePreview() {
      try {
        for (let attempt = 0; attempt < 80; attempt += 1) {
          const result = await fetchPreviewUrl(branch, baselineSha);
          if (cancelled) return;

          const revision = result.sha ?? previewRevision;
          updatePreviewUrl(result.previewUrl, result.sha ?? null);
          setMonotonicProgress(result.progress ?? 12 + attempt * 2);

          if (result.ready && revision) {
            setFrameRevision(revision);
            setFrameUrl(buildPreviewEmbedUrl(result.previewUrl, revision));
            setStatus("loading");
            setMonotonicProgress(90);
            return;
          }

          setStatus("building");
          await new Promise((resolve) => setTimeout(resolve, 1500));
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
  }, [branch, baselineSha, previewRevision, reloadKey, setMonotonicProgress, updatePreviewUrl]);

  useEffect(() => {
    if (!previewDeployReady || !contextPreviewUrl || !previewRevision) return;
    if (loadedRevisionRef.current === previewRevision) return;

    loadedRevisionRef.current = previewRevision;
    const nextUrl = buildPreviewEmbedUrl(contextPreviewUrl, previewRevision);
    setFrameRevision(previewRevision);
    setFrameUrl(nextUrl);
    setStatus("loading");
    setMonotonicProgress(90);
  }, [contextPreviewUrl, previewDeployReady, previewRevision, setMonotonicProgress]);

  useEffect(() => {
    if (status !== "loading") return;

    const interval = window.setInterval(() => {
      if (progressRef.current >= 99) return;
      setMonotonicProgress(progressRef.current + 2);
    }, 120);

    return () => window.clearInterval(interval);
  }, [status, frameUrl, setMonotonicProgress]);

  const retryPreview = useCallback(() => {
    progressRef.current = 6;
    setProgress(6);
    setFrameUrl(null);
    setFrameRevision(null);
    setStatus("building");
    setReloadKey((key) => key + 1);
  }, []);

  if (!frameUrl) {
    return (
      <div className={compact ? "preview-frame-shell preview-frame-shell--compact" : "preview-frame-shell"}>
        <PreviewProgressOverlay compact={compact} phase="building" progress={progress} />
      </div>
    );
  }

  return (
    <div className={compact ? "preview-frame-shell preview-frame-shell--compact" : "preview-frame-shell"}>
      {status !== "ready" ? (
        <PreviewProgressOverlay
          compact={compact}
          phase={status === "building" ? "building" : "loading"}
          progress={progress}
        />
      ) : null}
      <div className="preview-frame-header-shield" aria-hidden="true" title="Design mode disabled in draft preview" />
      <iframe
        key={`${frameRevision ?? frameUrl}-${reloadKey}`}
        className="preview-frame"
        src={frameUrl}
        title="Design preview"
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
        onLoad={() => {
          progressRef.current = 100;
          setProgress(100);
          setStatus("ready");
        }}
        onError={retryPreview}
      />
    </div>
  );
}

export function PreviewFrame({ compact = false }: PreviewFrameProps) {
  const {
    branch,
    previewUrl: contextPreviewUrl,
    previewRevision,
    previewBaselineSha,
    previewDeployReady,
    updatePreviewUrl,
  } = usePreview();

  if (!branch) return null;

  return (
    <PreviewFrameInner
      key={branch}
      compact={compact}
      branch={branch}
      baselineSha={previewBaselineSha}
      contextPreviewUrl={contextPreviewUrl}
      previewRevision={previewRevision}
      previewDeployReady={previewDeployReady}
      updatePreviewUrl={updatePreviewUrl}
    />
  );
}
