<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Cursor Cloud specific instructions

- This repo is two things: a **Next.js 16 web app** ("Session Guard", package `session-guard`) and a **Cursor plugin** under `plugin/`. Node 22 is present in the base image; `npm ci` is the only bootstrap step.
- Run the app with `npm run dev` — it binds `0.0.0.0:43127` (non-default port; set in `package.json`, not 3000).
- `npm test` runs `node --test` via `tsx` over an explicit file list in `package.json`: `lib/*.test.ts`, `components/*.test.tsx`, and the plugin's `plugin/scripts/*.test.mjs`. When you add a new test file, add it to that `test` script or it won't run.
- Component tests render via `react-dom/server` (`renderToStaticMarkup`) — no DOM/jsdom needed for those. Interaction tests use `happy-dom` registered through `--import test/setup-dom.ts`; base-ui needs the `ResizeObserver`/`matchMedia` stubs in that setup file.
- Plugin hook scripts (`session-start.mjs` etc.) run on stdin and persist to `~/.cursor/cursor-manager/state.json`; only the pure helpers in `lib.mjs` are unit-tested (importing a hook script executes it).
- Pure state/logic lives in `lib/` (`guard.ts`, `tweaks.ts`, `cursorignore.ts`) and is the right place to add tested behavior; React panels in `components/` stay thin.
