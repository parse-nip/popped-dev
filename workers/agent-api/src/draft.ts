import { getFileContentFromBranch, listChangedFilesOnBranch } from "./github";
import { getBranchHeadShaForBranch } from "./pages-preview";
import type { Env } from "./types";

const GLOBALS_CSS_PATH = "src/app/globals.css";

export type BranchDraftPayload = {
  branch: string;
  sha: string | null;
  css: string | null;
  changedFiles: string[];
  hasCssChanges: boolean;
  hasTsxChanges: boolean;
  ready: boolean;
};

export async function resolveBranchDraft(
  env: Env,
  branch: string,
): Promise<BranchDraftPayload> {
  const empty: BranchDraftPayload = {
    branch,
    sha: null,
    css: null,
    changedFiles: [],
    hasCssChanges: false,
    hasTsxChanges: false,
    ready: false,
  };

  if (!env.GITHUB_TOKEN) {
    return empty;
  }

  const baseRef = env.GITHUB_DEFAULT_BRANCH ?? "main";
  const { aheadBy, changedFiles } = await listChangedFilesOnBranch(
    env.GITHUB_TOKEN,
    env.GITHUB_REPO_URL,
    branch,
    baseRef,
  );

  if (aheadBy === 0) {
    return empty;
  }

  const sha = await getBranchHeadShaForBranch({
    branch,
    repoUrl: env.GITHUB_REPO_URL,
    githubToken: env.GITHUB_TOKEN,
  });

  const hasCssChanges = changedFiles.includes(GLOBALS_CSS_PATH);
  const hasTsxChanges = changedFiles.some(
    (file) => file.endsWith(".tsx") || file.endsWith(".jsx"),
  );

  let css: string | null = null;
  if (hasCssChanges) {
    const file = await getFileContentFromBranch(
      env.GITHUB_TOKEN,
      env.GITHUB_REPO_URL,
      branch,
      GLOBALS_CSS_PATH,
    );
    css = file?.content ?? null;
  }

  return {
    branch,
    sha,
    css,
    changedFiles,
    hasCssChanges,
    hasTsxChanges,
    ready: Boolean(css || hasTsxChanges),
  };
}
