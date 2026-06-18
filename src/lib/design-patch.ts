export type DesignPatch = {
  id: string;
  kind: "css";
  target: {
    designId: string;
    selector: string;
  };
  css: string;
  summary: string;
};

export type DesignPublishStatus = "idle" | "publishing" | "published" | "failed";

export type SelectedElementPayload = {
  designId: string;
  tagName: string;
  text: string;
  selector: string;
  computedStyle: Record<string, string>;
};

const BANNED_CSS_TOKENS = [
  "@import",
  "url(",
  "body",
  "html",
  "* {",
  "position: fixed",
];

export function designSelector(designId: string): string {
  return `[data-design-id="${designId}"]`;
}

export function validatePatch(patch: DesignPatch): void {
  if (patch.kind !== "css") {
    throw new Error("Only CSS patches are supported");
  }

  if (!patch.css.includes(designSelector(patch.target.designId))) {
    throw new Error("CSS must be scoped to selected designId");
  }

  const lower = patch.css.toLowerCase();
  for (const token of BANNED_CSS_TOKENS) {
    if (lower.includes(token)) {
      throw new Error(`Disallowed CSS token: ${token}`);
    }
  }

  if (patch.css.length > 5000) {
    throw new Error("CSS patch too large");
  }
}

const DRAFT_STYLE_ID = "popped-design-draft-style";

export function applyDraftPatch(patch: DesignPatch): void {
  if (typeof document === "undefined") return;

  let style = document.getElementById(DRAFT_STYLE_ID) as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement("style");
    style.id = DRAFT_STYLE_ID;
    style.dataset.poppedDraft = "true";
    document.head.appendChild(style);
  }

  const withoutPatch = removePatchBlock(style.textContent ?? "", patch.id);
  style.textContent = `${withoutPatch}\n/* ${patch.id} */\n${patch.css}\n`.trimStart();
}

export function removeDraftPatch(patchId: string): void {
  if (typeof document === "undefined") return;

  const style = document.getElementById(DRAFT_STYLE_ID) as HTMLStyleElement | null;
  if (!style) return;

  const next = removePatchBlock(style.textContent ?? "", patchId).trim();
  if (!next) {
    style.remove();
    return;
  }
  style.textContent = next;
}

export function clearAllDraftPatches(): void {
  if (typeof document === "undefined") return;
  document.getElementById(DRAFT_STYLE_ID)?.remove();
}

export function reapplyDraftPatches(patches: DesignPatch[]): void {
  clearAllDraftPatches();
  for (const patch of patches) {
    applyDraftPatch(patch);
  }
}

function removePatchBlock(css: string, patchId: string): string {
  const marker = `/* ${patchId} */`;
  const start = css.indexOf(marker);
  if (start === -1) return css;

  const before = css.slice(0, start).trimEnd();
  const afterStart = start + marker.length;
  const nextMarker = css.indexOf("\n/* patch_", afterStart);
  const nextGeneric = css.indexOf("\n/* ", afterStart + 1);
  let end = css.length;

  if (nextMarker !== -1) {
    end = nextMarker;
  } else if (nextGeneric !== -1 && nextGeneric > afterStart) {
    end = nextGeneric;
  }

  const after = css.slice(end).trimStart();
  return [before, after].filter(Boolean).join("\n");
}

export function createPatchId(designId: string): string {
  const slug = designId.replace(/[^a-z0-9.]+/gi, "_").slice(0, 40);
  return `patch_${slug}_${Date.now().toString(36)}`;
}
