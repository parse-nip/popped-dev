import {
  findLockedFactViolations,
  isLockedFactPath,
} from "../../../shared/locked-fact-files";
import { createPullRequest } from "./github";
import { getMainHeadSha } from "./repo-publish";
import type { Env } from "./types";

const GITHUB_API = "https://api.github.com";
const USER_AGENT = "popped-dev-agent-api/0.1.0";

type FileChange = {
  path: string;
  content: string;
  action: "create" | "modify" | "delete";
};

function parseRepoUrl(repoUrl: string): { owner: string; repo: string } {
  const match = repoUrl.match(/github\.com\/([^/]+)\/([^/.]+)/i);
  if (!match) throw new Error(`Invalid GITHUB_REPO_URL: ${repoUrl}`);
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

function encodeBase64Utf8(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function isAllowedWorkspacePath(path: string): boolean {
  if (isLockedFactPath(path)) return false;
  if (path.startsWith("workers/")) return false;
  if (path.startsWith(".cursor/")) return false;
  if (path.startsWith("src/")) return true;
  if (path.startsWith("public/")) return true;
  if (path.startsWith("shared/")) return true;
  if (path === "src/app/design-overrides.css") return true;
  if (/^(package\.json|package-lock\.json|next\.config\.ts|tsconfig\.json|postcss\.config\.mjs|components\.json)$/.test(path)) {
    return true;
  }
  return false;
}

async function createMultiFileCommit(
  env: Env,
  files: Array<{ path: string; content: string }>,
  message: string,
  branch: string,
): Promise<{ sha: string; url: string }> {
  const { owner, repo } = parseRepoUrl(env.GITHUB_REPO_URL);
  const headers = {
    ...githubHeaders(env.GITHUB_TOKEN),
    "Content-Type": "application/json",
  };

  const refRes = await fetch(
    `${GITHUB_API}/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(branch)}`,
    { headers },
  );
  if (!refRes.ok) throw new Error(`Could not read ref ${branch}`);
  const refData = (await refRes.json()) as { object: { sha: string } };
  const baseSha = refData.object.sha;

  const commitRes = await fetch(
    `${GITHUB_API}/repos/${owner}/${repo}/git/commits/${baseSha}`,
    { headers },
  );
  if (!commitRes.ok) throw new Error("Could not read base commit");
  const commitData = (await commitRes.json()) as { tree: { sha: string } };

  const treeEntries = [];
  for (const file of files) {
    const blobRes = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/git/blobs`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        content: encodeBase64Utf8(file.content),
        encoding: "base64",
      }),
    });
    if (!blobRes.ok) throw new Error(`Blob create failed for ${file.path}`);
    const blob = (await blobRes.json()) as { sha: string };
    treeEntries.push({
      path: file.path,
      mode: "100644" as const,
      type: "blob" as const,
      sha: blob.sha,
    });
  }

  const treeRes = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/git/trees`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      base_tree: commitData.tree.sha,
      tree: treeEntries,
    }),
  });
  if (!treeRes.ok) throw new Error("Tree create failed");
  const tree = (await treeRes.json()) as { sha: string };

  const newCommitRes = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/git/commits`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      message,
      tree: tree.sha,
      parents: [baseSha],
    }),
  });
  if (!newCommitRes.ok) throw new Error("Commit create failed");
  const newCommit = (await newCommitRes.json()) as { sha: string; html_url?: string };

  const updateRef = await fetch(
    `${GITHUB_API}/repos/${owner}/${repo}/git/refs/heads/${encodeURIComponent(branch)}`,
    {
      method: "PATCH",
      headers,
      body: JSON.stringify({ sha: newCommit.sha }),
    },
  );
  if (!updateRef.ok) throw new Error("Ref update failed");

  return {
    sha: newCommit.sha,
    url: newCommit.html_url ?? `https://github.com/${owner}/${repo}/commit/${newCommit.sha}`,
  };
}

async function ensureBranch(
  env: Env,
  branchName: string,
  baseSha: string,
): Promise<void> {
  const { owner, repo } = parseRepoUrl(env.GITHUB_REPO_URL);
  const headers = githubHeaders(env.GITHUB_TOKEN);

  const existing = await fetch(
    `${GITHUB_API}/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(branchName)}`,
    { headers },
  );
  if (existing.ok) return;

  const create = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/git/refs`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({
      ref: `refs/heads/${branchName}`,
      sha: baseSha,
    }),
  });
  if (!create.ok && create.status !== 422) {
    throw new Error(`Could not create branch ${branchName}`);
  }
}

export async function publishWorkspaceChanges(
  env: Env,
  params: {
    baseSha: string;
    contributorName: string;
    changes: FileChange[];
    allowContentFactChanges?: boolean;
    summary?: string;
  },
): Promise<{
  commitUrl: string;
  sha: string;
  branch: string;
  prUrl?: string;
  changedPaths: string[];
}> {
  if (!env.GITHUB_TOKEN) throw new Error("GITHUB_TOKEN required");
  if (params.changes.length === 0) {
    throw new Error("No file changes to publish.");
  }

  const currentHead = await getMainHeadSha(env);
  if (currentHead !== params.baseSha) {
    throw new Error(
      "Site has changed since you started — refresh design mode and try again.",
    );
  }

  const changedPaths = params.changes.map((c) => c.path);
  const lockedViolations = findLockedFactViolations(changedPaths);
  if (lockedViolations.length > 0 && !params.allowContentFactChanges) {
    throw new Error(
      `Locked fact files cannot be published: ${lockedViolations.join(", ")}. Only presentation changes are allowed.`,
    );
  }

  for (const change of params.changes) {
    if (change.action === "delete") {
      throw new Error(`File deletion not supported in MVP: ${change.path}`);
    }
    if (!isAllowedWorkspacePath(change.path)) {
      throw new Error(`Disallowed publish path: ${change.path}`);
    }
  }

  const publishMode = env.PUBLISH_MODE ?? "commit";
  const baseBranch = env.GITHUB_DEFAULT_BRANCH ?? env.GITHUB_BRANCH ?? "main";
  const summary =
    params.summary?.trim() ||
    `Design workspace publish (${params.changes.length} file${params.changes.length === 1 ? "" : "s"})`;
  const message = `Design: ${summary} (by ${params.contributorName})`;

  const fileUpdates = params.changes
    .filter((c) => c.action !== "delete")
    .map((c) => ({ path: c.path, content: c.content }));

  if (publishMode === "pr") {
    const branchName = `design/workspace-${Date.now().toString(36)}`;
    await ensureBranch(env, branchName, params.baseSha);
    const { sha, url } = await createMultiFileCommit(
      env,
      fileUpdates,
      message,
      branchName,
    );
    const prUrl = await createPullRequest(env.GITHUB_TOKEN, env.GITHUB_REPO_URL, {
      branch: branchName,
      base: baseBranch,
      title: message,
      body: `Community design workspace publish by ${params.contributorName}.\n\nChanged files:\n${changedPaths.map((p) => `- ${p}`).join("\n")}`,
    });
    return { commitUrl: url, sha, branch: branchName, prUrl, changedPaths };
  }

  const { sha, url } = await createMultiFileCommit(
    env,
    fileUpdates,
    message,
    baseBranch,
  );
  return { commitUrl: url, sha, branch: baseBranch, changedPaths };
}
