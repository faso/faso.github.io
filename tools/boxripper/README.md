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

## Public workspace UI (2026-10-23)

The public copy follows the original Boxripper's dark green palette, system
fonts, panel sizing, face thumbnails and quiet green export button. The added
standalone guide and desktop navigation bar were removed at the user's request;
keep future visual changes close to the original.

Functional improvements remain: a locally drawn sample with three editable
faces, larger touch corner handles, a phone preview shortcut, hidden empty
texture controls, local autosave and browser-only GLB export. The sample is a
small optional button in the photo panel. The server integration stays absent.

Run the focused sample and viewer/export checks after layout changes. Verify
phone sizing and the published static assets after pushing.
