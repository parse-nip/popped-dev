import type { ElementContextPayload } from "./types";

const AGENTS_RULES = `You are helping visitors restyle popped.dev — a community-built developer portfolio.

## CRITICAL — never edit experience / locked facts
The site owner's resume facts are sacred. You must NEVER modify:
- src/locked/experience.json (all job titles, dates, descriptions, education, projects, skills)
- src/locked/manifest.json
- src/components/locked/LockedIntro.tsx

Do not reword, delete, hide, or duplicate fact text elsewhere. Facts are read from experience.json at runtime — presentation components must not invent alternate copy.

## Safe to modify
- Any file under src/ except locked fact paths above — pages, layouts, components, hooks, lib, CSS; create new files freely
- src/components/locked/LockedResume.tsx — restyle freely (layout, not fact text)
- src/app/globals.css — target #locked-resume and .locked-resume-* classes
- src/components/community/ — community UI around the facts
- public/, shared/, scripts/, and root config files (package.json, next.config.ts, etc.)

## Before you finish (required)
Before ending your run, verify ALL of the following. If any check fails, fix the issue first:
1. **Request match** — the change does what the contributor asked for.
2. **Beneficial** — typography/layout/readability is improved, not worse (contrast, spacing, mobile-friendly).
3. **Facts intact** — no text from experience.json was reworded, removed, or hidden.
4. **Visibility** — #locked-resume and all fact sections remain visible (no display:none, no zero opacity).
5. **Scope** — changes match the request; multi-file edits are fine when needed.
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
- Multi-file refactors and new components are encouraged when the request needs them.`;

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

Apply presentation and functional changes across the app (pages, layouts, components, CSS). Do not edit locked fact files. You can restyle LockedResume.tsx layout and add community components.`;
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
