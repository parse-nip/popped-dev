import { isLockedFactPath } from "./locked-fact-files";

const BLOCKED_PREFIXES = [
  ".git/",
  ".next/",
  ".vercel/",
  ".wrangler/",
  "node_modules/",
  "out/",
  "dist/",
  "coverage/",
];

const BLOCKED_FILE_NAMES = new Set([
  ".env",
  ".env.local",
  ".env.development",
  ".env.development.local",
  ".env.production",
  ".env.production.local",
  ".env.test",
  ".env.test.local",
]);

const EDITABLE_FILE =
  /\.(tsx?|jsx?|json|css|mjs|cjs|md|mdx|svg|toml|ya?ml|html|txt|example|lock|gitignore|npmrc|prettierrc|eslintrc|ico)$/i;

/** Paths the design agent may write and contributors may publish (facts stay locked). */
export function isEditableWorkspacePath(path: string): boolean {
  if (!path || path.endsWith("/")) return false;
  if (path.includes("\0") || path.includes("..")) return false;
  if (path.split("/").some((part) => BLOCKED_FILE_NAMES.has(part))) return false;
  if (isLockedFactPath(path)) return false;
  if (BLOCKED_PREFIXES.some((prefix) => path.startsWith(prefix))) return false;

  if (path.startsWith("public/")) return true;

  return EDITABLE_FILE.test(path);
}
