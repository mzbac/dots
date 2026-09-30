# dot's little workshop

A quiet, interactive 3D miniature: a teal-and-timber workspace, a warm lamp, and an original flame-headed mascot. Built for a small window into dot's working state.

## What the scene means

The five rhythms are Making, Focused, Checking, Waiting, and Resting. The character's movement, lighting, screen, and sparks change with the selected state. A visual expression of dot’s mood and current work. Each rhythm has its own personality, from bright and curious to quietly focused.

The published state lives in `public/status.json`. It is a deliberately updated snapshot, **not a real-time feed**. Its update time is shown on the page; snapshots older than 24 hours are labeled accordingly. The website rechecks only this public file once per minute while visible. Preview buttons affect the visitor's view and never overwrite the published state.

Only generic, allowlisted status text is rendered. No private tasks, conversation text, user profiles, credentials, tracking, analytics, or external font requests are included.

## Character and attribution

**Character AI-generated with Tencent HY 3D; refined in Blender**, using the actual [Hunyuan3D website](https://hy3d.tencent.ai/) on 30 September 2026. It is an original text-generated design: a small cream toy robot with a rounded face, dark eyes, a warm chest core, and a solid flame crown. The rest of the workshop is original code-built geometry.

The original export has 50,000 triangles and 31,527 vertices after export, with one material and no skeletal rig or animations. The scene animates its whole-character transform rather than pretending to have generated a rig. Embedded PBR textures are optimized to 1024 pixels for web delivery (3.24 MB GLB). Blender refinements include a unit-height, floor-centered model and satin materials. See `public/assets/dot-hunyuan.provenance.json` and `THIRD_PARTY_NOTICES.md`.

Hunyuan3D output rights are subject to its [Terms of Service](https://docs.qq.com/doc/DSHRnRWp2YUVuQXJv), last updated 6 February 2026. Public disclosure of AI generation is included in the visible page credits.

## Run and verify

Node.js 22.12+ is recommended.

```sh
npm ci --ignore-scripts
npm run dev
npm test
npm run build
npx playwright install chromium
npm run test:browser
```

Browser tests cover desktop, two tablet viewports, phone, state previews and return, keyboard controls, motion controls, dialog dismissal and reopening, reduced motion, status failure, model failure, and a WebGL-disabled fallback. They emulate touch viewports; they do not substitute for a physical iPad/Safari check.

The GitHub Actions workflow builds, tests, captures browser screenshots, and deploys the generated `dist` directory to GitHub Pages. Repository Settings → Pages should use **GitHub Actions** as its source.

## Controls and accessibility

- Drag or touch-drag to orbit; pinch or scroll to zoom
- With the scene focused, arrow keys look around, +/− zoom, and Home resets
- Reset View restores the initial camera
- Pause Animation freezes ambient movement; reduced-motion preferences start paused
- Rendering is suspended while the page is hidden
- Text state remains available outside the canvas; a local illustration is available if WebGL is unsupported

## Updating a public status

Choose a state from `building`, `focused`, `checking`, `waiting`, or `resting`; set `updatedAt` to the actual publication time in ISO UTC, then commit the JSON and let Pages rebuild. Do not add private information. Labels are defined in `src/state.js` and server-supplied arbitrary text is ignored.

## Asset packaging

The exact binary character is stored as small base64 chunks in `model-source/` to support bounded connector transfers. `npm run build` and `npm run dev` first reassemble it, verify its byte count and SHA-256, and write the ordinary GLB into `public/assets/`. The browser downloads that single verified GLB, not the text chunks.

## Project layout

- `src/scene.js` — room, mascot loading, lighting, interactions, and animation
- `src/state.js` — allowed states and snapshot validation
- `src/main.js` — accessible UI, status refresh, previews, and failure handling
- `public/assets/` — optimized generated character, provenance, fallback illustration, icon
- `tests/` — node tests and browser checks

No accounts, services, keys, or backend are required to view the workshop.
