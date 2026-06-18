/** Allowlisted hosts for design-mode asset fetches (Worker + agent). */
export const DESIGN_WEB_IMAGE_HOSTS = [
  "cdn.simpleicons.org",
  "raw.githubusercontent.com",
  "github.githubassets.com",
  "avatars.githubusercontent.com",
] as const;

export function isAllowedDesignWebImageUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return false;
    return DESIGN_WEB_IMAGE_HOSTS.some(
      (host) => parsed.hostname === host || parsed.hostname.endsWith(`.${host}`),
    );
  } catch {
    return false;
  }
}

/** Known CDN icon URLs the agent can use directly in img src or fetch into public/assets/. */
export function designIconUrl(slug: string, color = "111111"): string {
  return `https://cdn.simpleicons.org/${slug}/${color}`;
}

export const DESIGN_ICON_URLS = {
  github: designIconUrl("github"),
  linkedin: designIconUrl("linkedin"),
  x: designIconUrl("x"),
  mail: designIconUrl("gmail"),
  website: designIconUrl("googlechrome"),
} as const;
