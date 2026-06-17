import type { ElementContextPayload } from "./types";

const AGENTS_RULES = `You are helping visitors restyle popped.dev — a community-built developer portfolio.

## Never modify (locked facts)
- src/locked/experience.json
- src/locked/manifest.json
- src/components/locked/LockedIntro.tsx

## Safe to modify (presentation only)
- src/components/locked/LockedResume.tsx — restyle freely
- src/app/globals.css — target #locked-resume and .locked-resume-* classes
- src/components/community/ — community UI around the facts
- src/data/contributions.json — append attribution on merge only

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

export function buildSubmitPrompt(
  contributorName: string,
  branch: string,
  prTitle?: string,
): string {
  const title = prTitle?.trim() || "Community design contribution";
  return `The contributor "${contributorName}" approved the design on branch "${branch}".

Open a pull request against main with title "${title}".
Include a body explaining presentation changes and confirming locked facts were not changed.
Reference that verify:locked must pass. Do not modify locked fact files.`;
}
