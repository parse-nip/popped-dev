/** Max automatic AI fix attempts after a compile/build error. */
export const DESIGN_FIX_MAX_ATTEMPTS = 3;

export type AgentEditFixContext = {
  compileError: string;
  attempt: number;
  maxAttempts: number;
  originalPrompt?: string;
};
