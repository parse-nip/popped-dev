/** Structured edit operations — preview instantly, repo patch on publish. */

export type EditOperation =
  | { type: "style"; target: string; property: string; value: string; important?: boolean }
  | { type: "class_toggle"; target: string; className: string; enabled: boolean }
  | { type: "visibility"; target: string; visible: boolean }
  | {
      type: "insert_image";
      target: string;
      src: string;
      alt?: string;
      position: "start" | "end";
      className?: string;
    }
  | { type: "spacing"; target: string; padding?: string; margin?: string };

export type RepoFilePatch = {
  path: string;
  /** Merge scoped CSS block into design-overrides.css */
  cssBlock?: string;
  /** Insert snippet after exact anchor string in a TSX file */
  tsxInsertAfter?: string;
  tsxInsert?: string;
  /** Create or replace a whole file (assets, etc.) */
  content?: string;
};

export type DesignPatchTarget = {
  designId: string;
  sourceFile?: string;
};

export type DesignPatch = {
  id: string;
  kind: "edit";
  summary: string;
  target: DesignPatchTarget;
  preview: {
    operations: EditOperation[];
  };
  repo: {
    files: RepoFilePatch[];
  };
};

export const DESIGN_OVERRIDES_PATH = "src/app/design-overrides.css";

export const ALLOWED_REPO_PATHS = new Set([
  DESIGN_OVERRIDES_PATH,
  "src/components/SiteHeader.tsx",
  "src/components/locked/LockedResume.tsx",
]);

export function isAllowedRepoPath(path: string): boolean {
  if (ALLOWED_REPO_PATHS.has(path)) return true;
  if (path.startsWith("public/assets/") && path.endsWith(".svg")) return true;
  return false;
}

export function designIdSelector(designId: string): string {
  return `[data-design-id="${designId}"]`;
}

export function designSelector(designId: string): string {
  const attr = designIdSelector(designId);
  return `#locked-resume ${attr}, body ${attr}`;
}

export function createPatchId(designId: string): string {
  const slug = designId.replace(/[^a-z0-9.]+/gi, "_").slice(0, 40);
  return `patch_${slug}_${Date.now().toString(36)}`;
}

export function camelToCssProperty(property: string): string {
  return property.replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`);
}

export function operationsToCssBlock(
  operations: EditOperation[],
  designId: string,
): string {
  const selector = designSelector(designId);
  const lines: string[] = [];

  for (const op of operations) {
    if (op.type === "style") {
      lines.push(`  ${camelToCssProperty(op.property)}: ${op.value};`);
    } else if (op.type === "visibility") {
      lines.push(`  opacity: ${op.visible ? "1" : "0.35"};`);
    } else if (op.type === "spacing") {
      if (op.padding) lines.push(`  padding: ${op.padding};`);
      if (op.margin) lines.push(`  margin: ${op.margin};`);
    } else if (op.type === "class_toggle" && op.enabled) {
      lines.push(`  /* class: ${op.className} */`);
    }
  }

  if (lines.length === 0) return "";
  return `${selector} {\n${lines.join("\n")}\n}`;
}

/** Simple popped logo SVG for preview (data URI) and publish. */
export const POPPED_LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" fill="none"><rect width="32" height="32" rx="8" fill="#111"/><text x="16" y="21" text-anchor="middle" fill="#fff" font-family="system-ui,sans-serif" font-size="14" font-weight="700">P</text></svg>`;

export function poppedLogoDataUri(): string {
  return `data:image/svg+xml,${encodeURIComponent(POPPED_LOGO_SVG)}`;
}
