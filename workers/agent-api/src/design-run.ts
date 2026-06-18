import type { DesignPatch, SelectedElementPayload } from "./design-patch";
import {
  createPatchBlock,
  designSelector,
  parseDesignPatch,
  validatePatch,
} from "./design-patch";
import type { Env } from "./types";

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

  return `You are a CSS design assistant for popped.dev — a community portfolio site.

Return ONLY valid JSON (no markdown fences) matching this schema:
{
  "id": "patch_<slug>_<timestamp>",
  "kind": "css",
  "target": { "designId": "<designId>", "selector": "[data-design-id=\\"<designId>\\"]" },
  "css": "<scoped CSS rules>",
  "summary": "<one sentence>"
}

Rules:
- CSS ONLY — no TSX, no HTML, no locked fact edits.
- Every rule MUST start with [data-design-id="<designId>"] or a descendant under it.
- Never use @import, url(), body, html, *, or position: fixed.
- Keep CSS under 500 lines / 5000 chars.
- Improve presentation: typography, spacing, color, borders, shadows, layout density.
- Do not hide facts (no display:none on fact content).

Selected element:
- designId: ${input.selectedElement.designId}
- tag: ${input.selectedElement.tagName}
- text: ${input.selectedElement.text || "(empty)"}
- selector: ${input.selectedElement.selector}
- computed styles: ${JSON.stringify(input.selectedElement.computedStyle)}

Already accepted in this session:
${acceptedSummary}

Contributor request:
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

function fallbackPatch(input: RunDesignInput): DesignPatch {
  const { designId } = input.selectedElement;
  const selector = designSelector(designId);
  const lower = input.prompt.toLowerCase();

  let css = `${selector} { transition: color 0.2s ease; }`;
  let summary = "Applied a subtle presentation tweak.";

  if (/bigger|larger|scale up|increase size/.test(lower)) {
    css = `${selector} { font-size: clamp(1.125rem, 2.5vw, 1.5rem); }`;
    summary = "Made the element larger.";
  } else if (/smaller|compact|reduce size/.test(lower)) {
    css = `${selector} { font-size: 0.925rem; }`;
    summary = "Made the element more compact.";
  } else if (/bold|weight|strong/.test(lower)) {
    css = `${selector} { font-weight: 600; }`;
    summary = "Increased font weight.";
  } else if (/color|blue|green|red|purple|gold|premium/.test(lower)) {
    css = `${selector} { color: color-mix(in srgb, var(--foreground) 88%, #6366f1); }`;
    summary = "Adjusted text color.";
  } else if (/background|bg/.test(lower)) {
    css = `${selector} { background: color-mix(in srgb, var(--background) 92%, #6366f1 8%); border-radius: 0.5rem; padding: 0.5rem 0.75rem; }`;
    summary = "Added a subtle background.";
  } else if (/space|spacing|padding|margin|gap/.test(lower)) {
    css = `${selector} { margin-block: 0.75rem; padding-inline: 0.25rem; }`;
    summary = "Adjusted spacing.";
  } else if (/shadow|elevation|depth/.test(lower)) {
    css = `${selector} { box-shadow: 0 8px 24px color-mix(in srgb, var(--foreground) 8%, transparent); }`;
    summary = "Added depth with a soft shadow.";
  } else if (/hide|remove|invisible/.test(lower)) {
    css = `${selector} { opacity: 0.35; }`;
    summary = "Softened visibility (facts remain in DOM).";
  } else if (/center|align/.test(lower)) {
    css = `${selector} { text-align: center; }`;
    summary = "Centered the element.";
  } else if (/rounded|radius|round/.test(lower)) {
    css = `${selector} { border-radius: 0.75rem; }`;
    summary = "Added rounded corners.";
  }

  return {
    id: `patch_${designId.replace(/[^a-z0-9.]+/gi, "_")}_${Date.now().toString(36)}`,
    kind: "css",
    target: { designId, selector },
    css,
    summary,
  };
}

async function callWorkersAi(env: Env, prompt: string): Promise<string | null> {
  const ai = (env as Env & { AI?: Ai }).AI;
  if (!ai) return null;

  try {
    const response = await ai.run("@cf/meta/llama-3.1-8b-instruct", {
      messages: [{ role: "user", content: prompt }],
      max_tokens: 1024,
      temperature: 0.3,
    });

    if (typeof response === "string") return response;
    if (response && typeof response === "object") {
      const maybe = response as { response?: string; result?: string };
      return maybe.response ?? maybe.result ?? null;
    }
  } catch (error) {
    console.warn("Workers AI design run failed:", error);
  }

  return null;
}

export async function generateDesignPatch(env: Env, input: RunDesignInput): Promise<DesignPatch> {
  const prompt = buildRunPrompt(input);
  const aiText = await callWorkersAi(env, prompt);

  if (aiText) {
    const parsed = parseDesignPatch(extractJsonObject(aiText));
    if (parsed) {
      parsed.target.designId = input.selectedElement.designId;
      parsed.target.selector = designSelector(input.selectedElement.designId);
      try {
        validatePatch(parsed);
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

export function classifyRequiresCodeChange(prompt: string): boolean {
  const lower = prompt.toLowerCase();
  return (
    /new section|add section|component structure|change layout|map over|routing|animation library|new page|tsx|typescript|react component/.test(
      lower,
    ) || /edit fact|change text|reword|experience\.json|locked/.test(lower)
  );
}

export { createPatchBlock };
