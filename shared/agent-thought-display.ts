const BOLT_ARTIFACT_RE = /<boltArtifact[\s\S]*?<\/boltArtifact>/gi;
const BOLT_ACTION_RE = /<boltAction[\s\S]*?<\/boltAction>/gi;
const CODE_FENCE_RE = /```[\s\S]*?```/g;
const JSONISH_RE = /^\s*[\[{]|"writes"\s*:|"commands"\s*:|"path"\s*:|"content"\s*:/;

/** Strip model scaffolding from streamed thought text. */
export function sanitizeAgentThoughtText(raw: string): string {
  return raw
    .replace(BOLT_ARTIFACT_RE, "")
    .replace(BOLT_ACTION_RE, "")
    .replace(CODE_FENCE_RE, "")
    .replace(/<\/?[a-z][^>]*>/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Whether a thought snippet is safe to show in the status bar. */
export function isReadableThoughtSnippet(text: string): boolean {
  const cleaned = sanitizeAgentThoughtText(text);
  if (!cleaned || cleaned.length < 3) return false;
  if (cleaned.length > 160) return false;
  if (JSONISH_RE.test(cleaned)) return false;
  return true;
}

/** Short teaser for the status bar — last readable sentence or tail. */
export function summarizeAgentThought(text: string, maxLen = 120): string {
  const cleaned = sanitizeAgentThoughtText(text);
  if (!cleaned) return "";

  const sentences = cleaned.split(/(?<=[.!?])\s+/).filter(Boolean);
  const last = sentences[sentences.length - 1] ?? cleaned;
  if (last.length <= maxLen) return last;
  return `…${last.slice(-maxLen + 1)}`;
}
