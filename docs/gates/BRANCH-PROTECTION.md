# Branch protection (host configuration)

Git is not the enforcement store for this control. The live ruleset is [main-conductor-protection](https://github.com/tkhandelwal/cursor-manager/rules/23189136) (id `23189136`) on `tkhandelwal/cursor-manager`.

Verified 2026-09-13 via `GET /repos/tkhandelwal/cursor-manager/rulesets/23189136`.

## Applied rules

- Target: default branch (`main`)
- Enforcement: active; no bypass actors
- Pull requests required; squash or merge allowed
- Required approving review count: 0 (solo maintainer; a second GitHub account is not available)
- Required status check: `verify` (the CI job), strict against the latest `main`
- Force-push and branch deletion on `main` are blocked
- `delete_branch_on_merge` is enabled on the repository

## Named human merger

GitHub user `tkhandelwal` is the named human merger. Agents must not merge `main`. This is policy: an agent holding that user's token can still click merge.

## Re-verify

```
gh api repos/tkhandelwal/cursor-manager/rulesets/23189136
```
