import type { Env } from "./types";

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

function buildEditPrompt(input: AgentEditInput): string {
  const fileList = Object.keys(input.files)
    .slice(0, 24)
    .map((path) => `- ${path}`)
    .join("\n");

  const fileContents = Object.entries(input.files)
    .slice(0, 8)
    .map(([path, content]) => `### ${path}\n\`\`\`\n${content.slice(0, 4000)}\n\`\`\``)
    .join("\n\n");

  const element = input.selectedElement
    ? JSON.stringify(input.selectedElement, null, 2)
    : "null";

  return `You are a code editing assistant for popped.dev — a Next.js community portfolio.

Return ONLY valid JSON (no markdown fences):
{
  "summary": "<one sentence>",
  "writes": [
    { "path": "src/components/SiteHeader.tsx", "content": "<full file content>" }
  ],
  "commands": ["npm install some-package"]
}

Rules:
- Edit real TSX/CSS files for structural and styling changes.
- Return FULL file contents for each write (not diffs).
- NEVER modify locked fact files: src/locked/*, src/components/locked/LockedIntro.tsx, src/locked/experience.json.
- Style LockedResume.tsx freely but do not change factual text from experience.json.
- Prefer src/app/design-overrides.css, src/components/community/*, src/components/locked/LockedResume.tsx, globals.css.
- commands: only npm install lines if new packages are needed; otherwise [].
- Keep changes minimal and focused on the user request.

Selected element:
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
  const accent = input.prompt.toLowerCase().includes("dark") ? "#111" : "#2563eb";
  const block = `\n/* agent fallback */\nbody { accent-color: ${accent}; }\n`;
  return {
    summary: "Applied a subtle CSS override as a fallback edit.",
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

export async function runAgentEdit(
  env: Env,
  input: AgentEditInput,
): Promise<AgentEditResult> {
  if (!input.prompt.trim()) {
    throw new Error("Prompt is required.");
  }
  if (Object.keys(input.files).length === 0) {
    throw new Error("No project files provided.");
  }

  if (!env.AI) {
    return fallbackEdit(input);
  }

  const response = await env.AI.run("@cf/meta/llama-3.1-8b-instruct", {
    messages: [{ role: "user", content: buildEditPrompt(input) }],
    max_tokens: 4096,
  });

  const text =
    typeof response === "string"
      ? response
      : typeof response === "object" && response !== null && "response" in response
        ? String((response as { response?: string }).response ?? "")
        : JSON.stringify(response);

  const parsed = parseAgentEditResult(extractJsonObject(text));
  if (parsed) return parsed;

  return fallbackEdit(input);
}
