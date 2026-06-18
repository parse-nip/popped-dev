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

export function parseDesignPatch(value: unknown): DesignPatch | null {
  if (!value || typeof value !== "object") return null;
  const patch = value as Partial<DesignPatch>;
  if (
    typeof patch.id !== "string" ||
    patch.kind !== "css" ||
    !patch.target ||
    typeof patch.target.designId !== "string" ||
    typeof patch.target.selector !== "string" ||
    typeof patch.css !== "string" ||
    typeof patch.summary !== "string"
  ) {
    return null;
  }
  return patch as DesignPatch;
}

export function createPatchBlock(patch: DesignPatch): string {
  return `/* popped.design:start id=${patch.id} */
${patch.css.trim()}
/* popped.design:end id=${patch.id} */`;
}

export function mergePatchesIntoCss(existing: string, patches: DesignPatch[]): string {
  let content = existing.trim();
  for (const patch of patches) {
    const start = `/* popped.design:start id=${patch.id} */`;
    const end = `/* popped.design:end id=${patch.id} */`;
    const block = createPatchBlock(patch);
    const startIdx = content.indexOf(start);
    if (startIdx !== -1) {
      const endIdx = content.indexOf(end, startIdx);
      if (endIdx !== -1) {
        content =
          content.slice(0, startIdx).trimEnd() +
          "\n\n" +
          block +
          content.slice(endIdx + end.length).trimStart();
        content = content.trim();
        continue;
      }
    }
    content = content ? `${content}\n\n${block}` : block;
  }
  return `${content.trim()}\n`;
}

export const DESIGN_OVERRIDES_PATH = "src/app/design-overrides.css";
