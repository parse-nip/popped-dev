"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type PreviewMode = "live" | "preview";

type PreviewContextValue = {
  mode: PreviewMode;
  previewUrl: string | null;
  branch: string | null;
  runId: string | null;
  agentId: string | null;
  reviewOpen: boolean;
  prUrl: string | null;
  showPreview: (params: {
    previewUrl: string;
    branch: string;
    runId: string;
    agentId: string;
  }) => void;
  backToLive: () => void;
  openReview: () => void;
  closeReview: () => void;
  setPrUrl: (url: string | null) => void;
};

const PreviewContext = createContext<PreviewContextValue | null>(null);

export function PreviewProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<PreviewMode>("live");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [branch, setBranch] = useState<string | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const [agentId, setAgentId] = useState<string | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [prUrl, setPrUrl] = useState<string | null>(null);

  const showPreview = useCallback(
    (params: {
      previewUrl: string;
      branch: string;
      runId: string;
      agentId: string;
    }) => {
      setPreviewUrl(params.previewUrl);
      setBranch(params.branch);
      setRunId(params.runId);
      setAgentId(params.agentId);
      setMode("preview");
    },
    [],
  );

  const backToLive = useCallback(() => {
    setMode("live");
    setReviewOpen(false);
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
      branch,
      runId,
      agentId,
      reviewOpen,
      prUrl,
      showPreview,
      backToLive,
      openReview,
      closeReview,
      setPrUrl,
    }),
    [
      mode,
      previewUrl,
      branch,
      runId,
      agentId,
      reviewOpen,
      prUrl,
      showPreview,
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
