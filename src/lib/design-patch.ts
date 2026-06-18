import type { DesignPatch, DesignPatchTarget } from "@shared/edit-operations";
import {
  applyPreviewOperations,
  clearAllPreviewPatches,
  reapplyPreviewPatches,
  removePreviewPatch,
} from "@/lib/preview-engine";

export type {
  DesignPatch,
  DesignPatchTarget,
  EditOperation,
  RepoFilePatch,
} from "@shared/edit-operations";

export {
  createPatchId,
  designIdSelector,
  designSelector,
  DESIGN_OVERRIDES_PATH,
} from "@shared/edit-operations";

export type DesignPublishStatus =
  | "idle"
  | "publishing"
  | "published"
  | "deploying"
  | "deployed"
  | "failed";

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

  if (!patch.id || !patch.summary) {
    throw new Error("Patch missing id or summary");
  }

  if (!Array.isArray(patch.preview.operations)) {
    throw new Error("Patch missing preview operations");
  }

  if (!Array.isArray(patch.repo.files)) {
    throw new Error("Patch missing repo files");
  }

  if (patch.preview.operations.length === 0 && patch.repo.files.length === 0) {
    throw new Error("Patch has no preview or repo changes");
  }
}

export function applyDraftPatch(patch: DesignPatch): void {
  applyPreviewOperations(patch.preview.operations, patch.id);
}

export function removeDraftPatch(patchId: string): void {
  removePreviewPatch(patchId);
}

export function clearAllDraftPatches(): void {
  clearAllPreviewPatches();
}

export function reapplyDraftPatches(patches: DesignPatch[]): void {
  reapplyPreviewPatches(patches);
}
