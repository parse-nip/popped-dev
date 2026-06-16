# popped.dev

Homepage for [https://popped.dev](https://popped.dev) — a **community-built developer portfolio**.

## Concept

Visitors chat with a Cursor AI agent to design and polish the site. Locked sections preserve the owner's real portfolio facts (experience, education, achievements). Community contributions style everything around them.

**Flow (phased):**

1. **Phase 1 (this PR):** Site skeleton, locked resume HTML, intro, chat UI shell, CI guards
2. **Phase 2:** Cursor SDK agent loop + live preview
3. **Phase 3:** Confirm → PR → checker agent → merge
4. **Phase 4:** Hover attribution via `contributions.json`

## Locked content

These files are checksum-protected and **must not** be changed by community PRs:

- `src/locked/resume.html` — unstyled portfolio facts (always visible)
- `src/locked/manifest.json` — list of locked paths
- `src/components/locked/LockedIntro.tsx` — site concept + attribution name input

CI runs `npm run verify:locked` on every PR.

**Owner only:** after editing locked files, regenerate checksums:

```bash
npm run lock:checksum
git add src/locked/checksums.json
```

## Development

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Deploy (Cloudflare Pages)

Static export via `output: "export"`. Build command: `npm run build`. Output directory: `out`.

## Updating your resume

Edit `src/locked/resume.html` directly (plain HTML), then run `npm run lock:checksum` and commit both files.
