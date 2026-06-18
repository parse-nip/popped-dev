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

type PagesCheckStatus = {
  previewUrl: string | null;
  deployed: boolean;
  sha: string | null;
  checkStatus: string | null;
  conclusion: string | null;
};

export type BranchDeployStatus = {
  previewUrl: string;
  ready: boolean;
  sha: string | null;
  progress: number;
  phase: "waiting_for_push" | "queued" | "building" | "live" | "failed";
};

function deployProgressFromCheck(
  hasSha: boolean,
  checkStatus: string | null,
  conclusion: string | null,
  deployed: boolean,
  liveVerified: boolean,
): { progress: number; phase: BranchDeployStatus["phase"] } {
  if (!hasSha) {
    return { progress: 8, phase: "waiting_for_push" };
  }
  if (!checkStatus) {
    return { progress: 18, phase: "queued" };
  }
  if (checkStatus === "queued") {
    return { progress: 28, phase: "queued" };
  }
  if (checkStatus === "in_progress") {
    return { progress: 62, phase: "building" };
  }
  if (checkStatus === "completed" && conclusion === "success") {
    if (liveVerified || deployed) {
      return { progress: 100, phase: "live" };
    }
    return { progress: 92, phase: "building" };
  }
  if (checkStatus === "completed" && conclusion && conclusion !== "success") {
    return { progress: 0, phase: "failed" };
  }
  return { progress: 40, phase: "building" };
}

async function getPagesCheckStatus(
  token: string,
  owner: string,
  repo: string,
  sha: string,
): Promise<PagesCheckStatus> {
  const response = await fetch(
    `${GITHUB_API}/repos/${owner}/${repo}/commits/${sha}/check-runs?check_name=Cloudflare%20Pages`,
    { headers: githubHeaders(token) },
  );
  if (!response.ok) {
    return { previewUrl: null, deployed: false, sha, checkStatus: null, conclusion: null };
  }

  const data = (await response.json()) as {
    check_runs?: Array<{
      status?: string;
      conclusion?: string | null;
      output?: { summary?: string };
    }>;
  };

  for (const run of data.check_runs ?? []) {
    const summary = run.output?.summary ?? "";
    const branchPreview = extractHrefFromCheckSummary(summary, "Branch Preview URL");
    const preview = extractHrefFromCheckSummary(summary, "Preview URL");
    const previewUrl = branchPreview ?? preview;
    const deployed = run.status === "completed" && run.conclusion === "success";
    return {
      previewUrl,
      deployed,
      sha,
      checkStatus: run.status ?? null,
      conclusion: run.conclusion ?? null,
    };
  }

  return { previewUrl: null, deployed: false, sha, checkStatus: null, conclusion: null };
}

/** One-shot deploy status for a branch (no long poll). */
export async function checkBranchPreviewDeploy(options: {
  branch: string;
  projectName: string;
  repoUrl: string;
  githubToken?: string;
}): Promise<BranchDeployStatus> {
  const heuristic = branchToPreviewUrlHeuristic(options.branch, options.projectName);

  if (!options.githubToken) {
    const liveVerified = await isPreviewUrlLive(heuristic);
    return {
      previewUrl: heuristic,
      ready: liveVerified,
      sha: null,
      progress: liveVerified ? 100 : 35,
      phase: liveVerified ? "live" : "building",
    };
  }

  const { owner, repo } = parseRepoUrl(options.repoUrl);
  const sha = await getBranchHeadSha(options.githubToken, owner, repo, options.branch);
  if (!sha) {
    return {
      previewUrl: heuristic,
      ready: false,
      sha: null,
      progress: 8,
      phase: "waiting_for_push",
    };
  }

  const check = await getPagesCheckStatus(options.githubToken, owner, repo, sha);
  const previewUrl = check.previewUrl ?? heuristic;
  const githubReady = check.deployed && Boolean(previewUrl);
  const liveVerified = githubReady ? await isPreviewUrlLive(previewUrl) : false;
  const ready = githubReady && (liveVerified || check.deployed);
  const { progress, phase } = deployProgressFromCheck(
    true,
    check.checkStatus,
    check.conclusion,
    check.deployed,
    liveVerified,
  );

  return { previewUrl, ready, sha, progress, phase };
}

/** Poll until Cloudflare Pages reports a successful deploy for the branch head. */
export async function waitForBranchPreviewDeploy(options: {
  branch: string;
  projectName: string;
  repoUrl: string;
  githubToken?: string;
  maxAttempts?: number;
  intervalMs?: number;
}): Promise<BranchDeployStatus> {
  const maxAttempts = options.maxAttempts ?? 36;
  const intervalMs = options.intervalMs ?? 1500;
  const heuristic = branchToPreviewUrlHeuristic(options.branch, options.projectName);

  if (!options.githubToken) {
    const liveVerified = await isPreviewUrlLive(heuristic);
    return {
      previewUrl: heuristic,
      ready: liveVerified,
      sha: null,
      progress: liveVerified ? 100 : 35,
      phase: liveVerified ? "live" : "building",
    };
  }

  const { owner, repo } = parseRepoUrl(options.repoUrl);

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const sha = await getBranchHeadSha(options.githubToken, owner, repo, options.branch);
    if (!sha) {
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
      continue;
    }

    const check = await getPagesCheckStatus(options.githubToken, owner, repo, sha);
    const previewUrl = check.previewUrl ?? heuristic;
    const githubReady = check.deployed && Boolean(previewUrl);
    const liveVerified = githubReady ? await isPreviewUrlLive(previewUrl) : false;

    if (githubReady && (liveVerified || check.deployed)) {
      return {
        previewUrl,
        ready: true,
        sha,
        progress: 100,
        phase: "live",
      };
    }

    const { progress, phase } = deployProgressFromCheck(
      true,
      check.checkStatus,
      check.conclusion,
      check.deployed,
      liveVerified,
    );

    if (attempt === maxAttempts - 1) {
      return { previewUrl, ready: false, sha, progress, phase };
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  const previewUrl = await resolvePagesPreviewUrl(options);
  const liveVerified = await isPreviewUrlLive(previewUrl);
  return {
    previewUrl,
    ready: liveVerified,
    sha: null,
    progress: liveVerified ? 100 : 55,
    phase: liveVerified ? "live" : "building",
  };
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
    const response = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
      signal: AbortSignal.timeout(4_000),
    });
    return response.ok;
  } catch {
    return false;
  }
}
