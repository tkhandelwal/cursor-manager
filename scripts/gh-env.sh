#!/usr/bin/env bash
# Pin gh to this repo's GitHub account for the current shell.
#
#   source scripts/gh-env.sh
#
# gh picks its account from a machine-wide "active account" setting, which on
# this setup drifts back to another account on its own — sometimes between two
# consecutive commands. GH_TOKEN overrides that entirely: while it is set, gh
# uses this account regardless of what the active account happens to be.
#
# The token is read from gh's keyring each time and never written to disk.
#
# Scope note: this is SHELL-scoped, not repo-scoped. Every gh command in this
# shell uses this account, including in other directories. Open a new shell for
# work on another account.
GH_ENV_ACCOUNT="tkhandelwal"

if ! command -v gh >/dev/null 2>&1; then
  echo "gh-env: gh is not on PATH" >&2
else
  __gh_env_token="$(gh auth token --user "$GH_ENV_ACCOUNT" 2>/dev/null)"
  if [ -n "$__gh_env_token" ]; then
    export GH_TOKEN="$__gh_env_token"
    echo "gh-env: GH_TOKEN set for $GH_ENV_ACCOUNT (token not printed)"
  else
    echo "gh-env: no token for $GH_ENV_ACCOUNT. Run: gh auth login --hostname github.com" >&2
  fi
  unset __gh_env_token
fi
