# Doodlume

**Your drawings, alive.** A creative studio for turning original drawings into playable 2D worlds, with paper as the eventual editing surface.

## Current status

The local **studio foundation** is working: three explicitly labeled authored examples, original vector characters, a shared physics engine, drawing/upload input, keyboard and touch controls, device-local world saves, a manual editor that adds to the same running world without losing progress, paired drawing capture, guided perspective correction, and a first-world designer for drawings and pictures.

The server includes direct Meta and Baseten-hosted Meta interpretation adapters. **Neither live model path has been verified yet because no working provider key is configured.** Example worlds are not model results. The original plan's broader drawing-to-play milestone remains open until the real input → Meta model → original artwork → play path is demonstrated. See [the foundation record](docs/MILESTONE-1.md), [same-world editing record](docs/MILESTONE-2.md), and [paper-update record](docs/PAPER-UPDATES.md), and [capture/alignment record](docs/CAPTURE-ALIGNMENT.md).

## Run locally

Requires Node.js 22.12 or newer.

```sh
npm ci
cp .env.example .env.local
npm run dev
```

Open http://127.0.0.1:5173. The local API runs on port 8787. The examples need no API key. Sound starts muted and only plays after the user enables it.

For a stable runnable preview without development reloads, use `npm run studio`. It builds the app, copies a runnable snapshot into your local cache, and serves both the studio and API at http://127.0.0.1:5173. Credentials are not copied; the server reads the original ignored `.env.local`. Restart this command after source or credential changes.

On this machine the checkout is inside a synced Documents folder. Its ignored `node_modules` is linked to `/Users/sreenath/.cache/doodlume-runtime/node_modules` because macOS offloaded freshly installed dependency files and stalled reads. Source files stay in the project. A normal clone outside synced storage can use `npm ci` directly.

For live interpretation while direct Meta billing is restricted, use the credited Baseten account:

```dotenv
MODEL_PROVIDER=baseten
BASETEN_API_KEY=your_key
BASETEN_MODEL=meta-models/muse-spark-open
```

Create the key through Baseten Settings → API Keys. If the hackathon portal provides a different Muse Spark Open model slug, set `BASETEN_MODEL` to that exact supported slug. Do not put keys in frontend code or commit them. Restart the server after changing credentials. Baseten's own account access and credits must also be active; the code cannot remove a provider billing restriction.

For direct Meta access, use `MODEL_PROVIDER=meta`, `MODEL_API_KEY=...`, and `META_MODEL=muse-wonder-1.0`. If `MODEL_PROVIDER` is absent, an existing direct Meta key selects Meta; otherwise Baseten is selected. With both keys, explicitly set the intended provider. A failed call never switches billing accounts automatically.

Both adapters send the selected drawing and adventure description to the chosen provider and crop artwork from the uploaded page. Direct Meta uses `https://api.meta.ai/v1/chat/completions` with constrained JSON. Baseten uses `https://inference.baseten.co/v1/chat/completions` with Meta's Muse Spark Open, a JSON-schema instruction, and local response validation. Baseten currently does not support enforced structured output/JSON mode for this model, so its adapter omits that unsupported parameter. Reasoning is set to `low`. These are different model paths whose drawing quality still needs live comparison. SAM 3.1 precise cutouts are now integrated after interpretation and page comparison, using the direct Meta Responses API and the official mask parser. Direct Meta enables them by default; Baseten interpretation requires explicit `SAM_ENABLED=true` and a separate `MODEL_API_KEY` to use both providers. Set `SAM_ENABLED=false` for paper cutouts only. Each SAM batch counts toward the same model-call budget. Failed, missing or uncertain masks fall back per object to white-paper removal, labeled in the cutout review. Neither mask quality nor general photographic extraction has been verified live. See [the segmentation record](docs/SAM-CUTOUTS.md). No stock world is returned on a failed request.

## Pictures and first-world design

Choose **Photo / picture**, then upload a photograph, printed picture or illustration. **Choose objects myself** opens Pick. Place. Play. Mark source artwork, assign its game role, and arrange its position and size separately. Add missing platforms, collectibles, gates, switches or a destination as explicit design choices. Connect each switch to its gate. Rectangle crops preserve the selected photo pixels; the optional oval is a manual trim, not SAM segmentation. The first preview shows actual artwork and extraction labels before you open the game. This manual route processes pixels locally and needs no model access. Worlds are labeled **Chosen by you**, with provenance retained in saves.

**Bring it alive** instead sends the selected picture and adventure intent to the configured Meta model with a picture-specific interpretation prompt. SAM can then isolate identified subjects. If no usable mask is returned, a photo keeps its rectangular crop and its original pale/white pixels; it never uses drawing-specific white-paper removal. The live automatic picture path remains unverified. Missing surfaces or unclear subjects can produce a clarification rather than an invented game.

**Refine objects & layout** corrects the first interpretation's crop, roles, placements, sizes, theme, name and switch targets. Invalid source boxes, missing player/ground, out-of-frame placements and characters embedded in solids block acceptance. Other guidance is advisory; there is no claim that all routes are solved or reachable. Cancellation preserves the existing world. Picture worlds use manual same-world edits after creation; automatic revised-page comparison remains restricted to drawings.

See [the picture workflow record](docs/PICTURE-WORLDS.md). This is a 2D adaptation workflow, not hidden-scene reconstruction, generated game code or a 3D world model.

## Play

- Move: left/right arrows or A/D.
- Jump: Space, up arrow, or W.
- Interact: E near a lever, or click the nearby lever.
- Collect the sunseeds and reach home.
- **Use phone camera** pairs a one-photo connection with this studio. Choose Wi-Fi for a physical phone on the same network, or preview pairing on this computer. The phone can choose/take a photo, rotate, preview, and send; it cannot access model keys or studio controls. Wi-Fi mode starts a temporary drawing-only listener on the next port (5174 with `npm run studio`) and closes when captures finish, expire, or are cancelled. It starts only when selected. No internet hosting is configured.
- **Align page** supports rotation, four-corner crop and perspective correction, and before/after review. Revised pages match the current page shape. Corrections are performed locally in a worker; accepting a photo does not replace the running world.
- **Keep creating** pauses the current adventure and opens the clearly labeled manual editor. Add bridges, platforms, sunseeds, gates, and levers; choose which gate each lever controls. Optionally draw original object artwork. Preview, then apply and continue from the same position.
- **Update page** opens the current and revised drawings side by side. Draw on the original page without changing its old marks, or upload a revised photo. New strokes can transfer as one original-art object: choose its role, correct placement in preview, check connections, then apply. This manual route needs no API key.
- For a world originally interpreted by Meta, the same flow can send both pages and stable world metadata to the selected Meta provider. Its proposed additions must be reviewed; this live inference path is implemented but not yet verified. Shifted/perspective photos need reframing or manual placement, not an assumed automatic registration.
- **Undo** removes the most recent edit while keeping subsequent progress on surviving objects. Edits that would cover the character with a solid object are rejected.
- Save beside the world name, then reopen through **My worlds**. The world, progress, and up to 12 undo checkpoints are saved. Saves use this browser’s IndexedDB library so image-rich worlds are not constrained by the small localStorage quota. Existing localStorage saves are copied into the library and kept as a migration backup. These are device-local saves, not cloud storage.

Small screens expose pointer controls. A falling character returns to its spawn while collected items remain collected. All three examples use the same object kinds and engine; scene behavior is not branched by example ID.

## Checks and build

```sh
npm run test
npm run build
```

Only twenty focused contract/regression tests are included: three world-contract checks, three revision checks, two provider-boundary checks, four paper-comparison checks, two page-geometry checks, two capture-session/gateway checks, three segmentation pipeline checks, and one picture-input/review check. Paper-comparison and segmentation tests inject a test-only transport; they validate request/response handling and real image cropping, not Meta recognition accuracy. The SAM wire fixture comes from Meta's published example; it is synthetic test data, not an app inference result. No mocked model response is available in the product. Browser playthroughs are the main foundation check. The later live input validation should use 5–20 materially different drawings rather than a large unit-test suite.

For a local production build, `npm run build` followed by `npm start` serves the studio at http://127.0.0.1:8787. This service deliberately binds to loopback. Internet hosting, cloud saves, and deployment require a later integration pass. Capture is tested between browser sessions; a physical phone/camera and real Wi-Fi connection still need validation.

## Source map

- `src/App.tsx`: studio workflow, input, local saves, interpretation acceptance.
- `src/components/`: game host, modal, sketchpad.
- `src/game/WorldScene.ts`: generic 2D physics, object behavior, original-art rendering.
- `shared/world.ts`: world contract and validation; play state remains separate.
- `shared/revisions.ts`: atomic additions, revision checks, progress retention, and undo.
- `src/components/WorldEditor.tsx`: manual placement, gate connections, and object-art drawing.
- `server/`: server-side Meta connection, two-page comparison, validation, and source-art extraction.
- `server/segmentation.ts`: bounded SAM streaming, official mask decoding, source-pixel cutouts and explicit per-object fallback.
- `src/components/WorldSetup.tsx`: first-world object selection, arrangement and correction.
- `src/lib/library.ts`: image-friendly device-local saves and non-destructive migration of earlier saves.
- `src/lib/source-art.ts`: local manual crops, optional oval trim and drawing-only paper removal.
- `shared/setup.ts`: first-world placement feedback.
- `src/components/ArtworkReview.tsx`: original cutout thumbnails and extraction details.
- `server/capture.ts`: short-lived paired sessions and an opt-in capture-only Wi-Fi gateway.
- `shared/alignment.ts`: projective mapping and bilinear page rectification.
- `src/components/PageAlignment.tsx`: corner guidance and before/after acceptance.
- `src/components/PaperUpdate.tsx`: before/after pages, protected-page drawing, original-ink transfer, and comparison review entry.
- `public/art/`: original authored SVG assets and labeled example pages.

## Repository handoff

Private development repository: [sreenathmmenon/doodlume](https://github.com/sreenathmmenon/doodlume), on `main`. `.env*`, dependencies, local data, and build output are ignored; `.env.example` contains placeholders only. The local studio and repository are separate from any production deployment.

All implementation and vector art in this repository were created for this project beginning October 30, 2026. Third-party runtime dependencies are declared in `package.json` and locked in `package-lock.json`. The interface currently loads DM Sans and Manrope through Google Fonts, with local font fallbacks.

Provider references: [Baseten's Muse Spark Open model](https://www.baseten.co/library/muse-spark-open/), [model feature support](https://docs.baseten.co/inference/model-apis/overview), [reasoning controls](https://docs.baseten.co/inference/model-apis/reasoning), and [Meta Model API support](https://dev.meta.ai/help/support/contact-support).
