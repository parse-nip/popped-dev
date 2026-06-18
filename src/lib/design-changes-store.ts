export type DesignChangeDeployStatus =
  | "working"
  | "ready"
  | "failed";

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

type StoredChanges = {
  sessionId: string;
  items: DesignChange[];
};

const STORAGE_KEY = "popped.dev:design-changes";
const SESSION_ID_KEY = "popped.dev:agent-session-id";
const CHANGE_EVENT = "popped.dev:design-changes-change";

function readSessionId(): string {
  if (typeof window === "undefined") return "";
  return sessionStorage.getItem(SESSION_ID_KEY) ?? "";
}

function readStored(): StoredChanges | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredChanges;
    if (!parsed.sessionId || !Array.isArray(parsed.items)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeStored(payload: StoredChanges): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
}

export function readDesignChanges(sessionId = readSessionId()): DesignChange[] {
  if (!sessionId) return [];
  const stored = readStored();
  if (!stored || stored.sessionId !== sessionId) return [];
  return stored.items;
}

export function upsertDesignChange(change: DesignChange, sessionId = readSessionId()): DesignChange[] {
  if (!sessionId) return [];

  const stored = readStored();
  const items = stored?.sessionId === sessionId ? [...stored.items] : [];

  const index = items.findIndex((item) => item.runId === change.runId);
  if (index >= 0) {
    items[index] = { ...items[index], ...change };
  } else {
    items.unshift(change);
  }

  writeStored({ sessionId, items });
  return items;
}

export function updateDesignChange(
  runId: string,
  patch: Partial<DesignChange>,
  sessionId = readSessionId(),
): DesignChange[] {
  if (!sessionId) return [];

  const stored = readStored();
  if (!stored || stored.sessionId !== sessionId) return [];

  const items = stored.items.map((item) =>
    item.runId === runId ? { ...item, ...patch } : item,
  );
  writeStored({ sessionId, items });
  return items;
}

export function clearDesignChanges(sessionId = readSessionId()): void {
  if (typeof window === "undefined" || !sessionId) return;
  const stored = readStored();
  if (stored?.sessionId === sessionId) {
    localStorage.removeItem(STORAGE_KEY);
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
  }
}

export function subscribeDesignChanges(onChange: () => void): () => void {
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

export function deployStatusLabel(status: DesignChangeDeployStatus): string {
  switch (status) {
    case "working":
      return "Agent working…";
    case "ready":
      return "Ready to confirm";
    case "failed":
      return "Failed";
    default:
      return status;
  }
}

export function formatChangeAge(timestamp: number): string {
  const minutes = Math.max(1, Math.round((Date.now() - timestamp) / 60_000));
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  return `${hours} hr ago`;
}
