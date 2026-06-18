const COMPOSITION_ROOTS = [
  "src/components/HomeShell.tsx",
  "src/app/layout.tsx",
  "src/app/page.tsx",
  "src/components/community/CommunityChrome.tsx",
] as const;

const SKIP_COMMUNITY_FILES = new Set([
  "CommunityChrome.tsx",
  "ContributionAttributionLayer.tsx",
  "ContributorNameControl.tsx",
  "WelcomeIntro.tsx",
  "DesignSwitchPreview.tsx",
]);

function componentSymbolFromPath(path: string): string {
  const file = path.split("/").pop() ?? path;
  return file.replace(/\.tsx$/, "");
}

function isReferenced(symbol: string, haystack: string): boolean {
  if (!symbol || !haystack) return false;
  return (
    haystack.includes(`/${symbol}"`) ||
    haystack.includes(`/${symbol}'`) ||
    haystack.includes(`<${symbol}`) ||
    haystack.includes(`<${symbol} `) ||
    haystack.includes(`from "@/components/community/${symbol}"`) ||
    haystack.includes(`from '@/components/community/${symbol}'`) ||
    haystack.includes(`from "./${symbol}"`) ||
    haystack.includes(`from './${symbol}'`)
  );
}

/** New community components that are not imported/rendered from a composition root. */
export function findUnwiredCommunityComponents(
  writes: Array<{ path: string; content: string }>,
  files: Record<string, string>,
): string[] {
  const createdCommunity = writes
    .map((write) => write.path)
    .filter(
      (path) =>
        path.startsWith("src/components/community/") &&
        path.endsWith(".tsx") &&
        !SKIP_COMMUNITY_FILES.has(componentSymbolFromPath(path)),
    );

  if (createdCommunity.length === 0) return [];

  const compositionContent = COMPOSITION_ROOTS.map((path) => files[path] ?? "").join("\n");
  const writeContent = writes.map((write) => write.content).join("\n");
  const haystack = `${compositionContent}\n${writeContent}`;

  return createdCommunity.filter((path) => {
    const symbol = componentSymbolFromPath(path);
    return !isReferenced(symbol, haystack);
  });
}

export function formatUnwiredComponentsMessage(paths: string[]): string {
  const names = paths.map(componentSymbolFromPath).join(", ");
  return `${names} ${paths.length === 1 ? "was" : "were"} created but ${paths.length === 1 ? "isn't" : "aren't"} wired into the page yet — connect via CommunityChrome.tsx or HomeShell.tsx.`;
}
