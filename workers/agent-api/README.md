# popped.dev Agent API Worker

Cloudflare Worker that orchestrates Cursor cloud agents for the popped.dev design mode. The static Next.js export has no server runtime; this Worker exposes `/api/agent/*` routes consumed by the browser.

## Architecture

| Route | Purpose |
|---|---|
| `POST /api/agent/session` | Create or resume a visitor session (`sessionId` → `agentId`) |
| `POST /api/agent/message` | Send user message + element context; returns `runId` |
| `GET /api/agent/runs/:runId/stream` | SSE: assistant text, status, `previewUrl` |
| `GET /api/agent/runs/:runId` | Poll fallback |
| `POST /api/agent/runs/:runId/submit` | Phase 3: follow-up run to open a PR |

Implementation uses the [Cursor Cloud Agents REST API](https://cursor.com/docs/cloud-agent/api/endpoints) (`fetch` to `api.cursor.com`) for Worker compatibility. Same repo settings as `@cursor/sdk` cloud agents.

- **Repo:** `https://github.com/parse-nip/popped-dev`
- **Branch:** `cursor/design/{sessionId}` (`workOnCurrentBranch: true`)
- **Phase 2:** `autoCreatePR: false` on create
- **Phase 3:** submit endpoint sends a follow-up prompt to open a PR

System prompts embed `AGENTS.md` rules (facts from `experience.json` only, style `LockedResume.tsx` / `globals.css`, never edit locked files).

## Preview URL format

When the cloud agent pushes branch `cursor/design/{sessionId}`, Cloudflare Pages builds a preview deployment. Branch alias URL:

```text
https://cursor-design-{sessionId-prefix}.popped-dev.pages.dev
```

Normalization: `/` → `-`, lowercase, truncate to ~28 chars. The Worker also reads the exact URL from GitHub Cloudflare Pages check runs when available.

Hash-based preview URLs (`abc123.popped-dev.pages.dev`) are commit-specific; branch aliases update on each push — use aliases for the design iframe.

## Local development

```bash
cd workers/agent-api
npm install
npx wrangler dev
# Worker on http://127.0.0.1:8787
```

In the Next.js app (repo root):

```bash
NEXT_PUBLIC_AGENT_API_URL=http://127.0.0.1:8787 npm run dev
```

Without `NEXT_PUBLIC_AGENT_API_URL`, the client uses same-origin `/api/agent/*` (production Worker route).

## Secrets and bindings

Set via `wrangler secret put` or the Cloudflare dashboard:

| Name | Required | Description |
|---|---|---|
| `CURSOR_API_KEY` | Yes | Cursor team service-account API key |
| `GITHUB_TOKEN` | Yes | GitHub PAT with `contents: write` to create `cursor/design/*` branches before agent start |
| `SESSIONS` KV | Yes | Session + run metadata + rate limits |

`wrangler.toml` vars (override in dashboard if needed):

| Var | Default | Description |
|---|---|---|
| `PAGES_PROJECT_NAME` | `popped-dev` | CF Pages project for preview URL construction |
| `GITHUB_REPO_URL` | `https://github.com/parse-nip/popped-dev` | Cloud agent repo |
| `GITHUB_DEFAULT_BRANCH` | `main` | Base ref when creating session branches |
| `CORS_ORIGIN` | `https://popped.dev` | Allowed origin (`localhost` allowed in dev) |

`GITHUB_TOKEN` is required because Cursor's `workOnCurrentBranch: true` needs the session branch (`cursor/design/{sessionId}`) to already exist on GitHub. The Worker creates it from `GITHUB_DEFAULT_BRANCH` before calling the Cursor API.

### Create KV namespace

```bash
npx wrangler kv namespace create SESSIONS
# Update id in wrangler.toml
```

### Deploy

```bash
npx wrangler secret put CURSOR_API_KEY
npx wrangler secret put GITHUB_TOKEN
npx wrangler deploy
```

### Worker route

Attach the Worker to your zone, e.g.:

- `popped.dev/api/*` → `popped-dev-agent-api`

Or use a subdomain: `api.popped.dev/*` and set `NEXT_PUBLIC_AGENT_API_URL=https://api.popped.dev` on the Pages project.

## Testing and reset

See [`docs/TESTING-AND-RESET.md`](../../docs/TESTING-AND-RESET.md) and `scripts/reset-test-state.sh`.

## Abuse controls

- Contributor name required (matches `popped.dev:contributor-name` in localStorage)
- Rate limit: 5 runs/hour per IP + session (KV)
- `CURSOR_API_KEY` never sent to the browser

## Automatic cleanup

A cron trigger runs hourly (`0 * * * *`) and removes abandoned design sessions:

| What | When |
|---|---|
| `cursor/design/*` Git branch | No activity for `CLEANUP_TTL_MS` (default **1 hour**) |
| Session + run KV keys | Same TTL, refreshed on each message |
| Branches with open PRs | **Kept** (also marked `protected` on submit) |
| Orphan branches (no KV session) | Deleted if no open PR |

Tune TTL in `wrangler.toml`:

```toml
CLEANUP_TTL_MS = "3600000"  # 1 hour in ms
```

Manual reset still available via `scripts/reset-test-state.sh`.

## Prerequisites checklist

1. Cursor dashboard: GitHub integration authorized for `parse-nip/popped-dev`
2. `CURSOR_API_KEY` stored as Worker secret
3. Cloudflare Pages ↔ GitHub connected; build `npm run build`, output `out`
4. Worker route `popped.dev/api/*` configured
5. KV namespace bound as `SESSIONS`

## Verification

1. `wrangler dev` + Next dev with `NEXT_PUBLIC_AGENT_API_URL`
2. Design mode → select resume heading → send chat message
3. Agent pushes branch → Pages preview builds → iframe shows changes
4. Submit for review → PR link in modal
5. `npm run verify:locked` passes on PR branch
