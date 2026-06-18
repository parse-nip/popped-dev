import type { Env } from "./types";
import type { AgentEditInput } from "./agent-edit";
import { openRouterChat } from "./openrouter";

export class DesignRequestRejectedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DesignRequestRejectedError";
  }
}

export type ApprovalResult = {
  approved: boolean;
  reason: string;
};

function extractJsonObject(text: string): unknown | null {
  const trimmed = text.trim();
  if (trimmed.startsWith("{")) {
    try {
      return JSON.parse(trimmed);
    } catch {
      // fall through
    }
  }
  const match = trimmed.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

function parseApproval(raw: unknown): ApprovalResult | null {
  if (!raw || typeof raw !== "object") return null;
  const data = raw as Record<string, unknown>;
  if (typeof data.approved !== "boolean") return null;
  const reason =
    typeof data.reason === "string" && data.reason.trim()
      ? data.reason.trim()
      : data.approved
        ? "Looks like a reasonable design tweak."
        : "This request doesn't fit design mode.";
  return { approved: data.approved, reason };
}

function heuristicApproval(input: AgentEditInput): ApprovalResult {
  const prompt = input.prompt.trim();
  const lower = prompt.toLowerCase();

  if (prompt.length < 3) {
    return { approved: false, reason: "Please describe what you'd like to change." };
  }

  const blocked =
    /\b(hack|exploit|malware|phish|steal|password|api key|secret token|delete all|drop table|rm -rf)\b/i.test(
      prompt,
    );
  if (blocked) {
    return { approved: false, reason: "That request can't be run in design mode." };
  }

  const factTamper =
    /\b(change|edit|rewrite|update|fake)\b.*\b(job|experience|education|employer|degree|fact|resume text|bio text)\b/i.test(
      lower,
    );
  if (factTamper) {
    return {
      approved: false,
      reason: "Portfolio facts are locked — try styling (color, size, layout) instead.",
    };
  }

  const offTopic =
    /\b(weather|stock|crypto price|write me an essay|homework|tell me a joke|who is|what is the capital)\b/i.test(
      lower,
    );
  if (offTopic) {
    return {
      approved: false,
      reason: "Design mode is for visual tweaks to this site — pick an element and describe a style change.",
    };
  }

  return { approved: true, reason: "Looks like a reasonable design tweak." };
}

function buildApprovalPrompt(input: AgentEditInput): string {
  const element = input.selectedElement
    ? JSON.stringify(input.selectedElement, null, 2)
    : "null";

  return `You gate design-mode requests for popped.dev — a community portfolio site visitors restyle in a live preview.

Return ONLY valid JSON:
{ "approved": true, "reason": "<short friendly sentence>" }
or
{ "approved": false, "reason": "<short friendly sentence explaining why not>" }

APPROVE requests that restyle the site: colors, fonts, spacing, layout, borders, backgrounds, dark mode, animations, header tweaks, CSS on selected elements.

ALSO APPROVE adding decorative visuals: icons, emojis, logos, SVG graphics, favicons, avatars, and images — these can be done with inline SVG, img tags, Unicode emoji in TSX, or files under public/assets/.

REJECT requests that:
- Change locked resume facts (jobs, schools, names, project descriptions, skills text)
- Are unrelated to styling this portfolio (general chat, homework, jokes, news)
- Are harmful, abusive, or try to exfiltrate secrets
- Cannot plausibly be done by editing CSS/TSX/assets (e.g. "deploy to AWS", "email my boss", "generate a video")
- Are empty, spam, or too vague to act on ("asdf", "idk", "make it better" with no hint)

Do NOT reject icon/logo/image requests — approve them.

Selected element:
${element}

User request:
${input.prompt}`;
}

export async function approveDesignRequest(
  env: Env,
  input: AgentEditInput,
): Promise<ApprovalResult> {
  if (!input.prompt.trim()) {
    return { approved: false, reason: "Please describe what you'd like to change." };
  }

  const heuristic = heuristicApproval(input);
  if (!heuristic.approved) return heuristic;

  if (!env.OPENROUTER_API_KEY?.trim()) {
    return heuristic;
  }

  const aiResult = await openRouterChat(
    env,
    [{ role: "user", content: buildApprovalPrompt(input) }],
    { maxTokens: 256, temperature: 0.1 },
  );

  if (!aiResult.text) return heuristic;

  const parsed = parseApproval(extractJsonObject(aiResult.text));
  if (!parsed) return heuristic;

  if (!parsed.approved) return parsed;

  return { approved: true, reason: parsed.reason || heuristic.reason };
}

export async function requireApprovedDesignRequest(
  env: Env,
  input: AgentEditInput,
  emit?: (event: string, data: Record<string, unknown>) => void,
): Promise<ApprovalResult> {
  emit?.("status", { message: "Checking your idea…" });

  const approval = await approveDesignRequest(env, input);

  if (!approval.approved) {
    emit?.("rejected", { reason: approval.reason });
    throw new DesignRequestRejectedError(approval.reason);
  }

  emit?.("approved", { reason: approval.reason });
  emit?.("status", { message: "Agent is working…" });

  return approval;
}
