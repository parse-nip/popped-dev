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
): Promise<{ created: boolean }> {
  const { owner, repo } = parseRepoUrl(repoUrl);
  const encodedBranch = encodeURIComponent(branchName);

  const existing = await fetch(
    `${GITHUB_API}/repos/${owner}/${repo}/branches/${encodedBranch}`,
    { headers: githubHeaders(token) },
  );
  if (existing.ok) return { created: false };

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

  if (create.ok) return { created: true };

  // Another request may have created the branch between our check and create.
  if (create.status === 422) {
    const retry = await fetch(
      `${GITHUB_API}/repos/${owner}/${repo}/branches/${encodedBranch}`,
      { headers: githubHeaders(token) },
    );
    if (retry.ok) return { created: false };
  }

  const body = await create.text();
  throw new Error(`GitHub branch create failed: ${create.status} ${body}`);
}

/** Merge latest main into a design branch so previews inherit current site styling. */
export async function mergeMainIntoBranch(
  token: string,
  repoUrl: string,
  branchName: string,
  baseRef = "main",
): Promise<void> {
  const { owner, repo } = parseRepoUrl(repoUrl);

  const response = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/merges`, {
    method: "POST",
    headers: { ...githubHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify({
      base: branchName,
      head: baseRef,
      commit_message: `Merge ${baseRef} into ${branchName}`,
    }),
  });

  if (response.ok || response.status === 204) return;

  // Already up to date, empty merge, or conflict — continue without blocking the agent.
  if (response.status === 409) return;

  const body = await response.text();
  console.warn(`mergeMainIntoBranch skipped: ${response.status} ${body}`);
}

/** Merge a design branch into main (or another base). Returns the merge commit URL. */
export async function mergeBranchIntoBase(
  token: string,
  repoUrl: string,
  branchName: string,
  baseRef = "main",
  commitMessage?: string,
): Promise<string> {
  const { owner, repo } = parseRepoUrl(repoUrl);
  const response = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/merges`, {
    method: "POST",
    headers: { ...githubHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify({
      base: baseRef,
      head: branchName,
      commit_message:
        commitMessage ?? `Merge community design from ${branchName}`,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    if (response.status === 403) {
      throw new Error(
        `GitHub merge forbidden. Check GITHUB_TOKEN has Contents read/write on this repo and branch protection allows merges. ${body}`,
      );
    }
    if (response.status === 409) {
      throw new Error(
        `GitHub merge conflict — main may have moved ahead. Refresh and try again. ${body}`,
      );
    }
    throw new Error(`GitHub merge failed: ${response.status} ${body}`);
  }

  const data = (await response.json()) as {
    sha?: string;
    commit?: { html_url?: string };
  };
  if (data.commit?.html_url) return data.commit.html_url;
  if (data.sha) return `https://github.com/${owner}/${repo}/commit/${data.sha}`;
  throw new Error("GitHub merge succeeded but no commit URL was returned.");
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

function encodeBase64Utf8(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function decodeBase64Utf8(base64: string): string {
  const binary = atob(base64.replace(/\n/g, ""));
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export async function countCommitsAheadOfBase(
  token: string,
  repoUrl: string,
  branchName: string,
  baseRef = "main",
): Promise<number> {
  const comparison = await compareBranchToBase(token, repoUrl, branchName, baseRef);
  return comparison.aheadBy;
}

export async function listChangedFilesOnBranch(
  token: string,
  repoUrl: string,
  branchName: string,
  baseRef = "main",
): Promise<{ aheadBy: number; changedFiles: string[] }> {
  const comparison = await compareBranchToBase(token, repoUrl, branchName, baseRef);
  return { aheadBy: comparison.aheadBy, changedFiles: comparison.changedFiles };
}

export async function getFileContentFromBranch(
  token: string,
  repoUrl: string,
  branchName: string,
  path: string,
): Promise<{ content: string; sha: string } | null> {
  const { owner, repo } = parseRepoUrl(repoUrl);
  const response = await fetch(
    `${GITHUB_API}/repos/${owner}/${repo}/contents/${path}?ref=${encodeURIComponent(branchName)}`,
    { headers: githubHeaders(token) },
  );

  if (!response.ok) {
    return null;
  }

  const file = (await response.json()) as { content?: string; sha?: string };
  if (!file.content || !file.sha) {
    return null;
  }

  return { content: decodeBase64Utf8(file.content), sha: file.sha };
}

async function compareBranchToBase(
  token: string,
  repoUrl: string,
  branchName: string,
  baseRef = "main",
): Promise<{ aheadBy: number; changedFiles: string[] }> {
  const { owner, repo } = parseRepoUrl(repoUrl);
  const response = await fetch(
    `${GITHUB_API}/repos/${owner}/${repo}/compare/${encodeURIComponent(baseRef)}...${encodeURIComponent(branchName)}`,
    { headers: githubHeaders(token) },
  );
  if (!response.ok) {
    return { aheadBy: 0, changedFiles: [] };
  }
  const data = (await response.json()) as {
    ahead_by?: number;
    files?: Array<{ filename?: string }>;
  };
  const changedFiles = (data.files ?? [])
    .map((file) => file.filename)
    .filter((name): name is string => typeof name === "string");
  return { aheadBy: data.ahead_by ?? 0, changedFiles };
}

export async function findOpenPullRequestUrl(
  token: string,
  repoUrl: string,
  branchName: string,
): Promise<string | null> {
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

  const pulls = (await response.json()) as Array<{ html_url?: string }>;
  return pulls[0]?.html_url ?? null;
}

export async function createPullRequest(
  token: string,
  repoUrl: string,
  options: {
    branch: string;
    base?: string;
    title: string;
    body: string;
  },
): Promise<string> {
  const { owner, repo } = parseRepoUrl(repoUrl);
  const response = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/pulls`, {
    method: "POST",
    headers: { ...githubHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify({
      title: options.title,
      head: options.branch,
      base: options.base ?? "main",
      body: options.body,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`GitHub PR create failed: ${response.status} ${body}`);
  }

  const pull = (await response.json()) as { html_url?: string };
  if (!pull.html_url) {
    throw new Error("GitHub PR create succeeded but no URL was returned.");
  }
  return pull.html_url;
}

type ContributionsFile = {
  contributions: Array<{
    id: string;
    name: string;
    branch: string;
    submittedAt: string;
  }>;
};

/** Append contributor attribution on the design branch via GitHub Contents API. */
export async function appendContributionEntry(
  token: string,
  repoUrl: string,
  branchName: string,
  contributorName: string,
): Promise<void> {
  const { owner, repo } = parseRepoUrl(repoUrl);
  const path = "src/data/contributions.json";

  const response = await fetch(
    `${GITHUB_API}/repos/${owner}/${repo}/contents/${path}?ref=${encodeURIComponent(branchName)}`,
    { headers: githubHeaders(token) },
  );

  let fileSha: string | undefined;
  let payload: ContributionsFile = { contributions: [] };

  if (response.ok) {
    const file = (await response.json()) as { content?: string; sha?: string };
    if (file.content && file.sha) {
      fileSha = file.sha;
      payload = JSON.parse(decodeBase64Utf8(file.content)) as ContributionsFile;
      if (!Array.isArray(payload.contributions)) {
        payload = { contributions: [] };
      }
    }
  } else if (response.status !== 404) {
    const body = await response.text();
    throw new Error(`GitHub contents read failed: ${response.status} ${body}`);
  }

  const slug = contributorName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 32);
  const entryId = `${slug || "contributor"}-${Date.now()}`;

  if (!payload.contributions.some((entry) => entry.branch === branchName)) {
    payload.contributions.push({
      id: entryId,
      name: contributorName,
      branch: branchName,
      submittedAt: new Date().toISOString(),
    });
  }

  const nextContent = `${JSON.stringify(payload, null, 2)}\n`;
  const write = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/contents/${path}`, {
    method: "PUT",
    headers: { ...githubHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify({
      message: `Add contribution attribution for ${contributorName}`,
      content: encodeBase64Utf8(nextContent),
      branch: branchName,
      sha: fileSha,
    }),
  });

  if (!write.ok) {
    const body = await write.text();
    throw new Error(`GitHub contents write failed: ${write.status} ${body}`);
  }
}
