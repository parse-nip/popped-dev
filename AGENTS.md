# popped.dev — agent rules for community contributors

## Never modify (locked facts)

- `src/locked/experience.json` — portfolio facts (name, jobs, education, projects, etc.)
- `src/locked/manifest.json` — list of locked paths
- `src/components/locked/LockedIntro.tsx` — intro copy + attribution UI

## Safe to modify (including styling facts)

- `src/components/locked/LockedResume.tsx` — **restyle freely** (layout, classes, wrappers)
- `src/app/globals.css` — target `#locked-resume`, `.locked-resume-*` classes
- `src/components/community/` — community-built UI around the facts
- `src/data/contributions.json` — append attribution entries on merge

## Principles

- Facts come from `experience.json` only — do not hardcode alternate text in components.
- **Style the facts, don't change them.** Typography, colors, cards, animations: yes. Rewording experience or education: no.
- Facts must always remain visible on the page (no `display: none` on `#locked-resume`).
- Add `data-contribution-id` to styled elements for hover attribution.
- If you are contributing, read @Design.md first!