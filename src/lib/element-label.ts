const SEMANTIC_LABELS: Record<string, string> = {
  h1: "SemanticHeading",
  h2: "SemanticHeading",
  h3: "SemanticHeading",
  h4: "SemanticHeading",
  h5: "SemanticHeading",
  h6: "SemanticHeading",
  p: "SemanticParagraph",
  span: "SemanticText",
  a: "SemanticLink",
  button: "SemanticButton",
  img: "SemanticImage",
  ul: "SemanticList",
  ol: "SemanticList",
  li: "SemanticListItem",
  section: "SemanticSection",
  header: "SemanticHeader",
  footer: "SemanticFooter",
  nav: "SemanticNav",
  main: "SemanticMain",
  article: "SemanticArticle",
  div: "SemanticBlock",
};

export function getElementLabel(element: Element): string {
  const factId = element.getAttribute("data-fact-id");
  if (factId) {
    return "ProtectedFact";
  }

  const contributionId = element.getAttribute("data-contribution-id");
  if (contributionId) {
    return "StyledElement";
  }

  const tag = element.tagName.toLowerCase();
  return SEMANTIC_LABELS[tag] ?? `Semantic${tag.charAt(0).toUpperCase()}${tag.slice(1)}`;
}

export function getSelectableElement(target: EventTarget | null): Element | null {
  if (!(target instanceof Element)) {
    return null;
  }

  let current: Element | null = target;

  while (current) {
    if (current.hasAttribute("data-design-select-ui")) {
      return null;
    }

    if (current.closest('[data-slot="dialog-content"], [data-slot="dialog-overlay"]')) {
      return null;
    }

    if (current.matches("[data-design-select-root]")) {
      return null;
    }

    if (current.closest("[data-design-select-root]")) {
      return current;
    }

    current = current.parentElement;
  }

  return null;
}
