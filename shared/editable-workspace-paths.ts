import { isLockedFactPath } from "./locked-fact-files";

const BLOCKED_PREFIXES = ["workers/", ".cursor/"];

const ALLOWED_ROOT_FILES = new Set([
  "package.json",
  "package-lock.json",
  "next.config.ts",
  "next-env.d.ts",
  "tsconfig.json",
  "postcss.config.mjs",
  "components.json",
  "eslint.config.mjs",
  "README.md",
  "Design.md",
  "AGENTS.md",
]);

/** Paths the design agent may write and contributors may publish (facts stay locked). */
export function isEditableWorkspacePath(path: string): boolean {
  if (!path || path.endsWith("/")) return false;
  if (isLockedFactPath(path)) return false;
  if (BLOCKED_PREFIXES.some((prefix) => path.startsWith(prefix))) return false;
  if (path.startsWith("src/")) return true;
  if (path.startsWith("public/")) return true;
  if (path.startsWith("shared/")) return true;
  if (path.startsWith("scripts/")) return true;
  if (ALLOWED_ROOT_FILES.has(path)) return true;
  return false;
}
