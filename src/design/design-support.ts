export type CoepMode = "credentialless" | "require-corp" | "none";

/** Match the COEP header the document was loaded with — required for WebContainer.boot(). */
export function detectCoepMode(): CoepMode {
  if (typeof document === "undefined") return "none";

  const policy = (
    document as Document & { crossOriginEmbedderPolicy?: string }
  ).crossOriginEmbedderPolicy;

  if (policy === "credentialless") return "credentialless";
  if (policy === "require-corp") return "require-corp";

  if (typeof crossOriginIsolated !== "undefined" && crossOriginIsolated) {
    return "credentialless";
  }

  return "none";
}

export function isCrossOriginIsolated(): boolean {
  return typeof crossOriginIsolated !== "undefined" && crossOriginIsolated;
}

function isSafari(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Safari/i.test(navigator.userAgent) && !/Chrome|Chromium|Edg|OPR|Firefox/i.test(navigator.userAgent);
}

function isFirefox(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Firefox/i.test(navigator.userAgent);
}

export function getDesignModeBlockReason(): string {
  if (isSafari()) {
    return "Design mode needs Chrome or Edge on desktop — Safari isn't supported yet.";
  }
  if (isFirefox()) {
    return "Design mode needs Chrome or Edge for now — Firefox support is coming.";
  }
  if (typeof window !== "undefined" && window.self !== window.top) {
    return "Design mode can't run inside an embedded preview — open popped.dev directly.";
  }
  return "Hard refresh this page (Cmd+Shift+R) to enable design mode, then try again.";
}

export function canAttemptDesignBoot(): boolean {
  return detectCoepMode() !== "none";
}
