import {
  getFileContentFromBranch,
} from "./github";
import {
  DESIGN_OVERRIDES_PATH,
  mergePatchesIntoCss,
  validatePatch,
  type DesignPatch,
} from "./design-patch";
import type { Env } from "./types";

function encodeBase64Utf8(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function parseRepoUrl(repoUrl: string): { owner: string; repo: string } {
  const match = repoUrl.match(/github\.com\/([^/]+)\/([^/.]+)/i);
  if (!match) {
    throw new Error(`Invalid GITHUB_REPO_URL: ${repoUrl}`);
  }
  return { owner: match[1], repo: match[2] };
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

export async function publishDesignPatches(
  env: Env,
  params: {
    acceptedPatches: DesignPatch[];
    contributorName: string;
    baseSha: string;
  },
): Promise<{ commitUrl: string; sha: string }> {
  if (!env.GITHUB_TOKEN) {
    throw new Error("GITHUB_TOKEN is required to publish design patches.");
  }

  if (params.acceptedPatches.length === 0) {
    throw new Error("No accepted patches to publish.");
  }

  for (const patch of params.acceptedPatches) {
    validatePatch(patch);
  }

  const baseRef = env.GITHUB_DEFAULT_BRANCH ?? "main";
  const currentHead = await getMainHeadSha(env);
  if (currentHead !== params.baseSha) {
    throw new Error(
      "Site has changed since you started — refresh the page and try publishing again.",
    );
  }

  const existingFile = await getFileContentFromBranch(
    env.GITHUB_TOKEN,
    env.GITHUB_REPO_URL,
    baseRef,
    DESIGN_OVERRIDES_PATH,
  );

  const existing = existingFile ?? {
    content: "/**\n * Community design overrides.\n */\n",
    sha: undefined as string | undefined,
  };

  const nextContent = mergePatchesIntoCss(existing.content, params.acceptedPatches);
  const { owner, repo } = parseRepoUrl(env.GITHUB_REPO_URL);

  const summaries = params.acceptedPatches.map((patch) => patch.summary).join("; ");
  const commitMessage = `Design: ${summaries} (by ${params.contributorName})`;

  const response = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/contents/${DESIGN_OVERRIDES_PATH}`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${env.GITHUB_TOKEN}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "popped-dev-agent-api/0.1.0",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: commitMessage,
        content: encodeBase64Utf8(nextContent),
        branch: baseRef,
        ...(existing.sha ? { sha: existing.sha } : {}),
      }),
    },
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`GitHub publish failed: ${response.status} ${body}`);
  }

  const result = (await response.json()) as {
    commit?: { sha?: string; html_url?: string };
  };

  const sha = result.commit?.sha ?? "";
  const commitUrl =
    result.commit?.html_url ??
    (sha ? `https://github.com/${owner}/${repo}/commit/${sha}` : "");

  if (!commitUrl) {
    throw new Error("Publish succeeded but no commit URL was returned.");
  }

  return { commitUrl, sha };
}

export async function publishWithAttribution(
  env: Env,
  params: {
    acceptedPatches: DesignPatch[];
    contributorName: string;
    baseSha: string;
    sessionId: string;
  },
): Promise<{ commitUrl: string }> {
  return publishDesignPatches(env, params);
}
