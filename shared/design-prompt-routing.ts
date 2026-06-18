/** Route element-chat prompts to CSS-only patches vs cloud agent (TSX / assets). */

export function classifyRequiresCodeChange(prompt: string): boolean {
  const lower = prompt.toLowerCase();
  return (
    /new section|add section|component structure|change layout|map over|routing|animation library|new page|tsx|typescript|react component/.test(
      lower,
    ) ||
    /edit fact|change text|reword|experience\.json|locked/.test(lower) ||
    /(?:add|insert|upload|include|put)\s+(?:a\s+|an\s+|the\s+|my\s+)?(?:logo|logotype|favicon|avatar|photo|picture|image|headshot|svg)/.test(
      lower,
    ) ||
    /profile photo|profile picture/.test(lower)
  );
}
