import { ATTRIBUTION_KEY } from "@/components/locked/LockedIntro";

const CHANGE_EVENT = "popped.dev:contributor-name-change";

export function readContributorName(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(ATTRIBUTION_KEY)?.trim() ?? "";
}

export function writeContributorName(name: string): void {
  if (typeof window === "undefined") return;
  const trimmed = name.trim();
  if (trimmed) {
    localStorage.setItem(ATTRIBUTION_KEY, trimmed);
  } else {
    localStorage.removeItem(ATTRIBUTION_KEY);
  }
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: trimmed }));
}

export function subscribeContributorName(onChange: (name: string) => void): () => void {
  if (typeof window === "undefined") return () => {};

  const handleStorage = (event: StorageEvent) => {
    if (event.key === ATTRIBUTION_KEY) {
      onChange(readContributorName());
    }
  };

  const handleCustom = () => {
    onChange(readContributorName());
  };

  window.addEventListener("storage", handleStorage);
  window.addEventListener(CHANGE_EVENT, handleCustom);

  return () => {
    window.removeEventListener("storage", handleStorage);
    window.removeEventListener(CHANGE_EVENT, handleCustom);
  };
}
