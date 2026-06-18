import type { Env } from "./types";
import { isLockedFactPath } from "../../../shared/locked-fact-files";
import { requireApprovedDesignRequest } from "./approve-design-request";
import { openRouterChat, resolveOpenRouterModel, type OpenRouterChatResult } from "./openrouter";

export type AgentEditInput = {
  prompt: string;
  selectedElement?: {
    designId?: string;
    tagName?: string;
    text?: string;
    selector?: string;
    sourceFile?: string;
  } | null;
  files: Record<string, string>;
};

export type AgentEditWrite = {
  path: string;
  content: string;
};

export type AgentEditResult = {
  summary: string;
  writes: AgentEditWrite[];
  commands: string[];
};

export type AgentEditStreamEmit = (event: string, data: Record<string, unknown>) => void;

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

const EDIT_SYSTEM_PROMPT = `You are a code editing assistant for popped.dev — a Next.js community portfolio.
Return ONLY one valid JSON object (no markdown fences, no commentary).
The JSON must match this shape:
{
  "summary": "<one sentence>",
  "writes": [{ "path": "src/app/design-overrides.css", "content": "<full file content>" }],
  "commands": []
}

Rules:
- Edit real TSX/CSS files for structural and styling changes.
- Return FULL file contents for each write (not diffs).
- NEVER modify locked fact files: src/locked/*, src/components/locked/*, src/components/locked/LockedIntro.tsx, src/locked/experience.json.
- NEVER write src/components/locked/LockedResume.tsx — style resume sections via src/app/design-overrides.css using [data-design-id="..."] selectors.
- Prefer src/app/design-overrides.css, src/components/community/*, src/app/globals.css, src/components/SiteHeader.tsx.
- To add icons, logos, or images: use inline SVG or emoji in TSX (especially SiteHeader.tsx), or add SVG/PNG under public/assets/ and reference with img. Do not use npm icon libraries unless the user explicitly asks.
- commands: only npm install lines if new packages are needed; otherwise [].
- Keep changes minimal and focused on the user request.`;

function buildEditPrompt(input: AgentEditInput): string {
  const fileList = Object.keys(input.files)
    .slice(0, 20)
    .map((path) => `- ${path}`)
    .join("\n");

  const fileContents = Object.entries(input.files)
    .slice(0, 4)
    .map(([path, content]) => `### ${path}\n\`\`\`\n${content.slice(0, 1200)}\n\`\`\``)
    .join("\n\n");

  const element = input.selectedElement
    ? JSON.stringify(input.selectedElement, null, 2)
    : "null";

  return `Selected element:
${element}

Available files:
${fileList}

File contents (subset):
${fileContents}

User request:
${input.prompt}`;
}

function fallbackEdit(input: AgentEditInput): AgentEditResult {
  const overridesPath = "src/app/design-overrides.css";
  const existing = input.files[overridesPath] ?? `/* design overrides */\n`;
  const designId = input.selectedElement?.designId;
  const lower = input.prompt.toLowerCase();
  let cssRule = "outline: 2px solid #2563eb; outline-offset: 4px;";

  if (lower.includes("red")) cssRule = "color: #dc2626 !important;";
  else if (lower.includes("blue")) cssRule = "color: #2563eb !important;";
  else if (lower.includes("green")) cssRule = "color: #16a34a !important;";
  else if (lower.includes("big") || lower.includes("large")) cssRule = "font-size: 1.25em !important;";
  else if (lower.includes("small")) cssRule = "font-size: 0.875em !important;";
  else if (lower.includes("bold")) cssRule = "font-weight: 700 !important;";
  else if (lower.includes("dark")) cssRule = "background: #111 !important; color: #fafafa !important;";

  const selector = designId
    ? `#locked-resume [data-design-id="${designId}"], [data-design-id="${designId}"]`
    : "body";

  const block = `\n/* agent fallback */\n${selector} {\n  ${cssRule}\n}\n`;

  return {
    summary: designId
      ? `Styled ${designId} with a visible fallback change.`
      : "Applied a visible CSS override as a fallback edit.",
    writes: [{ path: overridesPath, content: existing + block }],
    commands: [],
  };
}

function parseAgentEditResult(raw: unknown): AgentEditResult | null {
  if (!raw || typeof raw !== "object") return null;
  const data = raw as Record<string, unknown>;
  if (typeof data.summary !== "string") return null;
  if (!Array.isArray(data.writes)) return null;

  const writes: AgentEditWrite[] = [];
  for (const item of data.writes) {
    if (!item || typeof item !== "object") continue;
    const write = item as Record<string, unknown>;
    if (typeof write.path !== "string" || typeof write.content !== "string") continue;
    writes.push({ path: write.path, content: write.content });
  }

  const commands: string[] = [];
  if (Array.isArray(data.commands)) {
    for (const cmd of data.commands) {
      if (typeof cmd === "string" && cmd.trim()) commands.push(cmd.trim());
    }
  }

  if (writes.length === 0) return null;
  return { summary: data.summary, writes, commands };
}

function isSafeAgentWritePath(path: string): boolean {
  if (isLockedFactPath(path)) return false;
  if (path.startsWith("src/components/locked/")) return false;
  if (path.startsWith("src/locked/")) return false;
  if (path === "src/app/design-overrides.css") return true;
  if (path === "src/app/globals.css") return true;
  if (path.startsWith("src/components/community/")) return true;
  if (path === "src/components/SiteHeader.tsx") return true;
  if (path.startsWith("public/assets/")) return true;
  return false;
}

function sanitizeAgentEditResult(
  result: AgentEditResult,
  input: AgentEditInput,
  strict = false,
): AgentEditResult {
  const safeWrites = result.writes.filter((write) => isSafeAgentWritePath(write.path));
  const safeCommands = result.commands.filter((cmd) => cmd.trim().startsWith("npm install"));

  if (strict && result.writes.length > 0 && safeWrites.length === 0) {
    throw new Error("The AI tried to edit locked files — try styling with CSS instead.");
  }

  if (safeWrites.length > 0) {
    return { summary: result.summary, writes: safeWrites, commands: safeCommands };
  }

  const fallback = fallbackEdit(input);
  return {
    summary: result.summary || fallback.summary,
    writes: fallback.writes,
    commands: [],
  };
}

function openRouterErrorMessage(result: OpenRouterChatResult): string {
  if (!result.error) return "OpenRouter did not return an edit.";
  if (result.status === 402 || /credits|afford|402/.test(result.error)) {
    return "OpenRouter is out of credits on this API key — add credits at openrouter.ai/settings/keys or raise the key's daily limit.";
  }
  return `OpenRouter did not return an edit. ${result.error}`;
}

async function callDesignLlm(env: Env, prompt: string): Promise<OpenRouterChatResult> {
  return openRouterChat(
    env,
    [
      { role: "system", content: EDIT_SYSTEM_PROMPT },
      { role: "user", content: prompt },
    ],
    {
      // Keep output budget low — OpenRouter keys with small daily limits fail at 8192 max_tokens (HTTP 402).
      maxTokens: 1200,
      temperature: 0.2,
    },
  );
}

export async function runAgentEdit(
  env: Env,
  input: AgentEditInput,
  emit?: AgentEditStreamEmit,
): Promise<AgentEditResult> {
  if (!input.prompt.trim()) {
    throw new Error("Prompt is required.");
  }
  if (Object.keys(input.files).length === 0) {
    throw new Error("No project files provided.");
  }

  await requireApprovedDesignRequest(env, input, emit);

  const model = resolveOpenRouterModel(env);
  const hasOpenRouter = Boolean(env.OPENROUTER_API_KEY?.trim());

  if (hasOpenRouter) {
    emit?.("status", { message: `Agent is working… (${model})`, model });
  }

  const prompt = buildEditPrompt(input);
  const aiResult = await callDesignLlm(env, prompt);

  if (hasOpenRouter) {
    if (!aiResult.text) {
      throw new Error(openRouterErrorMessage(aiResult));
    }

    const parsed = parseAgentEditResult(extractJsonObject(aiResult.text));
    if (!parsed) {
      throw new Error("The AI returned an invalid edit — try rephrasing your request.");
    }

    emit?.("status", { message: "Edit ready — applying…", model });
    return sanitizeAgentEditResult(parsed, input, true);
  }

  if (aiResult.text) {
    const parsed = parseAgentEditResult(extractJsonObject(aiResult.text));
    if (parsed) {
      emit?.("status", { message: "Edit ready — applying…" });
      return sanitizeAgentEditResult(parsed, input);
    }
  }

  emit?.("status", { message: "Using fallback edit…" });
  return fallbackEdit(input);
}
