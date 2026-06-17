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

**Facts** (checksum-protected — community cannot change):

- `src/locked/experience.json` — portfolio data (experience, education, projects, skills)
- `src/components/locked/LockedIntro.tsx` — site concept + attribution name input

**Presentation** (community can style, including the facts section):

- `src/components/locked/LockedResume.tsx` — renders facts; restyle freely
- `src/app/globals.css` — CSS targeting `#locked-resume` and `.locked-resume-*`

CI runs `npm run verify:locked` on every PR.

**Owner only:** after editing locked fact files, regenerate checksums:

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

Production deploys when you push to `main` via **Cloudflare Pages Git integration** (build `npm run build`, output `out`). CI on PRs runs via [`.github/workflows/ci.yml`](.github/workflows/ci.yml).

**Testing the agent flow and resetting:** see [`docs/TESTING-AND-RESET.md`](docs/TESTING-AND-RESET.md).

## Agent API (Cloudflare Worker)

Design-mode chat calls a separate Worker at `workers/agent-api/` (not bundled in the static export).

| Route | Purpose |
|---|---|
| `POST /api/agent/session` | Validate contributor + session |
| `POST /api/agent/message` | Send element context + message |
| `GET /api/agent/runs/:runId/stream` | SSE stream (assistant, status, previewUrl) |
| `POST /api/agent/runs/:runId/submit` | Phase 3: open PR |

See [`workers/agent-api/README.md`](workers/agent-api/README.md) for secrets and preview URL alias format.

Local dev: run `npm run dev` in `workers/agent-api`, then set `NEXT_PUBLIC_AGENT_API_URL=http://localhost:8787` in `.env.local`.

## Preview URLs

Branch previews use Cloudflare Pages branch aliases:

```
https://{normalized-branch}--popped-dev.pages.dev
```

Example: branch `cursor/add-styles-a1b2` → `https://cursor-add-styles-a1b2--popped-dev.pages.dev`

Confirm the exact alias in the Pages dashboard after the first agent push.

## Updating your resume

Edit `src/locked/experience.json` (the fact data), then run `npm run lock:checksum` and commit both files.

Contributors may restyle how facts appear via `LockedResume.tsx` and CSS — they cannot change the JSON content.
