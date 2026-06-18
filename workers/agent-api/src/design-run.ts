import type { DesignPatch, SelectedElementPayload } from "./design-patch";
import {
  createPatchId,
  designSelector,
  parseDesignPatch,
  validatePatch,
} from "./design-patch";
import type { EditOperation, RepoFilePatch } from "../../../shared/edit-operations";
import {
  DESIGN_OVERRIDES_PATH,
  operationsToCssBlock,
  poppedLogoDataUri,
  POPPED_LOGO_SVG,
} from "../../../shared/edit-operations";
import type { Env } from "./types";
import { openRouterChat } from "./openrouter";

type RunDesignInput = {
  prompt: string;
  selectedElement: SelectedElementPayload;
  acceptedPatches: DesignPatch[];
  contributorName: string;
};

function buildRunPrompt(input: RunDesignInput): string {
  const acceptedSummary =
    input.acceptedPatches.length > 0
      ? input.acceptedPatches.map((patch) => `- ${patch.summary}`).join("\n")
      : "None yet.";

  return `You are a design edit assistant for popped.dev — a community portfolio site.

Return ONLY valid JSON (no markdown fences):
{
  "id": "patch_<slug>_<timestamp>",
  "kind": "edit",
  "summary": "<one sentence>",
  "target": { "designId": "<designId>", "sourceFile": "<optional path>" },
  "preview": {
    "operations": [
      { "type": "style", "target": "<designId>", "property": "color", "value": "#2563eb", "important": true },
      { "type": "insert_image", "target": "site-header", "src": "data:image/svg+xml,...", "alt": "Logo", "position": "start", "className": "site-header-logo" }
    ]
  },
  "repo": {
    "files": [
      { "path": "src/app/design-overrides.css", "cssBlock": "#locked-resume [data-design-id=\\"...\\"] { color: #2563eb; }" },
      { "path": "src/components/SiteHeader.tsx", "tsxInsertAfter": "<header", "tsxInsert": "\\n      <img ... />", "content": null }
    ]
  }
}

Allowed operation types: style, class_toggle, visibility, insert_image, spacing.
Allowed repo paths: any editable project path (src/** except src/locked/* and LockedIntro.tsx, public/**, shared/**, scripts/**, root configs). You may create new files and edit multiple files.
NEVER change locked fact text (elements with hasFactId). Style-only on facts.
Preview may use important:true on styles. Repo CSS must be clean (no !important).
For logos: preview insert_image with data URI; repo adds TSX img + public/assets/popped-logo.svg + CSS.

Selected element:
- designId: ${input.selectedElement.designId}
- sourceFile: ${input.selectedElement.sourceFile ?? "unknown"}
- hasFactId: ${input.selectedElement.hasFactId}
- tag: ${input.selectedElement.tagName}
- text: ${input.selectedElement.text || "(empty)"}
- computed styles: ${JSON.stringify(input.selectedElement.computedStyle)}

Already accepted:
${acceptedSummary}

Request:
${input.prompt}`;
}

function extractJsonObject(text: string): unknown | null {
  const trimmed = text.trim();
  if (trimmed.startsWith("{")) {
    try {
      return JSON.parse(trimmed);
    } catch {
      // fall through
    }
  }
  const match = trimmed.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

function parseColorIntent(prompt: string): string | null {
  const lower = prompt.toLowerCase();
  const named: Record<string, string> = {
    red: "#dc2626",
    blue: "#2563eb",
    green: "#16a34a",
    purple: "#9333ea",
    gold: "#ca8a04",
    orange: "#ea580c",
    pink: "#db2777",
    black: "#111111",
    white: "#ffffff",
  };
  for (const [name, hex] of Object.entries(named)) {
    if (lower.includes(name)) return hex;
  }
  const hexMatch = prompt.match(/#([0-9a-f]{3,8})\b/i);
  if (hexMatch) return `#${hexMatch[1]}`;
  if (/color|colour|tint|hue/.test(lower)) return "#6366f1";
  return null;
}

function cssRepoBlock(designId: string, rules: string): RepoFilePatch {
  const selector = designSelector(designId);
  return {
    path: DESIGN_OVERRIDES_PATH,
    cssBlock: `${selector} {\n${rules}\n}`,
  };
}

function buildLogoPatch(input: RunDesignInput): DesignPatch {
  const targetId = input.selectedElement.designId === "site-header" ? "site-header" : "site-header";
  const logoSrc = poppedLogoDataUri();
  const operations: EditOperation[] = [
    {
      type: "insert_image",
      target: targetId,
      src: logoSrc,
      alt: "Popped",
      position: "start",
      className: "site-header-logo",
    },
    {
      type: "style",
      target: targetId,
      property: "display",
      value: "flex",
      important: true,
    },
    {
      type: "style",
      target: targetId,
      property: "alignItems",
      value: "center",
      important: true,
    },
    {
      type: "style",
      target: targetId,
      property: "gap",
      value: "0.625rem",
      important: true,
    },
  ];

  const repoFiles: RepoFilePatch[] = [
    {
      path: "public/assets/popped-logo.svg",
      content: POPPED_LOGO_SVG,
    },
    {
      path: "src/components/SiteHeader.tsx",
      tsxInsertAfter: "      data-design-select-ui\n    >",
      tsxInsert:
        '\n      <img src="/assets/popped-logo.svg" alt="Popped" className="site-header-logo" data-contribution-id="community-logo" />',
    },
    {
      path: DESIGN_OVERRIDES_PATH,
      cssBlock: `${designSelector("site-header")} {
  display: flex;
  align-items: center;
  gap: 0.625rem;
}

${designSelector("site-header")} .site-header-logo {
  height: 1.25rem;
  width: auto;
}`,
    },
  ];

  return {
    id: createPatchId(targetId),
    kind: "edit",
    summary: "Added the Popped logo to the header.",
    target: { designId: targetId, sourceFile: "src/components/SiteHeader.tsx" },
    preview: { operations },
    repo: { files: repoFiles },
  };
}

function fallbackPatch(input: RunDesignInput): DesignPatch {
  const { designId, sourceFile, hasFactId } = input.selectedElement;
  const lower = input.prompt.toLowerCase();

  if (
    /(?:add|insert|upload|include|put)\s+(?:a\s+|an\s+|the\s+|my\s+)?(?:logo|logotype)/.test(
      lower,
    )
  ) {
    return buildLogoPatch(input);
  }

  const operations: EditOperation[] = [];
  const repoFiles: RepoFilePatch[] = [];
  let summary = "Applied a presentation tweak.";

  const color = parseColorIntent(input.prompt);
  const wantsBackground = /background|bg fill|backdrop/.test(lower);

  if (color && wantsBackground) {
    operations.push(
      { type: "style", target: designId, property: "backgroundColor", value: color, important: true },
      { type: "style", target: designId, property: "color", value: color, important: true },
      { type: "spacing", target: designId, padding: "0.5rem 0.75rem" },
      { type: "style", target: designId, property: "borderRadius", value: "0.5rem", important: true },
    );
    repoFiles.push(
      cssRepoBlock(
        designId,
        `  background: color-mix(in srgb, ${color} 14%, white);\n  color: ${color};\n  border-radius: 0.5rem;\n  padding: 0.5rem 0.75rem;`,
      ),
    );
    summary = `Added a ${color} tinted background.`;
  } else if (color) {
    operations.push({
      type: "style",
      target: designId,
      property: "color",
      value: color,
      important: true,
    });
    repoFiles.push(cssRepoBlock(designId, `  color: ${color};`));
    summary = `Set the color to ${color}.`;
  } else if (/center|align/.test(lower)) {
    operations.push({
      type: "style",
      target: designId,
      property: "textAlign",
      value: "center",
      important: true,
    });
    repoFiles.push(cssRepoBlock(designId, "  text-align: center;"));
    summary = "Centered the element.";
  } else if (/bigger|larger|scale up|increase size/.test(lower)) {
    operations.push({
      type: "style",
      target: designId,
      property: "fontSize",
      value: "clamp(1.125rem, 2.5vw, 1.5rem)",
      important: true,
    });
    repoFiles.push(
      cssRepoBlock(designId, "  font-size: clamp(1.125rem, 2.5vw, 1.5rem);"),
    );
    summary = "Made the element larger.";
  } else if (/bold|weight|strong/.test(lower)) {
    operations.push({
      type: "style",
      target: designId,
      property: "fontWeight",
      value: "600",
      important: true,
    });
    repoFiles.push(cssRepoBlock(designId, "  font-weight: 600;"));
    summary = "Increased font weight.";
  } else if (/space|spacing|padding|margin|gap/.test(lower)) {
    operations.push({ type: "spacing", target: designId, margin: "0.75rem 0", padding: "0 0.25rem" });
    repoFiles.push(
      cssRepoBlock(designId, "  margin-block: 0.75rem;\n  padding-inline: 0.25rem;"),
    );
    summary = "Adjusted spacing.";
  } else if (/hide|soften|invisible/.test(lower) && !hasFactId) {
    operations.push({ type: "visibility", target: designId, visible: false });
    repoFiles.push(cssRepoBlock(designId, "  opacity: 0.35;"));
    summary = "Softened visibility.";
  } else if (/rounded|radius|round/.test(lower)) {
    operations.push({
      type: "style",
      target: designId,
      property: "borderRadius",
      value: "0.75rem",
      important: true,
    });
    repoFiles.push(cssRepoBlock(designId, "  border-radius: 0.75rem;"));
    summary = "Added rounded corners.";
  } else {
    operations.push({
      type: "style",
      target: designId,
      property: "transition",
      value: "color 0.2s ease",
    });
    const generated = operationsToCssBlock(operations, designId);
    if (generated) repoFiles.push({ path: DESIGN_OVERRIDES_PATH, cssBlock: generated });
  }

  if (repoFiles.length === 0) {
    const generated = operationsToCssBlock(operations, designId);
    if (generated) repoFiles.push({ path: DESIGN_OVERRIDES_PATH, cssBlock: generated });
  }

  return {
    id: createPatchId(designId),
    kind: "edit",
    summary,
    target: { designId, sourceFile },
    preview: { operations },
    repo: { files: repoFiles },
  };
}

async function callDesignLlm(env: Env, prompt: string): Promise<string | null> {
  const result = await openRouterChat(env, [{ role: "user", content: prompt }], {
    maxTokens: 2048,
    temperature: 0.3,
  });
  return result.text;
}

export async function generateDesignPatch(env: Env, input: RunDesignInput): Promise<DesignPatch> {
  const prompt = buildRunPrompt(input);
  const aiText = await callDesignLlm(env, prompt);

  if (aiText) {
    const parsed = parseDesignPatch(extractJsonObject(aiText));
    if (parsed) {
      parsed.target.designId = input.selectedElement.designId;
      if (input.selectedElement.sourceFile) {
        parsed.target.sourceFile = input.selectedElement.sourceFile;
      }
      try {
        validatePatch(parsed);
        if (input.selectedElement.hasFactId) {
          parsed.preview.operations = parsed.preview.operations.filter(
            (op) => op.type !== "style" || !/text|content/i.test(op.property),
          );
        }
        return parsed;
      } catch (error) {
        console.warn("AI patch failed validation:", error);
      }
    }
  }

  const fallback = fallbackPatch(input);
  validatePatch(fallback);
  return fallback;
}

export { createPatchBlockLegacy as createPatchBlock } from "./design-patch";
