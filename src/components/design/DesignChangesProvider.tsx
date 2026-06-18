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
  clearDesignChanges,
  readDesignChanges,
  subscribeDesignChanges,
  updateDesignChange,
  upsertDesignChange,
  type DesignChange,
  type DesignChangeDeployStatus,
} from "@/lib/design-changes-store";

type DesignChangesContextValue = {
  changes: DesignChange[];
  focusedChange: DesignChange | null;
  focusChange: (runId: string | null) => void;
  isAgentBusy: boolean;
  streamingRunId: string | null;
  claimStream: (runId: string) => boolean;
  releaseStream: (runId: string) => void;
  addChange: (change: Omit<DesignChange, "createdAt" | "deployStatus">) => void;
  updateDeployStatus: (
    runId: string,
    deployStatus: DesignChangeDeployStatus,
    previewSha?: string | null,
  ) => void;
  clearChanges: () => void;
  pendingCount: number;
};

const DesignChangesContext = createContext<DesignChangesContextValue | null>(null);

export function DesignChangesProvider({ children }: { children: ReactNode }) {
  const [changes, setChanges] = useState<DesignChange[]>([]);
  const [focusedRunId, setFocusedRunId] = useState<string | null>(null);
  const [streamingRunId, setStreamingRunId] = useState<string | null>(null);
  const [agentSessionActive, setAgentSessionActive] = useState(false);

  const syncFromStore = useCallback(() => {
    setChanges(readDesignChanges(getSessionId()));
  }, []);

  useEffect(() => {
    syncFromStore();
    return subscribeDesignChanges(syncFromStore);
  }, [syncFromStore]);

  const addChange = useCallback(
    (change: Omit<DesignChange, "createdAt" | "deployStatus">) => {
      const items = upsertDesignChange({
        ...change,
        createdAt: Date.now(),
        deployStatus: "working",
      });
      setChanges(items);
    },
    [],
  );

  const updateDeployStatus = useCallback(
    (runId: string, deployStatus: DesignChangeDeployStatus, previewSha?: string | null) => {
      const items = updateDesignChange(runId, { deployStatus, previewSha }, getSessionId());
      setChanges(items);
    },
    [],
  );

  const clearChanges = useCallback(() => {
    clearDesignChanges(getSessionId());
    setChanges([]);
  }, []);

  const focusChange = useCallback((runId: string | null) => {
    setFocusedRunId(runId);
  }, []);

  const focusedChange = useMemo(
    () => changes.find((change) => change.runId === focusedRunId) ?? null,
    [changes, focusedRunId],
  );

  const claimStream = useCallback((runId: string) => {
    if (streamingRunId && streamingRunId !== runId) {
      return false;
    }
    setStreamingRunId(runId);
    setAgentSessionActive(true);
    return true;
  }, [streamingRunId]);

  const releaseStream = useCallback((runId: string) => {
    setStreamingRunId((current) => (current === runId ? null : current));
    setAgentSessionActive(false);
  }, []);

  const isAgentBusy = useMemo(
    () =>
      agentSessionActive ||
      changes.some((change) => change.deployStatus === "working"),
    [agentSessionActive, changes],
  );

  const pendingCount = useMemo(
    () => changes.filter((change) => change.deployStatus === "working").length,
    [changes],
  );

  const value = useMemo(
    () => ({
      changes,
      focusedChange,
      focusChange,
      isAgentBusy,
      streamingRunId,
      claimStream,
      releaseStream,
      addChange,
      updateDeployStatus,
      clearChanges,
      pendingCount,
    }),
    [
      changes,
      focusedChange,
      focusChange,
      isAgentBusy,
      streamingRunId,
      claimStream,
      releaseStream,
      addChange,
      updateDeployStatus,
      clearChanges,
      pendingCount,
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
