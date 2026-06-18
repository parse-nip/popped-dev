const LOCKED_PATHS = new Set([
  "src/locked/experience.json",
  "src/locked/manifest.json",
  "src/components/locked/LockedIntro.tsx",
]);

const LOCKED_PREFIXES = ["src/locked/"];

export type BranchVerification = {
  ok: boolean;
  changedFiles: string[];
  lockedViolations: string[];
  aheadBy: number;
};

export function isLockedPath(path: string): boolean {
  if (LOCKED_PATHS.has(path)) return true;
  return LOCKED_PREFIXES.some((prefix) => path.startsWith(prefix));
}

export function verifyChangedFiles(
  changedFiles: string[],
  aheadBy: number,
): BranchVerification {
  const lockedViolations = changedFiles.filter(isLockedPath);
  return {
    ok: lockedViolations.length === 0 && aheadBy > 0,
    changedFiles,
    lockedViolations,
    aheadBy,
  };
}

export function formatVerificationFailure(result: BranchVerification): string {
  if (result.lockedViolations.length > 0) {
    return `Locked files were modified (${result.lockedViolations.join(", ")}). Only presentation changes are allowed.`;
  }
  if (result.aheadBy === 0) {
    return "No commits on the design branch yet — the agent may still be syncing changes.";
  }
  return "Branch changes failed verification.";
}

/** Fail only when locked files are touched. No commits yet is OK for preview. */
export function verifyLockedFilesOnly(
  changedFiles: string[],
  aheadBy: number,
): { ok: boolean; message?: string } {
  if (aheadBy === 0) return { ok: true };
  const lockedViolations = changedFiles.filter(isLockedPath);
  if (lockedViolations.length === 0) return { ok: true };
  return {
    ok: false,
    message: formatVerificationFailure({
      ok: false,
      changedFiles,
      lockedViolations,
      aheadBy,
    }),
  };
}
