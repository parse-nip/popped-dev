import { unzipSync } from "fflate";
import type { Env } from "./types";
import { isEditableWorkspacePath } from "../../../shared/editable-workspace-paths";
import { isLockedFactPath } from "../../../shared/locked-fact-files";

const EXCLUDED_PREFIXES = [
  "node_modules/",
  ".git/",
  ".next/",
  "out/",
  "dist/",
  "coverage/",
  ".vercel/",
  ".wrangler/",
];

const TEXT_FILE =
  /\.(tsx?|jsx?|json|css|mjs|cjs|md|svg|toml|example|html|txt|ico)$/i;

function parseRepoUrl(repoUrl: string): { owner: string; repo: string } {
  const match = repoUrl.match(/github\.com\/([^/]+)\/([^/.]+)/i);
  if (!match) throw new Error(`Invalid GITHUB_REPO_URL: ${repoUrl}`);
  return { owner: match[1], repo: match[2] };
}

function shouldIncludePath(path: string): boolean {
  if (!path || path.endsWith("/")) return false;
  if (EXCLUDED_PREFIXES.some((prefix) => path.startsWith(prefix))) {
    return false;
  }
  if (path.includes("node_modules")) return false;
  if (isLockedFactPath(path)) return path === "src/locked/experience.json";
  if (isEditableWorkspacePath(path)) return true;

  if (!path.includes("/")) {
    return TEXT_FILE.test(path) || /^(package\.json|package-lock\.json)$/.test(path);
  }
  if (path.startsWith("src/")) return TEXT_FILE.test(path);
  if (path.startsWith("public/")) return true;
  if (path.startsWith("shared/")) return TEXT_FILE.test(path);
  if (path.startsWith("scripts/")) return TEXT_FILE.test(path);
  return false;
}

function stripArchivePrefix(entries: Record<string, Uint8Array>): Record<string, Uint8Array> {
  const paths = Object.keys(entries);
  if (paths.length === 0) return entries;

  const first = paths[0];
  const slash = first.indexOf("/");
  if (slash === -1) return entries;

  const prefix = first.slice(0, slash + 1);
  const stripped: Record<string, Uint8Array> = {};
  for (const [path, data] of Object.entries(entries)) {
    if (!path.startsWith(prefix)) continue;
    const relative = path.slice(prefix.length);
    if (relative) stripped[relative] = data;
  }
  return stripped;
}

export type ProjectFilesResult = {
  files: Record<string, string>;
  baseSha: string;
  branch: string;
};

export async function fetchProjectFiles(env: Env): Promise<ProjectFilesResult> {
  if (!env.GITHUB_TOKEN) throw new Error("GITHUB_TOKEN required");

  const branch = env.GITHUB_DEFAULT_BRANCH ?? env.GITHUB_BRANCH ?? "main";
  const { owner, repo } = parseRepoUrl(env.GITHUB_REPO_URL);

  const refRes = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(branch)}`,
    {
      headers: {
        Authorization: `Bearer ${env.GITHUB_TOKEN}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "popped-dev-agent-api/0.1.0",
      },
    },
  );
  if (!refRes.ok) {
    throw new Error(`Could not read branch ${branch}: ${refRes.status}`);
  }
  const refData = (await refRes.json()) as { object?: { sha?: string } };
  const baseSha = refData.object?.sha;
  if (!baseSha) throw new Error(`Missing HEAD SHA for ${branch}`);

  const archiveRes = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/zipball/${encodeURIComponent(branch)}`,
    {
      headers: {
        Authorization: `Bearer ${env.GITHUB_TOKEN}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "popped-dev-agent-api/0.1.0",
      },
      redirect: "follow",
    },
  );
  if (!archiveRes.ok) {
    throw new Error(`Could not download repo archive: ${archiveRes.status}`);
  }

  const archiveBytes = new Uint8Array(await archiveRes.arrayBuffer());
  const extracted = stripArchivePrefix(unzipSync(archiveBytes));

  const files: Record<string, string> = {};
  const decoder = new TextDecoder();

  for (const [path, bytes] of Object.entries(extracted)) {
    if (!shouldIncludePath(path)) continue;
    try {
      files[path] = decoder.decode(bytes);
    } catch {
      // skip non-text
    }
  }

  return { files, baseSha, branch };
}
