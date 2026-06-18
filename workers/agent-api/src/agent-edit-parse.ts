export type ParsedAgentEditWrite = {
  path: string;
  content: string;
};

export type ParsedAgentEditResult = {
  summary: string;
  writes: ParsedAgentEditWrite[];
  commands: string[];
  assets?: Array<{ url: string; path: string }>;
};

const MAX_PARSE_RETRIES = 2;

export const AGENT_EDIT_JSON_RETRY_NUDGE =
  "Your last reply was not valid JSON. Return ONLY one JSON object with keys: summary (string), writes (array of {path, content}), commands (array). No markdown fences, no prose.";

export { MAX_PARSE_RETRIES };

function stripMarkdownFences(text: string): string {
  const trimmed = text.trim();
  const closed = trimmed.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/i);
  if (closed?.[1]) return closed[1].trim();
  return trimmed.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();
}

/** Extract a JSON object from model output (fences, prose wrappers, nested braces). */
export function extractJsonObject(text: string): unknown | null {
  const candidate = stripMarkdownFences(text);

  try {
    return JSON.parse(candidate);
  } catch {
    // continue
  }

  const start = candidate.indexOf("{");
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < candidate.length; i += 1) {
    const ch = candidate[i];

    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }

    if (ch === "{") depth += 1;
    if (ch === "}") {
      depth -= 1;
      if (depth === 0) {
        const slice = candidate.slice(start, i + 1);
        try {
          return JSON.parse(slice);
        } catch {
          return null;
        }
      }
    }
  }

  return null;
}

export function parseAgentEditResult(raw: unknown): ParsedAgentEditResult | null {
  if (!raw || typeof raw !== "object") return null;
  const data = raw as Record<string, unknown>;

  const summary =
    typeof data.summary === "string" && data.summary.trim()
      ? data.summary.trim()
      : typeof data.message === "string" && data.message.trim()
        ? data.message.trim()
        : "Applied design change.";

  const writesSource = Array.isArray(data.writes)
    ? data.writes
    : Array.isArray(data.files)
      ? data.files
      : null;
  if (!writesSource) return null;

  const writes: ParsedAgentEditWrite[] = [];
  for (const item of writesSource) {
    if (!item || typeof item !== "object") continue;
    const write = item as Record<string, unknown>;
    const path =
      typeof write.path === "string"
        ? write.path
        : typeof write.file === "string"
          ? write.file
          : null;
    const content =
      typeof write.content === "string"
        ? write.content
        : typeof write.contents === "string"
          ? write.contents
          : null;
    if (path && content !== null) {
      writes.push({ path, content });
    }
  }

  if (writes.length === 0) return null;

  const commands: string[] = [];
  if (Array.isArray(data.commands)) {
    for (const cmd of data.commands) {
      if (typeof cmd === "string" && cmd.trim()) commands.push(cmd.trim());
    }
  }

  const assets: Array<{ url: string; path: string }> = [];
  if (Array.isArray(data.assets)) {
    for (const item of data.assets) {
      if (!item || typeof item !== "object") continue;
      const asset = item as Record<string, unknown>;
      if (typeof asset.url === "string" && typeof asset.path === "string") {
        assets.push({ url: asset.url, path: asset.path });
      }
    }
  }

  return { summary, writes, commands, assets: assets.length ? assets : undefined };
}

export function parseAgentEditFromText(text: string): ParsedAgentEditResult | null {
  return parseAgentEditResult(extractJsonObject(text));
}
