export const MERGE_COOLDOWN_KEY = "popped.dev:merge-cooldown-until";
export const MERGE_COOLDOWN_MS = 30 * 60 * 1000;

export function setLocalMergeCooldown(untilMs: number): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(MERGE_COOLDOWN_KEY, String(untilMs));
}

export function clearLocalMergeCooldown(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(MERGE_COOLDOWN_KEY);
}

export function getMergeCooldownUntil(): number | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(MERGE_COOLDOWN_KEY);
  if (!raw) return null;
  const until = Number.parseInt(raw, 10);
  if (Number.isNaN(until)) {
    clearLocalMergeCooldown();
    return null;
  }
  if (Date.now() >= until) {
    clearLocalMergeCooldown();
    return null;
  }
  return until;
}

export function getMergeCooldownRemainingMs(): number {
  const until = getMergeCooldownUntil();
  if (!until) return 0;
  return until - Date.now();
}

export function formatCooldownRemaining(ms: number): string {
  const totalMinutes = Math.ceil(ms / 60_000);
  if (totalMinutes < 60) {
    return `${totalMinutes} min`;
  }
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
}
