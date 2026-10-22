# boxripper headless tests

Local-only Playwright suite driving the real app in headless Chromium (WebGL via
swiftshader). **Not** wired into CI yet — run it by hand.

```bash
cd /home/faso/faso.github.io/tools/boxripper/tests
npm install                 # first time only
npx playwright install chromium chromium-headless-shell   # first time only
npx playwright test workflow.spec.ts sample.spec.ts viewer-export.spec.ts
npx playwright test resolution.spec.ts   # a single file
```

Run only the specs relevant to a change; the full suite requires an explicit request.

The config (`playwright.config.ts`) auto-starts `npm run dev` on port 5180 from
`..`, so no build or running container is needed.

## Coverage

| Spec | What it checks |
|------|----------------|
| `upload` | single + multiple photo upload into the strip |
| `rectify` | capture → non-blank texture, **no vertical flip**, aspect ≈ source |
| `dither` | every mode (palette/bw) × algorithm renders; palette-size visibility; sizes 2 & 32 |
| `resolution` | **regression:** 3 captured faces + a duplicated face survive a resolution sweep (no black-out) |
| `duplicate` | copy a captured face; empty-source annotation; mirror; reverse-order chains, cycle prevention, clear propagation and reload |
| `rotate` | 90° swaps dims, 180° restores, CCW wraps to 270°, persists across reload |
| `proportions` | recompute derives W/D from aspects; manual slider readout |
| `viewer-export` | 3D box renders non-background pixels; export is a valid `.glb` (glTF magic) |
| `persistence` | photos + faces restore after reload; Reset clears |
| `workflow` | keyboard upload/corners, invalid images, source-coordinate reset, mobile sizing and editor disposal, crossed-quad protection, pending-save reset, rotated proportions, named exports, blocked storage and browser-only offline export |
| `sample` | local sample creation without network, copy, autosave/reload, GLB download and phone controls |
| `loupe` | magnifier is `position: fixed` top-right while dragging a corner |

Helpers in `helpers.ts`. Note: reading a face's texture state uses the face-card
thumbnail (`faceTexStates`) rather than clicking the card, so assertions observe the actual batch result
without causing extra editor work. All six faces, including bottom, are covered
by these helpers. The offline workflow test checks that editing, autosave and GLB export make no HTTP requests after page load. Set `BOXRIPPER_URL` to check a static or public deployment.

The fresh-project helper awaits initialization and database deletion before reloading.
Responsive assertions wait for the picker ResizeObserver to settle after a viewport
change; both waits matter when checking the live GitHub Pages build.
