import type { FileChange } from "./types";

/** Ignore zip directory entries and other non-file paths in diffs. */
function isDiffablePath(path: string): boolean {
  return Boolean(path) && !path.endsWith("/");
}

function normalizeFileContent(content: string): string {
  return content.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trimEnd();
}

export function computeFileChanges(
  original: Record<string, string>,
  current: Record<string, string>,
): FileChange[] {
  const changes: FileChange[] = [];
  const allPaths = new Set([
    ...Object.keys(original).filter(isDiffablePath),
    ...Object.keys(current).filter(isDiffablePath),
  ]);

  for (const path of allPaths) {
    const before = original[path];
    const after = current[path];

    if (before === undefined && after !== undefined) {
      changes.push({ path, content: after, action: "create" });
    } else if (before !== undefined && after === undefined) {
      changes.push({ path, content: "", action: "delete" });
    } else if (
      before !== undefined &&
      after !== undefined &&
      normalizeFileContent(before) !== normalizeFileContent(after)
    ) {
      changes.push({ path, content: after, action: "modify" });
    }
  }

  return changes.sort((a, b) => a.path.localeCompare(b.path));
}

export function summarizeDiff(changes: FileChange[]): string {
  if (changes.length === 0) return "No changes yet.";
  return changes
    .map((change) => {
      const verb =
        change.action === "create"
          ? "added"
          : change.action === "delete"
            ? "removed"
            : "modified";
      return `${verb} ${change.path}`;
    })
    .join("\n");
}

export function countDiffLines(before: string, after: string): { added: number; removed: number } {
  const beforeLines = before.split("\n");
  const afterLines = after.split("\n");
  const beforeSet = new Set(beforeLines);
  const afterSet = new Set(afterLines);
  let added = 0;
  let removed = 0;
  for (const line of afterLines) {
    if (!beforeSet.has(line)) added++;
  }
  for (const line of beforeLines) {
    if (!afterSet.has(line)) removed++;
  }
  return { added, removed };
}
