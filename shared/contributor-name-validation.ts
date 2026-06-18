export const ATTRIBUTION_KEY = "popped.dev:contributor-name";
export const CONTRIBUTOR_NAME_MIN = 2;
export const CONTRIBUTOR_NAME_MAX = 80;

export type ContributorNameError =
  | "too_short"
  | "too_long"
  | "invalid_characters"
  | "not_allowed";

export type ContributorNameValidation =
  | { ok: true; name: string }
  | { ok: false; error: ContributorNameError };

const ALLOWED_NAME_PATTERN = /^[\p{L}\p{M}0-9 .'-]+$/u;
const URL_PATTERN = /(?:https?:\/\/|www\.|\w+\.(?:com|net|org|io|dev|xyz|co)\b)/i;

const BLOCKED_TERMS = [
  "anal",
  "asshole",
  "bastard",
  "bitch",
  "blowjob",
  "bollocks",
  "boner",
  "boob",
  "chink",
  "cock",
  "coon",
  "cunt",
  "dick",
  "dyke",
  "fag",
  "faggot",
  "fuck",
  "fucker",
  "fucking",
  "heil",
  "hitler",
  "kike",
  "kkk",
  "motherfucker",
  "nazi",
  "nigger",
  "nigga",
  "penis",
  "porn",
  "pussy",
  "rape",
  "rapist",
  "retard",
  "shit",
  "slut",
  "spic",
  "twat",
  "vagina",
  "whore",
  "wop",
] as const;

function normalizeForModeration(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[@4]/g, "a")
    .replace(/8/g, "b")
    .replace(/[3€]/g, "e")
    .replace(/[1!|]/g, "i")
    .replace(/0/g, "o")
    .replace(/5/g, "s")
    .replace(/7/g, "t")
    .replace(/\$/g, "s")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function containsBlockedTerm(text: string): boolean {
  const normalized = normalizeForModeration(text);
  if (!normalized) return false;

  const compact = normalized.replace(/\s/g, "");
  const tokens = normalized.split(/\s+/);

  for (const term of BLOCKED_TERMS) {
    if (term.length <= 3) {
      if (tokens.includes(term)) return true;
      continue;
    }

    if (tokens.includes(term)) return true;
    if (compact.includes(term)) return true;
  }

  return false;
}

export function contributorNameErrorMessage(error: ContributorNameError): string {
  switch (error) {
    case "too_short":
      return "Enter at least 2 characters.";
    case "too_long":
      return `Keep your name under ${CONTRIBUTOR_NAME_MAX} characters.`;
    case "invalid_characters":
      return "Use letters, numbers, spaces, and basic punctuation only.";
    case "not_allowed":
      return "Please choose a respectful name for attribution.";
  }
}

export function validateContributorName(raw: string): ContributorNameValidation {
  const name = raw.trim();

  if (name.length < CONTRIBUTOR_NAME_MIN) {
    return { ok: false, error: "too_short" };
  }

  if (name.length > CONTRIBUTOR_NAME_MAX) {
    return { ok: false, error: "too_long" };
  }

  if (!ALLOWED_NAME_PATTERN.test(name)) {
    return { ok: false, error: "invalid_characters" };
  }

  if (URL_PATTERN.test(name)) {
    return { ok: false, error: "not_allowed" };
  }

  if (containsBlockedTerm(name)) {
    return { ok: false, error: "not_allowed" };
  }

  return { ok: true, name };
}
