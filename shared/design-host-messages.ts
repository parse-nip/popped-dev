/** Host page → WebContainer preview iframe commands. */

export const DESIGN_HOST_SOURCE = "popped-design-host";

export type DesignHostMessage =
  | { source: typeof DESIGN_HOST_SOURCE; type: "mark-editing"; designId: string }
  | { source: typeof DESIGN_HOST_SOURCE; type: "clear-editing" };

export function isDesignHostMessage(data: unknown): data is DesignHostMessage {
  if (!data || typeof data !== "object") return false;
  const msg = data as Record<string, unknown>;
  if (msg.source !== DESIGN_HOST_SOURCE) return false;
  if (msg.type === "clear-editing") return true;
  if (msg.type === "mark-editing") return typeof msg.designId === "string" && msg.designId.length > 0;
  return false;
}
