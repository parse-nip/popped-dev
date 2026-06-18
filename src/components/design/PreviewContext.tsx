"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { fetchPreviewUrl } from "@/lib/agent-client";

export type PreviewMode = "live" | "preview";

type PreviewContextValue = {
  mode: PreviewMode;
  previewUrl: string | null;
  previewRevision: string | null;
  previewBaselineSha: string | null;
  previewDeployReady: boolean;
  branch: string | null;
  runId: string | null;
  agentId: string | null;
  reviewOpen: boolean;
  publishedUrl: string | null;
  showPreview: (params: {
    previewUrl: string;
    branch: string;
    runId: string;
    agentId: string;
    ready?: boolean;
    sha?: string | null;
    baselineSha?: string | null;
  }) => void;
  updatePreviewUrl: (previewUrl: string, revision?: string | null) => void;
  backToLive: () => void;
  openReview: () => void;
  closeReview: () => void;
  setPublishedUrl: (url: string | null) => void;
};

const PreviewContext = createContext<PreviewContextValue | null>(null);

export function PreviewProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<PreviewMode>("live");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewRevision, setPreviewRevision] = useState<string | null>(null);
  const [previewBaselineSha, setPreviewBaselineSha] = useState<string | null>(null);
  const [previewDeployReady, setPreviewDeployReady] = useState(false);
  const [branch, setBranch] = useState<string | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const [agentId, setAgentId] = useState<string | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [publishedUrl, setPublishedUrl] = useState<string | null>(null);

  const showPreview = useCallback(
    (params: {
      previewUrl: string;
      branch: string;
      runId: string;
      agentId: string;
      ready?: boolean;
      sha?: string | null;
      baselineSha?: string | null;
    }) => {
      setBranch(params.branch);
      setRunId(params.runId);
      setAgentId(params.agentId);
      setMode("preview");
      setPreviewUrl(params.previewUrl);
      if (params.sha) setPreviewRevision(params.sha);
      setPreviewBaselineSha(params.baselineSha ?? null);
      setPreviewDeployReady(params.ready === true);

      void fetchPreviewUrl(params.branch, params.baselineSha ?? null)
        .then((resolved) => {
          setPreviewUrl(resolved.previewUrl);
          if (resolved.sha) setPreviewRevision(resolved.sha);
          setPreviewDeployReady(resolved.ready);
        })
        .catch(() => {
          // PreviewFrame keeps polling
        });
    },
    [],
  );

  const updatePreviewUrl = useCallback((url: string, revision?: string | null) => {
    setPreviewUrl(url);
    if (revision) setPreviewRevision(revision);
  }, []);

  const backToLive = useCallback(() => {
    setMode("live");
    setReviewOpen(false);
    setPreviewDeployReady(false);
    setPreviewRevision(null);
    setPreviewBaselineSha(null);
  }, []);

  const openReview = useCallback(() => {
    setReviewOpen(true);
  }, []);

  const closeReview = useCallback(() => {
    setReviewOpen(false);
  }, []);

  const value = useMemo(
    () => ({
      mode,
      previewUrl,
      previewRevision,
      previewBaselineSha,
      previewDeployReady,
      branch,
      runId,
      agentId,
      reviewOpen,
      publishedUrl,
      showPreview,
      updatePreviewUrl,
      backToLive,
      openReview,
      closeReview,
      setPublishedUrl,
    }),
    [
      mode,
      previewUrl,
      previewRevision,
      previewBaselineSha,
      previewDeployReady,
      branch,
      runId,
      agentId,
      reviewOpen,
      publishedUrl,
      showPreview,
      updatePreviewUrl,
      backToLive,
      openReview,
      closeReview,
    ],
  );

  return <PreviewContext.Provider value={value}>{children}</PreviewContext.Provider>;
}

export function usePreview() {
  const context = useContext(PreviewContext);
  if (!context) {
    throw new Error("usePreview must be used within PreviewProvider");
  }
  return context;
}
