const GITHUB_API = "https://api.github.com";
const USER_AGENT = "popped-dev-agent-api/0.1.0";
const ALIAS_MAX_LENGTH = 28;

function parseRepoUrl(repoUrl: string): { owner: string; repo: string } {
  const match = repoUrl.match(/github\.com\/([^/]+)\/([^/.]+)/i);
  if (!match) {
    throw new Error(`Invalid GITHUB_REPO_URL: ${repoUrl}`);
  }
  return { owner: match[1], repo: match[2] };
}

function githubHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": USER_AGENT,
  };
}

/** Cloudflare Pages branch alias segment (lowercase, non-alnum → hyphen). */
export function branchToAlias(branch: string): string {
  return branch
    .toLowerCase()
    .replace(/\//g, "-")
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Heuristic Pages branch preview URL.
 * CF uses `{alias}.{project}.pages.dev` (dot, not double-dash) and truncates long aliases (~28 chars).
 */
export function branchToPreviewUrlHeuristic(branch: string, projectName: string): string {
  const alias = branchToAlias(branch).slice(0, ALIAS_MAX_LENGTH).replace(/-$/, "");
  return `https://${alias}.${projectName}.pages.dev`;
}

function extractHrefFromCheckSummary(summary: string, label: string): string | null {
  const row = new RegExp(
    `<strong>${label}:<\\/strong>[\\s\\S]*?href='([^']+)'`,
    "i",
  ).exec(summary);
  return row?.[1] ?? null;
}

async function getBranchHeadSha(
  token: string,
  owner: string,
  repo: string,
  branch: string,
): Promise<string | null> {
  const response = await fetch(
    `${GITHUB_API}/repos/${owner}/${repo}/commits/${encodeURIComponent(branch)}`,
    { headers: githubHeaders(token) },
  );
  if (!response.ok) return null;
  const data = (await response.json()) as { sha?: string };
  return data.sha ?? null;
}

async function getPagesUrlFromCheckRuns(
  token: string,
  owner: string,
  repo: string,
  sha: string,
): Promise<string | null> {
  const response = await fetch(
    `${GITHUB_API}/repos/${owner}/${repo}/commits/${sha}/check-runs?check_name=Cloudflare%20Pages`,
    { headers: githubHeaders(token) },
  );
  if (!response.ok) return null;

  const data = (await response.json()) as {
    check_runs?: Array<{ output?: { summary?: string } }>;
  };

  for (const run of data.check_runs ?? []) {
    const summary = run.output?.summary ?? "";
    const branchPreview = extractHrefFromCheckSummary(summary, "Branch Preview URL");
    if (branchPreview) return branchPreview;
    const preview = extractHrefFromCheckSummary(summary, "Preview URL");
    if (preview) return preview;
  }

  return null;
}

export async function resolvePagesPreviewUrl(options: {
  branch: string;
  projectName: string;
  repoUrl: string;
  githubToken?: string;
}): Promise<string> {
  const heuristic = branchToPreviewUrlHeuristic(options.branch, options.projectName);

  if (!options.githubToken) {
    return heuristic;
  }

  try {
    const { owner, repo } = parseRepoUrl(options.repoUrl);
    const sha = await getBranchHeadSha(options.githubToken, owner, repo, options.branch);
    if (!sha) return heuristic;

    const fromChecks = await getPagesUrlFromCheckRuns(options.githubToken, owner, repo, sha);
    return fromChecks ?? heuristic;
  } catch {
    return heuristic;
  }
}

export async function isPreviewUrlLive(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { method: "HEAD", redirect: "follow" });
    return response.ok;
  } catch {
    return false;
  }
}
