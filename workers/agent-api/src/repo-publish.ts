import { getFileContentFromBranch } from "./github";
import {
  DESIGN_OVERRIDES_PATH,
  mergeAllPatchCss,
  validatePatch,
  type DesignPatch,
} from "./design-patch";
import type { Env } from "./types";
import { isAllowedRepoPath } from "../../../shared/edit-operations";

function parseRepoUrl(repoUrl: string): { owner: string; repo: string } {
  const match = repoUrl.match(/github\.com\/([^/]+)\/([^/.]+)/i);
  if (!match) throw new Error(`Invalid GITHUB_REPO_URL: ${repoUrl}`);
  return { owner: match[1], repo: match[2] };
}

function encodeBase64Utf8(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

const DEFAULT_OVERRIDES = `/**
 * Community design overrides — appended at publish time.
 * Do not edit locked facts; CSS-only presentation changes scoped to data-design-id.
 */
`;

type FileUpdate = { path: string; content: string };

function applyTsxInsert(content: string, insertAfter: string, insert: string): string {
  if (content.includes(insert.trim())) return content;
  const idx = content.indexOf(insertAfter);
  if (idx === -1) {
    throw new Error(`TSX anchor not found: ${insertAfter.slice(0, 40)}…`);
  }
  const at = idx + insertAfter.length;
  return content.slice(0, at) + insert + content.slice(at);
}

export async function getMainHeadSha(env: Env): Promise<string> {
  const baseRef = env.GITHUB_DEFAULT_BRANCH ?? "main";
  const { owner, repo } = parseRepoUrl(env.GITHUB_REPO_URL);
  const response = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(baseRef)}`,
    {
      headers: {
        Authorization: `Bearer ${env.GITHUB_TOKEN}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "popped-dev-agent-api/0.1.0",
      },
    },
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Could not read ${baseRef} HEAD: ${response.status} ${body}`);
  }

  const data = (await response.json()) as { object?: { sha?: string } };
  if (!data.object?.sha) {
    throw new Error(`Could not read ${baseRef} HEAD SHA`);
  }
  return data.object.sha;
}

export function buildPublishFileUpdates(
  patches: DesignPatch[],
  existingByPath: Map<string, string>,
): FileUpdate[] {
  const updates = new Map<string, string>();

  let overrides =
    existingByPath.get(DESIGN_OVERRIDES_PATH) ?? DEFAULT_OVERRIDES;
  overrides = mergeAllPatchCss(overrides, patches);
  updates.set(DESIGN_OVERRIDES_PATH, overrides);

  for (const patch of patches) {
    for (const file of patch.repo.files) {
      if (file.path === DESIGN_OVERRIDES_PATH) continue;

      if (file.content !== undefined) {
        updates.set(file.path, file.content);
        continue;
      }

      if (file.tsxInsertAfter && file.tsxInsert) {
        const current = updates.get(file.path) ?? existingByPath.get(file.path) ?? "";
        if (!current) {
          throw new Error(`Missing repo file for TSX insert: ${file.path}`);
        }
        updates.set(file.path, applyTsxInsert(current, file.tsxInsertAfter, file.tsxInsert));
      }
    }
  }

  return [...updates.entries()].map(([path, content]) => ({ path, content }));
}

async function createMultiFileCommit(
  env: Env,
  files: FileUpdate[],
  message: string,
): Promise<{ sha: string; url: string }> {
  if (!env.GITHUB_TOKEN) throw new Error("GITHUB_TOKEN required");

  const { owner, repo } = parseRepoUrl(env.GITHUB_REPO_URL);
  const baseRef = env.GITHUB_DEFAULT_BRANCH ?? "main";
  const headers = {
    Authorization: `Bearer ${env.GITHUB_TOKEN}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "popped-dev-agent-api/0.1.0",
    "Content-Type": "application/json",
  };

  const refRes = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(baseRef)}`,
    { headers },
  );
  if (!refRes.ok) throw new Error(`Could not read ref ${baseRef}`);
  const refData = (await refRes.json()) as { object: { sha: string } };
  const baseSha = refData.object.sha;

  const commitRes = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/git/commits/${baseSha}`,
    { headers },
  );
  if (!commitRes.ok) throw new Error("Could not read base commit");
  const commitData = (await commitRes.json()) as { tree: { sha: string } };

  const treeEntries = [];
  for (const file of files) {
    if (!isAllowedRepoPath(file.path)) {
      throw new Error(`Disallowed publish path: ${file.path}`);
    }
    const blobRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/blobs`, {
      method: "POST",
      headers,
      body: JSON.stringify({ content: encodeBase64Utf8(file.content), encoding: "base64" }),
    });
    if (!blobRes.ok) throw new Error(`Blob create failed for ${file.path}`);
    const blob = (await blobRes.json()) as { sha: string };
    treeEntries.push({ path: file.path, mode: "100644" as const, type: "blob" as const, sha: blob.sha });
  }

  const treeRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/trees`, {
    method: "POST",
    headers,
    body: JSON.stringify({ base_tree: commitData.tree.sha, tree: treeEntries }),
  });
  if (!treeRes.ok) throw new Error("Tree create failed");
  const tree = (await treeRes.json()) as { sha: string };

  const newCommitRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/commits`, {
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
    `https://api.github.com/repos/${owner}/${repo}/git/refs/heads/${encodeURIComponent(baseRef)}`,
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

export async function publishDesignPatches(
  env: Env,
  params: {
    acceptedPatches: DesignPatch[];
    contributorName: string;
    baseSha: string;
  },
): Promise<{ commitUrl: string; sha: string }> {
  if (params.acceptedPatches.length === 0) {
    throw new Error("No accepted patches to publish.");
  }

  for (const patch of params.acceptedPatches) {
    validatePatch(patch);
  }

  const currentHead = await getMainHeadSha(env);
  if (currentHead !== params.baseSha) {
    throw new Error(
      "Site has changed since you started — refresh the page and try publishing again.",
    );
  }

  const baseRef = env.GITHUB_DEFAULT_BRANCH ?? "main";
  const paths = new Set<string>([DESIGN_OVERRIDES_PATH]);
  for (const patch of params.acceptedPatches) {
    for (const file of patch.repo.files) {
      paths.add(file.path);
    }
  }

  const existingByPath = new Map<string, string>();
  for (const path of paths) {
    if (path.startsWith("public/assets/")) continue;
    const file = await getFileContentFromBranch(
      env.GITHUB_TOKEN!,
      env.GITHUB_REPO_URL,
      baseRef,
      path,
    );
    if (file) existingByPath.set(path, file.content);
  }

  const updates = buildPublishFileUpdates(params.acceptedPatches, existingByPath);
  const summaries = params.acceptedPatches.map((p) => p.summary).join("; ");
  const message = `Design: ${summaries} (by ${params.contributorName})`;

  const { sha, url } = await createMultiFileCommit(env, updates, message);
  return { commitUrl: url, sha };
}

export async function publishWithAttribution(
  env: Env,
  params: {
    acceptedPatches: DesignPatch[];
    contributorName: string;
    baseSha: string;
    sessionId: string;
  },
): Promise<{ commitUrl: string; sha: string }> {
  return publishDesignPatches(env, params);
}
