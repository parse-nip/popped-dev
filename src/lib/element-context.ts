import { getElementLabel } from "./element-label";
import { designSelector } from "./design-patch";

export type ElementContext = {
  label: string;
  designId: string;
  selector: string;
  selectorPath: string;
  sourceFile?: string;
  hasFactId: boolean;
  factId?: string;
  contributionId?: string;
  tagName: string;
  classNames: string[];
  textPreview: string;
  suggestedFiles: string[];
  computedStyle: Record<string, string>;
};

const STYLE_KEYS = [
  "color",
  "background-color",
  "font-size",
  "font-weight",
  "font-family",
  "line-height",
  "letter-spacing",
  "padding",
  "margin",
  "border-radius",
  "border",
  "box-shadow",
  "opacity",
  "display",
  "gap",
  "width",
  "max-width",
  "text-align",
] as const;

function getSuggestedFiles(
  label: string,
  factId?: string,
  contributionId?: string,
  sourceFile?: string,
): string[] {
  const appShell = ["src/app/layout.tsx", "src/app/page.tsx"];
  const styling = ["src/app/globals.css", "src/app/design-overrides.css"];
  const editableSource =
    sourceFile && !sourceFile.includes("experience.json") && !sourceFile.includes("LockedIntro")
      ? sourceFile
      : null;

  if (factId || label === "ProtectedFact") {
    return [
      editableSource ?? "src/components/locked/LockedResume.tsx",
      ...styling,
    ];
  }

  if (contributionId || label === "StyledElement") {
    return editableSource ? [editableSource, ...styling, ...appShell] : [...styling, ...appShell];
  }

  if (label === "SemanticHeader" || label === "SemanticNav") {
    return ["src/components/SiteHeader.tsx", ...appShell, ...styling];
  }

  return editableSource
    ? [editableSource, ...appShell, ...styling]
    : [...appShell, ...styling];
}

function getSelectorPath(element: Element): string {
  const segments: string[] = [];
  let current: Element | null = element;

  while (current && current !== document.body) {
    let segment = current.tagName.toLowerCase();

    const designId = current.getAttribute("data-design-id");
    if (designId) {
      segment += `[data-design-id="${designId}"]`;
      segments.unshift(segment);
      break;
    }

    if (current.id) {
      segment += `#${current.id}`;
      segments.unshift(segment);
      break;
    }

    const parent = current.parentElement;
    if (parent) {
      const siblings = Array.from(parent.children).filter(
        (child) => child.tagName === current!.tagName,
      );
      if (siblings.length > 1) {
        const index = siblings.indexOf(current) + 1;
        segment += `:nth-of-type(${index})`;
      }
    }

    segments.unshift(segment);
    current = current.parentElement;
  }

  return segments.join(" > ");
}

function getTextPreview(element: Element, maxLength = 80): string {
  const text = (element.textContent ?? "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text;
}

export function ensureDesignIdOnElement(element: Element): string {
  const explicit = element.getAttribute("data-design-id");
  if (explicit) return explicit;

  const designId = resolveDesignId(element);
  element.setAttribute("data-design-id", designId);
  return designId;
}

function resolveDesignId(element: Element): string {
  const explicit = element.getAttribute("data-design-id");
  if (explicit) return explicit;

  const factId = element.getAttribute("data-fact-id");
  if (factId) return `fact.${factId}`;

  const contributionId = element.getAttribute("data-contribution-id");
  if (contributionId) return `styled.${contributionId}`;

  const tag = element.tagName.toLowerCase();
  const parent = element.parentElement;
  if (parent) {
    const siblings = Array.from(parent.children).filter((child) => child.tagName === element.tagName);
    const index = siblings.indexOf(element);
    return `${tag}.${index}`;
  }

  return tag;
}

function readComputedStyle(element: Element): Record<string, string> {
  if (typeof window === "undefined") return {};

  const styles = window.getComputedStyle(element);
  const result: Record<string, string> = {};

  for (const key of STYLE_KEYS) {
    const value = styles.getPropertyValue(key);
    if (value) result[key] = value;
  }

  return result;
}

export function buildElementContext(element: Element): ElementContext {
  const label = getElementLabel(element);
  const factId = element.getAttribute("data-fact-id") ?? undefined;
  const contributionId = element.getAttribute("data-contribution-id") ?? undefined;
  const designId = resolveDesignId(element);
  const sourceFileAttr = element.getAttribute("data-source-file") ?? undefined;
  const suggestedFiles = getSuggestedFiles(label, factId, contributionId, sourceFileAttr);
  const sourceFile = sourceFileAttr ?? suggestedFiles[0];

  return {
    label,
    designId,
    selector: designSelector(designId),
    selectorPath: getSelectorPath(element),
    sourceFile,
    hasFactId: Boolean(factId),
    factId,
    contributionId,
    tagName: element.tagName.toLowerCase(),
    classNames: Array.from(element.classList),
    textPreview: getTextPreview(element),
    suggestedFiles,
    computedStyle: readComputedStyle(element),
  };
}

export function toSelectedElementPayload(context: ElementContext) {
  return {
    designId: context.designId,
    tagName: context.tagName,
    text: context.textPreview,
    selector: context.selector,
    sourceFile: context.sourceFile,
    hasFactId: context.hasFactId,
    computedStyle: context.computedStyle,
  };
}
