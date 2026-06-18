/** Shared OpenRouter defaults — keep in sync with workers/agent-api/src/openrouter.ts */
export const DEFAULT_OPENROUTER_MODEL = "openrouter/free";

export type DesignApprovalResult = {
  approved: boolean;
  reason: string;
};
