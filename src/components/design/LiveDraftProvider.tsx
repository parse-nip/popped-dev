"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { fetchBranchDraft, submitForReview } from "@/lib/agent-client";
import { clearDraftCss, injectDraftCss } from "@/lib/live-draft-styles";

export type LiveDraftSession = {
  runId: string;
  agentId: string;
  branch: string;
};

type LiveDraftContextValue = {
  session: LiveDraftSession | null;
  showConfirm: boolean;
  hasTsxChanges: boolean;
  isPolling: boolean;
  isAccepting: boolean;
  mergeUrl: string | null;
  error: string | null;
  startLiveDraft: (session: LiveDraftSession) => void;
  stopLiveDraft: () => void;
  acceptLiveDraft: () => Promise<boolean>;
  rejectLiveDraft: () => void;
};

const LiveDraftContext = createContext<LiveDraftContextValue | null>(null);

const POLL_INTERVAL_MS = 2000;

export function LiveDraftProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<LiveDraftSession | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [hasTsxChanges, setHasTsxChanges] = useState(false);
  const [isPolling, setIsPolling] = useState(false);
  const [isAccepting, setIsAccepting] = useState(false);
  const [mergeUrl, setMergeUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const lastShaRef = useRef<string | null>(null);
  const sessionRef = useRef<LiveDraftSession | null>(null);

  const stopLiveDraft = useCallback(() => {
    sessionRef.current = null;
    setSession(null);
    setIsPolling(false);
    setShowConfirm(false);
    setHasTsxChanges(false);
    lastShaRef.current = null;
  }, []);

  const startLiveDraft = useCallback((next: LiveDraftSession) => {
    sessionRef.current = next;
    setSession(next);
    setShowConfirm(false);
    setHasTsxChanges(false);
    setIsPolling(true);
    setIsAccepting(false);
    setMergeUrl(null);
    setError(null);
    lastShaRef.current = null;
  }, []);

  const rejectLiveDraft = useCallback(() => {
    clearDraftCss();
    stopLiveDraft();
  }, [stopLiveDraft]);

  const acceptLiveDraft = useCallback(async () => {
    const active = sessionRef.current;
    if (!active) return;

    setIsAccepting(true);
    setError(null);

    try {
      const result = await submitForReview({ runId: active.runId, branch: active.branch });
      if (result.mergeCommitUrl) {
        clearDraftCss();
        setIsPolling(false);
        setShowConfirm(false);
        sessionRef.current = null;
        setSession(null);
        setMergeUrl(result.mergeCommitUrl);
        return true;
      }
      setError("Merge did not return a commit link. Try again.");
      return false;
    } catch (submitError) {
      const message = submitError instanceof Error ? submitError.message : "Publish failed.";
      setError(message);
      return false;
    } finally {
      setIsAccepting(false);
    }
  }, []);

  useEffect(() => {
    if (!session || !isPolling) return;

    let cancelled = false;

    async function pollDraft() {
      const active = sessionRef.current;
      if (!active || cancelled) return;

      try {
        const draft = await fetchBranchDraft(active.branch);
        if (cancelled || !sessionRef.current) return;

        if (draft.sha && draft.sha !== lastShaRef.current && draft.ready) {
          lastShaRef.current = draft.sha;
          setHasTsxChanges(draft.hasTsxChanges);

          if (draft.css) {
            injectDraftCss(draft.css);
          }

          setShowConfirm(true);
        }
      } catch {
        // keep polling — branch may not have commits yet
      }
    }

    void pollDraft();
    const interval = window.setInterval(() => {
      void pollDraft();
    }, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [session, isPolling]);

  const value = useMemo(
    () => ({
      session,
      showConfirm,
      hasTsxChanges,
      isPolling,
      isAccepting,
      mergeUrl,
      error,
      startLiveDraft,
      stopLiveDraft,
      acceptLiveDraft,
      rejectLiveDraft,
    }),
    [
      session,
      showConfirm,
      hasTsxChanges,
      isPolling,
      isAccepting,
      mergeUrl,
      error,
      startLiveDraft,
      stopLiveDraft,
      acceptLiveDraft,
      rejectLiveDraft,
    ],
  );

  return <LiveDraftContext.Provider value={value}>{children}</LiveDraftContext.Provider>;
}

export function useLiveDraft() {
  const context = useContext(LiveDraftContext);
  if (!context) {
    throw new Error("useLiveDraft must be used within LiveDraftProvider");
  }
  return context;
}
