const STYLE_ID = "popped-live-draft";

export function injectDraftCss(css: string): void {
  if (typeof document === "undefined") return;

  let element = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (!element) {
    element = document.createElement("style");
    element.id = STYLE_ID;
    element.dataset.poppedDraft = "true";
    document.head.appendChild(element);
  }

  element.textContent = css;
}

export function clearDraftCss(): void {
  if (typeof document === "undefined") return;
  document.getElementById(STYLE_ID)?.remove();
}

export function hasDraftCssApplied(): boolean {
  if (typeof document === "undefined") return false;
  return Boolean(document.getElementById(STYLE_ID));
}
