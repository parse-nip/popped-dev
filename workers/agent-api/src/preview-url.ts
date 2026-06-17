const DEFAULT_PROJECT = "popped-dev";

/** Stable branch name for a visitor design session. */
export function branchForSession(sessionId: string): string {
  return `cursor/design/${sessionId}`;
}

/**
 * Normalize a git branch name to a Cloudflare Pages preview alias segment.
 * Example: cursor/design/abc123 → cursor-design-abc123
 */
export function branchToAlias(branch: string): string {
  return branch
    .toLowerCase()
    .replace(/\//g, "-")
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Construct a stable branch-alias preview URL for Cloudflare Pages.
 * CF uses `{alias}.{project}.pages.dev` and truncates aliases to ~28 chars.
 */
export function branchToPreviewUrl(branch: string, projectName = DEFAULT_PROJECT): string {
  const alias = branchToAlias(branch).slice(0, 28).replace(/-$/, "");
  return `https://${alias}.${projectName}.pages.dev`;
}
