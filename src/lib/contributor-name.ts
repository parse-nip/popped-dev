import { ATTRIBUTION_KEY } from "@/components/locked/LockedIntro";
import {
  validateContributorName,
  type ContributorNameValidation,
} from "@shared/contributor-name-validation";

export type { ContributorNameValidation };
export {
  contributorNameErrorMessage,
  validateContributorName,
} from "@shared/contributor-name-validation";

const CHANGE_EVENT = "popped.dev:contributor-name-change";

export function readContributorName(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(ATTRIBUTION_KEY)?.trim() ?? "";
}

export function writeContributorName(name: string): ContributorNameValidation {
  if (typeof window === "undefined") {
    return validateContributorName(name);
  }

  const result = validateContributorName(name);
  if (!result.ok) {
    return result;
  }

  localStorage.setItem(ATTRIBUTION_KEY, result.name);
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: result.name }));
  return result;
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
