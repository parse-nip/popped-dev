# Testing the agent + preview flow, then resetting

Use this when you want to try design mode end-to-end and return to a clean baseline **without merging test changes to `main`**.

## What a test run creates

| Layer | What gets created | Affects production? |
|---|---|---|
| **Browser** | `localStorage` (welcome, contributor name), `sessionStorage` (agent session) | No |
| **Worker KV** | `session:*`, `run:*`, `ratelimit:*` keys | No |
| **GitHub** | Branch `cursor/design/{sessionId}` with style commits | No, until merged |
| **GitHub** | Optional PR (if you submit for review) | Only if merged |
| **Cloudflare Pages** | Preview deployment for the test branch | No (preview URL only) |
| **Cursor** | Cloud agent runs (`bc-*`) | No |

**Production (`main` / `popped.dev`) stays unchanged** if you never merge a test PR.

---

## Test checklist

1. Open `https://popped.dev` (or local dev with Worker running).
2. Complete welcome → enter a test contributor name.
3. Turn on **Design** mode → click a resume element → send a style request.
4. Wait for SSE status → preview iframe (branch alias URL).
5. Optional: **Submit for review** → confirm PR opens on GitHub (do not merge if testing).

---

## Reset levels

Pick how far back you want to go.

### Level 1 — Same browser, new agent session (quick)

Clears agent session only. Keeps welcome dismissed and contributor name.

In DevTools → Console on `popped.dev`:

```javascript
sessionStorage.removeItem("popped.dev:agent-session-id");
sessionStorage.removeItem("popped.dev:agent-id");
location.reload();
```

Next chat creates a **new** `cursor/design/{sessionId}` branch.

### Level 2 — Full “first visit” UX in browser

```javascript
localStorage.removeItem("popped.dev:welcome-dismissed");
localStorage.removeItem("popped.dev:contributor-name");
sessionStorage.removeItem("popped.dev:agent-session-id");
sessionStorage.removeItem("popped.dev:agent-id");
location.reload();
```

Welcome modal and name step return.

### Level 3 — Clear Worker KV (rate limits + server sessions)

From `workers/agent-api` (logged into Wrangler):

```bash
# List keys (optional)
npx wrangler kv key list --namespace-id=99cbe29666424381b3b1837e2551d237

# Delete all keys (nuclear reset for this namespace)
npx wrangler kv bulk delete --namespace-id=99cbe29666424381b3b1837e2551d237 <(npx wrangler kv key list --namespace-id=99cbe29666424381b3b1837e2551d237 | jq -r '.[].name')
```

Or use the helper script:

```bash
./scripts/reset-test-state.sh --kv
```

Clears rate-limit blocks and orphaned session/run records.

### Level 4 — Remove test Git branches (recommended after testing)

Delete agent branches on GitHub (does not touch `main`):

```bash
./scripts/reset-test-state.sh --git
```

Or manually:

```bash
gh api repos/parse-nip/popped-dev/git/refs/heads --jq '.[].ref' | grep 'cursor/design' | while read ref; do
  gh api -X DELETE "repos/parse-nip/popped-dev/git/refs/heads/${ref#refs/heads/}"
done
```

Close test PRs without merging:

```bash
gh pr list --head cursor/design --state open
gh pr close <number> --comment "Test PR — not merging"
```

### Level 5 — Undo a mistaken merge (only if you merged a test PR)

```bash
git checkout main
git pull
git revert -m 1 <merge-commit-sha>
git push origin main
```

Pages will redeploy reverted `main`. This is the only way to “reset production” after a merge.

---

## Recommended workflow

```text
1. Level 2 (browser)     → fresh UX
2. Run your test           → design chat + preview
3. Level 4 (git branches) → delete cursor/design/*
4. Level 3 (KV)            → clear rate limits if you hit 5/hour
5. Do NOT merge test PRs
```

Preview deployments on Pages for deleted branches become stale URLs; harmless.

---

## Local dev reset

Same browser steps as Level 1–2. Restart `wrangler dev` if needed. Local KV uses the preview namespace (`preview_id` in `wrangler.toml`); production KV is separate.

```bash
cd workers/agent-api
npx wrangler kv key list --namespace-id=f93d5fe63942416a86c255c140616f7b  # preview KV
```

---

## Quiz

**Easy:** If you only preview on a branch and never merge, does `popped.dev` change for other visitors?

**Medium:** Why does clearing `sessionStorage` create a new Git branch on the next test?

**Hard:** You merged a test PR by accident. Which reset level fixes production?
