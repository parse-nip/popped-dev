import type { Env } from "./types";
import type { AgentEditInput } from "./agent-edit";
import { extractJsonObject } from "./agent-edit-parse";
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
      reason: "Design mode is for changes to this portfolio — pick an element and describe what you'd like.",
    };
  }

  return { approved: true, reason: "Looks like a reasonable portfolio change." };
}

function buildApprovalPrompt(input: AgentEditInput): string {
  const element = input.selectedElement
    ? JSON.stringify(input.selectedElement, null, 2)
    : "null";

  return `You gate design-mode requests for popped.dev — a community portfolio site visitors reshape in a live preview.

Return ONLY valid JSON:
{ "approved": true, "reason": "<short friendly sentence>" }
or
{ "approved": false, "reason": "<short friendly sentence explaining why not>" }

APPROVE visual changes: colors, fonts, spacing, layout, borders, backgrounds, dark mode, animations, CSS on selected elements.

APPROVE functional changes that improve the portfolio UI: new links, buttons, navigation, hover states, click handlers, reordering sections, adding components, tooltips, external links, GitHub/social link rows, layout structure, accessibility tweaks, and interactive elements — as long as they don't rewrite locked resume facts.

APPROVE decorative and brand visuals: icons, emojis, logos, SVG graphics, favicons, avatars, and images — via inline SVG, img tags, Unicode emoji in TSX, files under public/assets/, or HTTPS CDN URLs (e.g. https://cdn.simpleicons.org/github/111111).

APPROVE using existing resume facts from src/locked/experience.json in new UI (read-only display, link rows, skill chips, project highlights) — but NOT editing the JSON facts themselves.

REJECT only requests that:
- Change locked resume fact text (jobs, schools, names, project descriptions, skills wording in experience.json)
- Are unrelated to this portfolio site (general chat, homework, jokes, news)
- Are harmful, abusive, or try to exfiltrate secrets
- Cannot plausibly be done by editing CSS/TSX/assets (e.g. "deploy to AWS", "email my boss", "generate a video")
- Are empty, spam, or too vague ("asdf", "idk")

Do NOT reject functional UI changes or icon/logo/image requests — approve them.

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
