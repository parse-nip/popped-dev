/** Shared OpenRouter defaults — keep in sync with workers/agent-api/src/openrouter.ts */
export const DEFAULT_OPENROUTER_MODEL = "google/gemini-2.5-flash";

export type DesignApprovalResult = {
  approved: boolean;
  reason: string;
};
