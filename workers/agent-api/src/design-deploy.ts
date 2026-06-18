import { getBranchHeadShaForBranch } from "./pages-preview";
import type { Env } from "./types";

function parseRepoUrl(repoUrl: string): { owner: string; repo: string } {
  const match = repoUrl.match(/github\.com\/([^/]+)\/([^/.]+)/i);
  if (!match) {
    throw new Error(`Invalid GITHUB_REPO_URL: ${repoUrl}`);
  }
  return { owner: match[1], repo: match[2] };
}

async function getPagesCheckStatus(
  token: string,
  owner: string,
  repo: string,
  sha: string,
): Promise<{ deployed: boolean; checkStatus: string | null; conclusion: string | null }> {
  const response = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/commits/${sha}/check-runs?check_name=Cloudflare%20Pages`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "popped-dev-agent-api/0.1.0",
      },
    },
  );

  if (!response.ok) {
    return { deployed: false, checkStatus: null, conclusion: null };
  }

  const data = (await response.json()) as {
    check_runs?: Array<{ status?: string; conclusion?: string | null }>;
  };

  for (const run of data.check_runs ?? []) {
    return {
      deployed: run.status === "completed" && run.conclusion === "success",
      checkStatus: run.status ?? null,
      conclusion: run.conclusion ?? null,
    };
  }

  return { deployed: false, checkStatus: null, conclusion: null };
}

/** True when the custom domain HTML includes the expected commit SHA. */
export async function isProductionServingSha(
  productionUrl: string,
  targetSha: string,
): Promise<boolean> {
  try {
    const base = productionUrl.replace(/\/$/, "");
    const response = await fetch(`${base}/?_deploy=${Date.now()}`, {
      headers: {
        Accept: "text/html",
        "Cache-Control": "no-cache",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) {
      return false;
    }

    const html = await response.text();
    return (
      html.includes(`data-deploy-sha="${targetSha}"`) ||
      html.includes(`data-deploy-sha='${targetSha}'`)
    );
  } catch {
    return false;
  }
}

export async function checkProductionDeploy(
  env: Env,
  targetSha: string,
): Promise<{ ready: boolean; phase: string; progress: number }> {
  if (!env.GITHUB_TOKEN) {
    return { ready: false, phase: "unknown", progress: 0 };
  }

  const baseRef = env.GITHUB_DEFAULT_BRANCH ?? "main";
  const mainSha = await getBranchHeadShaForBranch({
    branch: baseRef,
    repoUrl: env.GITHUB_REPO_URL,
    githubToken: env.GITHUB_TOKEN,
  });

  if (!mainSha || mainSha !== targetSha) {
    return { ready: false, phase: "waiting_for_commit", progress: 15 };
  }

  const { owner, repo } = parseRepoUrl(env.GITHUB_REPO_URL);
  const check = await getPagesCheckStatus(env.GITHUB_TOKEN, owner, repo, targetSha);

  if (check.checkStatus === "in_progress" || check.checkStatus === "queued") {
    return { ready: false, phase: "building", progress: 55 };
  }

  if (!check.deployed) {
    return { ready: false, phase: "building", progress: 35 };
  }

  const productionUrl = env.CORS_ORIGIN || "https://popped.dev";
  const live = await isProductionServingSha(productionUrl, targetSha);

  if (live) {
    return { ready: true, phase: "live", progress: 100 };
  }

  return { ready: false, phase: "propagating", progress: 85 };
}
