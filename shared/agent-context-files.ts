import { isEditableWorkspacePath } from "./editable-workspace-paths";

const BOOTSTRAP_PATHS = [
  "package.json",
  "src/app/layout.tsx",
  "src/app/page.tsx",
  "src/app/globals.css",
  "src/app/design-overrides.css",
  "src/components/SiteHeader.tsx",
  "src/components/community/CommunityChrome.tsx",
  "src/components/locked/LockedResume.tsx",
  "src/locked/experience.json",
  "shared/editable-workspace-paths.ts",
  "workers/agent-api/src/index.ts",
  "workers/agent-api/src/agent-edit.ts",
  "workers/agent-api/src/project-files.ts",
  "workers/agent-api/package.json",
];

const PRIORITY_MAX_CHARS = 16_000;
const DEFAULT_MAX_CHARS = 10_000;
const TOTAL_CHAR_BUDGET = 400_000;

function truncateContent(content: string, maxChars: number): string {
  if (content.length <= maxChars) return content;
  return `${content.slice(0, maxChars)}\n/* … truncated (${content.length} chars total) */`;
}

function orderEditablePaths(
  allFiles: Record<string, string>,
  extraPaths: string[],
): string[] {
  const ordered: string[] = [];
  const seen = new Set<string>();

  const push = (path: string) => {
    if (!allFiles[path] || !isEditableWorkspacePath(path) || seen.has(path)) return;
    ordered.push(path);
    seen.add(path);
  };

  for (const path of extraPaths) push(path);
  for (const path of BOOTSTRAP_PATHS) push(path);

  for (const path of Object.keys(allFiles).sort((a, b) => a.localeCompare(b))) {
    push(path);
  }

  return ordered;
}

/** Full editable workspace context for the design agent (truncated to fit model limits). */
export function pickAgentContextFiles(
  allFiles: Record<string, string>,
  extraPaths: string[] = [],
): Record<string, string> {
  const priority = new Set<string>([...BOOTSTRAP_PATHS, ...extraPaths]);
  const ordered = orderEditablePaths(allFiles, extraPaths);
  const picked: Record<string, string> = {};
  let budget = TOTAL_CHAR_BUDGET;

  for (const path of ordered) {
    if (budget <= 0) break;

    const raw = allFiles[path];
    const maxChars = priority.has(path) ? PRIORITY_MAX_CHARS : DEFAULT_MAX_CHARS;
    let content = truncateContent(raw, maxChars);

    if (content.length > budget) {
      content = truncateContent(content, Math.max(400, budget - 64));
    }

    budget -= content.length;
    picked[path] = content;
  }

  return picked;
}

export function orderAgentContextPaths(
  files: Record<string, string>,
  sourceFile?: string,
): string[] {
  return Object.keys(files).sort((a, b) => {
    if (a === sourceFile) return -1;
    if (b === sourceFile) return 1;
    if (a === "package.json") return -1;
    if (b === "package.json") return 1;
    if (a === "src/app/layout.tsx") return -1;
    if (b === "src/app/layout.tsx") return 1;
    return a.localeCompare(b);
  });
}
