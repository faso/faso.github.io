# Boxripper for GitHub Pages

Public browser-only copy of `/home/faso/server/apps/boxripper/frontend`,
created 2026-10-22. Published at https://faso.github.io/boxripper/.
Photos, face editing, dithering, local IndexedDB autosave, the 3D viewer and GLB
export all run locally. There is no backend, boxmap upload, account or analytics.
The original server-hosted app remains a separate copy.

## Development and publishing

From this directory:

```sh
npm ci
npm run dev
npm run build
```

Open the dev server at `/boxripper/`. Vite builds into the repository's tracked
`boxripper/` directory. Edit source here, rebuild, then commit source and build
output together and immediately push `master`. GitHub Pages publishes the root
of `master` using the existing legacy Pages build. Do not switch the entire site
to a new deployment workflow or edit the generated bundle by hand.

All fonts and runtime dependencies are served from this site. No remote service
is required once the editor has loaded. Reloading still needs the static site;
there is no offline install/service worker. Autosave keeps one project in this
browser's storage, which can be cleared by the browser. A GLB download is a model
export, not an editable project backup.

## Focused verification

```sh
cd tests
npm ci
npx playwright test workflow.spec.ts sample.spec.ts viewer-export.spec.ts
```

The tests start the source dev server. To check the actual static build, serve
the repository root (for example `python3 -m http.server 5181 --bind 127.0.0.1`)
and set `BOXRIPPER_URL=http://127.0.0.1:5181`. The same setting accepts
`https://faso.github.io` for live verification; tests use disposable local browser
profiles and never write to a server. Run only relevant specs, not the full suite.

## Public workspace UI (2026-10-22)

Uses the main site's Kanagawa colors and bundled Cabin Mono for labels. The
workspace has a collapsible guide, section links, compact face selectors, a
sticky desktop model preview and larger phone corner handles. Empty texture
controls stay hidden until a face is ready. The sample button creates an original
illustrated cabinet in canvas, with three editable face selections; it requires
no image download. Starting a new project makes the sample available again.

The extraction passed 12 focused static-build checks before publishing. The UI
pass passed 12 focused checks (workflow, sample and viewer/export), including
network-disabled editing, sample creation, local save and GLB download. Layouts
were inspected at 320–1440 px without horizontal overflow. Live GitHub Pages
verification checked matching HTML, JS, CSS and font bytes, keyboard upload,
phone taps, local restore/reset, storage failures and network-disabled exports.
