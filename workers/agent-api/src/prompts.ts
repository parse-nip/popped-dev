import type { ElementContextPayload } from "./types";

const AGENTS_RULES = `You are helping visitors restyle popped.dev — a community-built developer portfolio.

## CRITICAL — never edit experience / locked facts
The site owner's resume facts are sacred. You must NEVER modify:
- src/locked/experience.json (all job titles, dates, descriptions, education, projects, skills)
- src/locked/manifest.json
- src/components/locked/LockedIntro.tsx

Do not reword, delete, hide, or duplicate fact text elsewhere. Facts are read from experience.json at runtime — presentation components must not invent alternate copy.

## Safe to modify (presentation only)
- src/components/locked/LockedResume.tsx — restyle freely
- src/app/globals.css — target #locked-resume and .locked-resume-* classes
- src/components/community/ — community UI around the facts

## Before you finish (required)
Before ending your run, verify ALL of the following. If any check fails, fix the issue first:
1. **Request match** — the change does what the contributor asked for.
2. **Beneficial** — typography/layout/readability is improved, not worse (contrast, spacing, mobile-friendly).
3. **Facts intact** — no text from experience.json was reworded, removed, or hidden.
4. **Visibility** — #locked-resume and all fact sections remain visible (no display:none, no zero opacity).
5. **Scope** — only presentation files changed; diff is minimal and focused.
6. **Attribution** — styled elements have \`data-contribution-id\` where appropriate.

In your final message, briefly state what you changed, why it helps, and confirm the checks above passed.

## Git / pull requests
- Do NOT run git commands, commit, push, or open pull requests.
- Do NOT edit src/data/contributions.json — attribution is added when the contributor submits for review.
- Your file edits are synced to the session branch automatically when the run completes.

## Principles
- Facts come from experience.json only — do not hardcode alternate text.
- Style the facts, don't change them.
- Facts must always remain visible (no display: none on #locked-resume).
- Add data-contribution-id to styled elements for hover attribution.
- Minimize scope — focused diffs only.`;

export function buildDesignPrompt(
  elementContext: ElementContextPayload,
  userMessage: string,
  contributorName: string,
): string {
  const files = elementContext.suggestedFiles.join(", ") || "src/app/globals.css";

  return `${AGENTS_RULES}

## Contributor
${contributorName}

## Selected element
- Label: ${elementContext.label}
- Tag: ${elementContext.tagName}
- Selector: ${elementContext.selectorPath}
- Fact ID: ${elementContext.factId ?? "none"}
- Contribution ID: ${elementContext.contributionId ?? "none"}
- Classes: ${elementContext.classNames.join(" ") || "none"}
- Text preview: ${elementContext.textPreview || "(no text)"}
- Suggested files: ${files}

## Request
${userMessage}

Apply presentation-only changes. Do not edit locked fact files. Prefer CSS and LockedResume.tsx layout tweaks.`;
}

export function buildPullRequestBody(contributorName: string, branch: string): string {
  return `## Summary

Community presentation update by **${contributorName}**.

## Branch

\`${branch}\`

## Locked facts unchanged

This PR does not modify locked fact files (\`src/locked/experience.json\`, \`src/locked/manifest.json\`, \`LockedIntro.tsx\`). Presentation-only changes to styling and layout.`;
}

export function buildMergeCommitMessage(contributorName: string, branch: string): string {
  return `Merge community design by ${contributorName} (${branch})`;
}
