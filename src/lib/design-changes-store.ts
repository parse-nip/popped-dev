import type { DesignPatch, DesignPublishStatus } from "@/lib/design-patch";

export type DesignState = {
  sessionId: string;
  selectedDesignId: string | null;
  pendingPatch: DesignPatch | null;
  acceptedPatches: DesignPatch[];
  rejectedPatches: DesignPatch[];
  publishStatus: DesignPublishStatus;
  publishUrl: string | null;
  publishError: string | null;
};

type StoredDesignState = DesignState;

const STORAGE_KEY = "popped.dev:design-patches";
const SESSION_ID_KEY = "popped.dev:agent-session-id";
const CHANGE_EVENT = "popped.dev:design-patches-change";

const EMPTY_STATE = (): Omit<DesignState, "sessionId"> => ({
  selectedDesignId: null,
  pendingPatch: null,
  acceptedPatches: [],
  rejectedPatches: [],
  publishStatus: "idle",
  publishUrl: null,
  publishError: null,
});

function readSessionId(): string {
  if (typeof window === "undefined") return "";
  return sessionStorage.getItem(SESSION_ID_KEY) ?? "";
}

function readStored(): StoredDesignState | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredDesignState;
    if (!parsed.sessionId) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeStored(payload: StoredDesignState): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
}

export function readDesignState(sessionId = readSessionId()): DesignState {
  if (!sessionId) {
    return { sessionId: "", ...EMPTY_STATE() };
  }

  const stored = readStored();
  if (!stored || stored.sessionId !== sessionId) {
    return { sessionId, ...EMPTY_STATE() };
  }

  return stored;
}

export function writeDesignState(
  patch: Partial<DesignState>,
  sessionId = readSessionId(),
): DesignState {
  if (!sessionId) return { sessionId: "", ...EMPTY_STATE() };

  const current = readDesignState(sessionId);
  const next: DesignState = { ...current, ...patch, sessionId };
  writeStored(next);
  return next;
}

export function clearDesignState(sessionId = readSessionId()): void {
  if (typeof window === "undefined" || !sessionId) return;
  const stored = readStored();
  if (stored?.sessionId === sessionId) {
    localStorage.removeItem(STORAGE_KEY);
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
  }
}

export function subscribeDesignState(onChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};

  const handleStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) onChange();
  };

  const handleCustom = () => onChange();

  window.addEventListener("storage", handleStorage);
  window.addEventListener(CHANGE_EVENT, handleCustom);

  return () => {
    window.removeEventListener("storage", handleStorage);
    window.removeEventListener(CHANGE_EVENT, handleCustom);
  };
}

export function formatChangeAge(timestamp: number): string {
  const minutes = Math.max(1, Math.round((Date.now() - timestamp) / 60_000));
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  return `${hours} hr ago`;
}

/** @deprecated Use readDesignState — kept for transitional imports */
export type DesignChangeDeployStatus = "working" | "ready" | "failed";

/** @deprecated Use DesignPatch via readDesignState */
export type DesignChange = {
  runId: string;
  agentId: string;
  branch: string;
  prompt: string;
  elementLabel: string;
  baselineSha?: string | null;
  createdAt: number;
  deployStatus: DesignChangeDeployStatus;
  previewSha?: string | null;
};

export function deployStatusLabel(_status: DesignChangeDeployStatus): string {
  return "Ready to confirm";
}

export function readDesignChanges(): DesignChange[] {
  return [];
}

export function upsertDesignChange(): DesignChange[] {
  return [];
}

export function updateDesignChange(): DesignChange[] {
  return [];
}

export function clearDesignChanges(sessionId = readSessionId()): void {
  clearDesignState(sessionId);
}

export function subscribeDesignChanges(onChange: () => void): () => void {
  return subscribeDesignState(onChange);
}
