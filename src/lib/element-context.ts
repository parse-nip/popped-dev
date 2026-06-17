import { getElementLabel } from "./element-label";

export type ElementContext = {
  label: string;
  selectorPath: string;
  factId?: string;
  contributionId?: string;
  tagName: string;
  classNames: string[];
  textPreview: string;
  suggestedFiles: string[];
};

function getSuggestedFiles(
  label: string,
  factId?: string,
  contributionId?: string,
): string[] {
  if (factId || label === "ProtectedFact") {
    return [
      "src/components/locked/LockedResume.tsx",
      "src/app/globals.css",
    ];
  }

  if (contributionId || label === "StyledElement") {
    return [
      "src/components/locked/LockedResume.tsx",
      "src/app/globals.css",
      "src/components/community/",
    ];
  }

  if (label === "SemanticHeader" || label === "SemanticNav") {
    return ["src/components/SiteHeader.tsx", "src/app/globals.css"];
  }

  return ["src/app/globals.css", "src/components/locked/LockedResume.tsx"];
}

function getSelectorPath(element: Element): string {
  const segments: string[] = [];
  let current: Element | null = element;

  while (current && current !== document.body) {
    let segment = current.tagName.toLowerCase();

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

export function buildElementContext(element: Element): ElementContext {
  const label = getElementLabel(element);
  const factId = element.getAttribute("data-fact-id") ?? undefined;
  const contributionId = element.getAttribute("data-contribution-id") ?? undefined;

  return {
    label,
    selectorPath: getSelectorPath(element),
    factId,
    contributionId,
    tagName: element.tagName.toLowerCase(),
    classNames: Array.from(element.classList),
    textPreview: getTextPreview(element),
    suggestedFiles: getSuggestedFiles(label, factId, contributionId),
  };
}
