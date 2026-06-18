import { isAllowedDesignWebImageUrl } from "../../../shared/design-web-images";

export type FetchedWebAsset = {
  path: string;
  content: string;
};

export async function fetchWebAsset(url: string, path: string): Promise<FetchedWebAsset | null> {
  if (!isAllowedDesignWebImageUrl(url)) return null;
  if (!path.startsWith("public/assets/")) return null;

  try {
    const response = await fetch(url, {
      headers: { Accept: "image/*,text/plain,*/*" },
    });
    if (!response.ok) {
      console.warn("Asset fetch failed:", url, response.status);
      return null;
    }

    const contentType = response.headers.get("content-type") ?? "";
    const content = contentType.includes("svg") || url.endsWith(".svg")
      ? await response.text()
      : await response.text();

    if (!content.trim()) return null;
    return { path, content };
  } catch (error) {
    console.warn("Asset fetch error:", url, error);
    return null;
  }
}

export async function resolveWebAssets(
  assets: Array<{ url: string; path: string }>,
): Promise<FetchedWebAsset[]> {
  const resolved: FetchedWebAsset[] = [];
  for (const asset of assets) {
    const fetched = await fetchWebAsset(asset.url, asset.path);
    if (fetched) resolved.push(fetched);
  }
  return resolved;
}
