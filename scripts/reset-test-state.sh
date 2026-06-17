#!/usr/bin/env bash
# Reset agent test artifacts (KV + GitHub branches). Does not touch main or production deploy.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
KV_NAMESPACE_ID="99cbe29666424381b3b1837e2551d237"
REPO="parse-nip/popped-dev"

usage() {
  cat <<EOF
Usage: $0 [--kv] [--git] [--all]

  --kv   Delete all keys in production SESSIONS KV namespace
  --git  Delete remote branches matching cursor/design/*
  --all  Both

Browser reset (run in DevTools console on popped.dev):
  localStorage.removeItem("popped.dev:welcome-dismissed");
  localStorage.removeItem("popped.dev:contributor-name");
  sessionStorage.removeItem("popped.dev:agent-session-id");
  sessionStorage.removeItem("popped.dev:agent-id");
  location.reload();

See docs/TESTING-AND-RESET.md for full guide.
EOF
}

reset_kv() {
  echo "Listing KV keys in namespace $KV_NAMESPACE_ID..."
  keys=$(cd "$ROOT/workers/agent-api" && npx wrangler kv key list --namespace-id="$KV_NAMESPACE_ID" 2>/dev/null | jq -r '.[].name' || true)
  if [ -z "$keys" ]; then
    echo "No KV keys found (or jq/wrangler failed)."
    return 0
  fi
  count=$(echo "$keys" | wc -l | tr -d ' ')
  echo "Deleting $count KV keys..."
  echo "$keys" | while read -r key; do
    [ -n "$key" ] && cd "$ROOT/workers/agent-api" && npx wrangler kv key delete "$key" --namespace-id="$KV_NAMESPACE_ID"
  done
  echo "KV reset done."
}

reset_git() {
  if ! command -v gh >/dev/null 2>&1; then
    echo "gh CLI not found. Install GitHub CLI or delete branches manually."
    exit 1
  fi
  echo "Finding cursor/design branches on $REPO..."
  branches=$(gh api "repos/$REPO/git/refs/heads" --jq '.[].ref' | grep 'refs/heads/cursor/design' || true)
  if [ -z "$branches" ]; then
    echo "No cursor/design branches found."
    return 0
  fi
  echo "$branches" | while read -r ref; do
    branch="${ref#refs/heads/}"
    echo "Deleting branch $branch"
    gh api -X DELETE "repos/$REPO/git/refs/heads/$branch"
  done
  echo "Git branch reset done."
}

DO_KV=false
DO_GIT=false
for arg in "$@"; do
  case "$arg" in
    --kv) DO_KV=true ;;
    --git) DO_GIT=true ;;
    --all) DO_KV=true; DO_GIT=true ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $arg"; usage; exit 1 ;;
  esac
done

if [ "$DO_KV" = false ] && [ "$DO_GIT" = false ]; then
  usage
  exit 1
fi

if [ "$DO_KV" = true ]; then reset_kv; fi
if [ "$DO_GIT" = true ]; then reset_git; fi
