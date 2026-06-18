/** postMessage protocol between design iframe (WebContainer preview) and host page. */

export const DESIGN_EMBED_SOURCE = "popped-design-embed";

export type DesignEmbedRect = {
  top: number;
  left: number;
  width: number;
  height: number;
};

export type DesignEmbedElementContext = {
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

export type DesignEmbedMessage =
  | { source: typeof DESIGN_EMBED_SOURCE; type: "hover"; rect: DesignEmbedRect; context: DesignEmbedElementContext }
  | { source: typeof DESIGN_EMBED_SOURCE; type: "select"; rect: DesignEmbedRect; context: DesignEmbedElementContext }
  | { source: typeof DESIGN_EMBED_SOURCE; type: "clear" };

export function isDesignEmbedMessage(data: unknown): data is DesignEmbedMessage {
  if (!data || typeof data !== "object") return false;
  const msg = data as Record<string, unknown>;
  if (msg.source !== DESIGN_EMBED_SOURCE) return false;
  if (msg.type === "clear") return true;
  if (msg.type !== "hover" && msg.type !== "select") return false;
  return Boolean(msg.rect && msg.context);
}
