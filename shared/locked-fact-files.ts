/** Paths whose factual content must not change during design sessions. */
export const LOCKED_FACT_FILES = [
  "src/content/resume.ts",
  "src/data/resume.ts",
  "src/content/profile.ts",
  "src/locked/experience.json",
  "src/locked/manifest.json",
  "src/components/locked/LockedIntro.tsx",
] as const;

const LOCKED_PREFIXES = ["src/locked/"];

export function isLockedFactPath(path: string): boolean {
  if ((LOCKED_FACT_FILES as readonly string[]).includes(path)) return true;
  return LOCKED_PREFIXES.some((prefix) => path.startsWith(prefix));
}

export function findLockedFactViolations(
  changedPaths: string[],
): string[] {
  return changedPaths.filter(isLockedFactPath);
}
