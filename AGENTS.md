# popped.dev — agent rules for community contributors

## Never modify (locked)

- `src/locked/` — resume HTML, manifest, checksums
- `src/components/locked/LockedIntro.tsx` — intro + attribution UI

## Safe to modify

- `src/components/community/` — community-built UI
- `src/app/globals.css` — global styles (not locked resume content)
- `src/data/contributions.json` — append attribution entries on merge

## Principles

- Portfolio facts in `src/locked/resume.html` must always remain visible on the page.
- Style *around* locked sections; do not hide or replace resume content.
- Add `data-contribution-id` to community-built elements for hover attribution.
