"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { getSessionId } from "@/lib/agent-client";
import {
  clearDesignState,
  readDesignState,
  subscribeDesignState,
  writeDesignState,
  type DesignState,
} from "@/lib/design-changes-store";
import {
  applyDraftPatch,
  clearAllDraftPatches,
  reapplyDraftPatches,
  removeDraftPatch,
  type DesignPatch,
  type DesignPublishStatus,
} from "@/lib/design-patch";

type DesignChangesContextValue = {
  state: DesignState;
  isAgentBusy: boolean;
  pendingCount: number;
  acceptedCount: number;
  setSelectedDesignId: (designId: string | null) => void;
  setPendingPatch: (patch: DesignPatch | null) => void;
  confirmPendingPatch: () => void;
  rejectPendingPatch: () => void;
  removeAcceptedPatch: (patchId: string) => void;
  setPublishStatus: (
    publishStatus: DesignPublishStatus,
    publishUrl?: string | null,
    publishError?: string | null,
  ) => void;
  finishPublish: (commitUrl: string) => void;
  clearSession: () => void;
};

const DesignChangesContext = createContext<DesignChangesContextValue | null>(null);

export function DesignChangesProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DesignState>(() => readDesignState(getSessionId()));
  const [isAgentBusy, setIsAgentBusy] = useState(false);

  const syncFromStore = useCallback(() => {
    setState(readDesignState(getSessionId()));
  }, []);

  useEffect(() => {
    syncFromStore();
    return subscribeDesignState(syncFromStore);
  }, [syncFromStore]);

  useEffect(() => {
    reapplyDraftPatches([
      ...state.acceptedPatches,
      ...(state.pendingPatch ? [state.pendingPatch] : []),
    ]);
  }, [state.acceptedPatches, state.pendingPatch]);

  const persist = useCallback((patch: Partial<DesignState>) => {
    const next = writeDesignState(patch, getSessionId());
    setState(next);
    return next;
  }, []);

  const setSelectedDesignId = useCallback(
    (designId: string | null) => {
      persist({ selectedDesignId: designId });
    },
    [persist],
  );

  const setPendingPatch = useCallback(
    (patch: DesignPatch | null) => {
      if (state.pendingPatch && patch?.id !== state.pendingPatch.id) {
        removeDraftPatch(state.pendingPatch.id);
      }
      if (patch) {
        applyDraftPatch(patch);
      }
      persist({ pendingPatch: patch });
    },
    [persist, state.pendingPatch],
  );

  const confirmPendingPatch = useCallback(() => {
    if (!state.pendingPatch) return;
    const accepted = [...state.acceptedPatches, state.pendingPatch];
    persist({ acceptedPatches: accepted, pendingPatch: null });
  }, [persist, state.acceptedPatches, state.pendingPatch]);

  const rejectPendingPatch = useCallback(() => {
    if (!state.pendingPatch) return;
    removeDraftPatch(state.pendingPatch.id);
    persist({
      rejectedPatches: [...state.rejectedPatches, state.pendingPatch],
      pendingPatch: null,
    });
  }, [persist, state.pendingPatch, state.rejectedPatches]);

  const removeAcceptedPatch = useCallback(
    (patchId: string) => {
      removeDraftPatch(patchId);
      persist({
        acceptedPatches: state.acceptedPatches.filter((patch) => patch.id !== patchId),
      });
    },
    [persist, state.acceptedPatches],
  );

  const setPublishStatus = useCallback(
    (
      publishStatus: DesignPublishStatus,
      publishUrl: string | null = null,
      publishError: string | null = null,
    ) => {
      persist({ publishStatus, publishUrl, publishError });
    },
    [persist],
  );

  const finishPublish = useCallback(
    (commitUrl: string) => {
      clearAllDraftPatches();
      persist({
        acceptedPatches: [],
        pendingPatch: null,
        rejectedPatches: state.rejectedPatches,
        publishStatus: "published",
        publishUrl: commitUrl,
        publishError: null,
      });
    },
    [persist, state.rejectedPatches],
  );

  const clearSession = useCallback(() => {
    clearAllDraftPatches();
    clearDesignState(getSessionId());
    setState(readDesignState(getSessionId()));
  }, []);

  const pendingCount = state.pendingPatch ? 1 : 0;
  const acceptedCount = state.acceptedPatches.length;

  const value = useMemo(
    () => ({
      state,
      isAgentBusy,
      pendingCount,
      acceptedCount,
      setSelectedDesignId,
      setPendingPatch,
      confirmPendingPatch,
      rejectPendingPatch,
      removeAcceptedPatch,
      setPublishStatus,
      finishPublish,
      clearSession,
      /** Internal — set agent busy during SSE run */
      _setAgentBusy: setIsAgentBusy,
    }),
    [
      state,
      isAgentBusy,
      pendingCount,
      acceptedCount,
      setSelectedDesignId,
      setPendingPatch,
      confirmPendingPatch,
      rejectPendingPatch,
      removeAcceptedPatch,
      setPublishStatus,
      finishPublish,
      clearSession,
    ],
  );

  return (
    <DesignChangesContext.Provider value={value}>{children}</DesignChangesContext.Provider>
  );
}

export function useDesignChanges() {
  const context = useContext(DesignChangesContext);
  if (!context) {
    throw new Error("useDesignChanges must be used within DesignChangesProvider");
  }
  return context;
}

export function useSetAgentBusy() {
  const context = useContext(DesignChangesContext);
  if (!context) return () => {};
  return (context as DesignChangesContextValue & { _setAgentBusy: (busy: boolean) => void })
    ._setAgentBusy;
}
