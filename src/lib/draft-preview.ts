export const DRAFT_PREVIEW_PARAM = "poppedDraft";

/** Branch preview hostnames on Cloudflare Pages (not production). */
export function isBranchPreviewHost(): boolean {
  if (typeof window === "undefined") return false;
  const hostname = window.location.hostname;
  return (
    hostname.endsWith(".popped-dev.pages.dev") && hostname !== "popped-dev.pages.dev"
  );
}

export function isDraftPreviewEmbed(): boolean {
  if (typeof window === "undefined") return false;
  return (
    new URLSearchParams(window.location.search).get(DRAFT_PREVIEW_PARAM) === "1" ||
    isBranchPreviewHost()
  );
}

export function appendDraftPreviewParam(url: string): string {
  const parsed = new URL(url);
  parsed.searchParams.set(DRAFT_PREVIEW_PARAM, "1");
  return parsed.toString();
}

/** Cache-bust iframe loads so each deploy shows fresh HTML/CSS. */
export function buildPreviewEmbedUrl(url: string, revision?: string | null): string {
  const parsed = new URL(appendDraftPreviewParam(url));
  parsed.searchParams.set("rev", (revision ?? String(Date.now())).slice(0, 12));
  return parsed.toString();
}
