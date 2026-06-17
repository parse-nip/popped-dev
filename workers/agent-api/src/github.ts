const GITHUB_API = "https://api.github.com";
const USER_AGENT = "popped-dev-agent-api/0.1.0";

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

/** Ensure a branch exists before passing it as Cursor startingRef with workOnCurrentBranch. */
export async function ensureGitBranch(
  token: string,
  repoUrl: string,
  branchName: string,
  baseRef = "main",
): Promise<void> {
  const { owner, repo } = parseRepoUrl(repoUrl);
  const encodedBranch = encodeURIComponent(branchName);

  const existing = await fetch(
    `${GITHUB_API}/repos/${owner}/${repo}/branches/${encodedBranch}`,
    { headers: githubHeaders(token) },
  );
  if (existing.ok) return;

  const base = await fetch(
    `${GITHUB_API}/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(baseRef)}`,
    { headers: githubHeaders(token) },
  );
  if (!base.ok) {
    const body = await base.text();
    if (base.status === 403) {
      throw new Error(
        `GitHub API forbidden for base ref "${baseRef}". Check GITHUB_TOKEN scope (needs repo contents:write) and org access rules. ${body}`,
      );
    }
    throw new Error(`GitHub base ref "${baseRef}" not found: ${base.status} ${body}`);
  }

  const baseData = (await base.json()) as { object: { sha: string } };
  const create = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/git/refs`, {
    method: "POST",
    headers: { ...githubHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify({
      ref: `refs/heads/${branchName}`,
      sha: baseData.object.sha,
    }),
  });

  if (create.ok) return;

  // Another request may have created the branch between our check and create.
  if (create.status === 422) {
    const retry = await fetch(
      `${GITHUB_API}/repos/${owner}/${repo}/branches/${encodedBranch}`,
      { headers: githubHeaders(token) },
    );
    if (retry.ok) return;
  }

  const body = await create.text();
  throw new Error(`GitHub branch create failed: ${create.status} ${body}`);
}

export async function deleteGitBranch(
  token: string,
  repoUrl: string,
  branchName: string,
): Promise<void> {
  const { owner, repo } = parseRepoUrl(repoUrl);
  const response = await fetch(
    `${GITHUB_API}/repos/${owner}/${repo}/git/refs/heads/${branchName}`,
    { method: "DELETE", headers: githubHeaders(token) },
  );

  if (response.ok || response.status === 404) return;

  const body = await response.text();
  throw new Error(`GitHub branch delete failed: ${response.status} ${body}`);
}

export async function branchHasOpenPullRequest(
  token: string,
  repoUrl: string,
  branchName: string,
): Promise<boolean> {
  const { owner, repo } = parseRepoUrl(repoUrl);
  const head = encodeURIComponent(`${owner}:${branchName}`);
  const response = await fetch(
    `${GITHUB_API}/repos/${owner}/${repo}/pulls?state=open&head=${head}&per_page=1`,
    { headers: githubHeaders(token) },
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`GitHub PR lookup failed: ${response.status} ${body}`);
  }

  const pulls = (await response.json()) as unknown[];
  return pulls.length > 0;
}

export async function listDesignBranchRefs(
  token: string,
  repoUrl: string,
): Promise<string[]> {
  const { owner, repo } = parseRepoUrl(repoUrl);
  const response = await fetch(
    `${GITHUB_API}/repos/${owner}/${repo}/git/matching-refs/heads/cursor/design`,
    { headers: githubHeaders(token) },
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`GitHub branch list failed: ${response.status} ${body}`);
  }

  const refs = (await response.json()) as Array<{ ref: string }>;
  return refs
    .map((item) => item.ref.replace(/^refs\/heads\//, ""))
    .filter((branch) => branch.startsWith("cursor/design/"));
}
