import {
  DESIGN_OVERRIDES_PATH,
  designIdSelector,
  isAllowedRepoPath,
  operationsToCssBlock,
  type DesignPatch,
} from "../../../shared/edit-operations";

export type { DesignPatch, EditOperation, RepoFilePatch } from "../../../shared/edit-operations";
export {
  createPatchId,
  designSelector,
  designIdSelector,
  DESIGN_OVERRIDES_PATH,
  operationsToCssBlock,
} from "../../../shared/edit-operations";

export type SelectedElementPayload = {
  designId: string;
  tagName: string;
  text: string;
  selector: string;
  sourceFile?: string;
  hasFactId: boolean;
  computedStyle: Record<string, string>;
};

export function validatePatch(patch: DesignPatch): void {
  if (patch.kind !== "edit") {
    throw new Error("Only edit patches are supported");
  }

  for (const file of patch.repo.files) {
    if (!isAllowedRepoPath(file.path)) {
      throw new Error(`Disallowed repo path: ${file.path}`);
    }
    if (file.cssBlock && !file.cssBlock.includes(designIdSelector(patch.target.designId))) {
      throw new Error("Repo CSS must be scoped to designId");
    }
  }
}

export function parseDesignPatch(value: unknown): DesignPatch | null {
  if (!value || typeof value !== "object") return null;
  const patch = value as Partial<DesignPatch>;
  if (
    typeof patch.id !== "string" ||
    patch.kind !== "edit" ||
    !patch.target ||
    typeof patch.target.designId !== "string" ||
    typeof patch.summary !== "string" ||
    !patch.preview ||
    !Array.isArray(patch.preview.operations) ||
    !patch.repo ||
    !Array.isArray(patch.repo.files)
  ) {
    return null;
  }
  return patch as DesignPatch;
}

export function createPatchBlock(patchId: string, css: string): string {
  return `/* popped.design:start id=${patchId} */
${css.trim()}
/* popped.design:end id=${patchId} */`;
}

export function mergeCssBlock(existing: string, patchId: string, cssBlock: string): string {
  let content = existing.trim();
  const start = `/* popped.design:start id=${patchId} */`;
  const end = `/* popped.design:end id=${patchId} */`;
  const block = createPatchBlock(patchId, cssBlock);
  const startIdx = content.indexOf(start);
  if (startIdx !== -1) {
    const endIdx = content.indexOf(end, startIdx);
    if (endIdx !== -1) {
      content =
        content.slice(0, startIdx).trimEnd() +
        "\n\n" +
        block +
        content.slice(endIdx + end.length).trimStart();
      return `${content.trim()}\n`;
    }
  }
  content = content ? `${content}\n\n${block}` : block;
  return `${content.trim()}\n`;
}

/** Merge all patch repo CSS + generated CSS from operations into design-overrides.css */
export function mergeAllPatchCss(existing: string, patches: DesignPatch[]): string {
  let content = existing.trim();
  for (const patch of patches) {
    let merged = false;
    for (const file of patch.repo.files) {
      if (file.path === DESIGN_OVERRIDES_PATH && file.cssBlock) {
        content = mergeCssBlock(content, patch.id, file.cssBlock);
        merged = true;
      }
    }
    if (!merged) {
      const generated = operationsToCssBlock(patch.preview.operations, patch.target.designId);
      if (generated) {
        content = mergeCssBlock(content, patch.id, generated);
      }
    }
  }
  return `${content.trim()}\n`;
}

export function createPatchBlockLegacy(patch: DesignPatch): string {
  const css =
    patch.repo.files.find((f) => f.path === DESIGN_OVERRIDES_PATH)?.cssBlock ??
    operationsToCssBlock(patch.preview.operations, patch.target.designId);
  return createPatchBlock(patch.id, css);
}
