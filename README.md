# Doodlume

**Your drawings, alive.** A creative studio for turning original drawings into playable 2D worlds, with paper as the eventual editing surface.

## Current status

The local studio includes a play-first interface, three labeled authored examples, drawing/photo input, a real Meta Muse Spark Open connection through Fireworks, original-source artwork, keyboard/touch controls, device-local saves, paired drawing capture, perspective correction, and same-world editing with undo. **Add space** extends a world beyond its original page while retaining objects and progress; the validated limits are 12,000 × 5,000 and 160 objects.

Live Fireworks image requests are verified. The latest qualification used 12 distinct authored digital inputs: eight accepted previews, one repair review and three actionable clarifications; three difficult-case repeats were accepted again. One additional real browser request exercised recovery, bringing this qualification turn to 16 model calls. A clean model-generated world was played through, collected 2/2 objects, completed and saved; the ambiguous-gate recovery was corrected, retained through close/reopen, then played and saved. These results do not establish general recognition accuracy or every route's playability. Actual photographs/magazine pages, physical devices, live SAM 3.1 and creator engagement remain unqualified. Direct Meta access remains restricted; Baseten returned HTTP 403; an unsuccessful private Modal SAM 2.1 trial was stopped and is not integrated. See [model access](docs/MODEL-ACCESS.md) and the [dated verification record](docs/LIVE-VALIDATION.md). Examples remain clearly separate from model results.

Recognition failures can retain valid original-art selections in a separate repair draft. Missing characters, ground, ambiguous gate links and blank crops receive targeted corrections; invalid partial drafts never enter the game. Closing the designer keeps local corrections for resuming. The editor adds zoom, pan, fit, object focus and keyboard placement. Destination rules let the creator mark specific collectibles and levers as required; unchecked objects remain optional. Backups preserve exact source artwork with deduplicated assets and conflict-safe imports.

The maximum 160-object, 12,000 × 5,000 authored QA world measured a 9.8 ms p95 frame interval after bounded terrain baking, compared with 109.3 ms before, on one named Mac/Chrome profile. Twenty restart transitions kept one canvas active. These are measured local checks, not broad device certification or proof of leak-free memory; full conditions and remaining gates are in the verification record.

## Run locally

Requires Node.js 22.12 or newer.

```sh
npm ci
cp .env.example .env.local
npm run dev
```

Open http://127.0.0.1:5173. The local API runs on port 8787. The examples need no API key. Sound starts muted and only plays after the user enables it.

For a stable runnable preview without development reloads, use `npm run studio`. It builds the app, copies a runnable snapshot into your local cache, and serves both the studio and API at http://127.0.0.1:5173. Credentials are not copied; the server reads the original ignored `.env.local` and allowlisted provider keys from `~/.env`. Restart this command after source or credential changes.

On this machine the checkout is inside a synced Documents folder. Its ignored `node_modules` is linked to `/Users/sreenath/.cache/doodlume-runtime/node_modules` because macOS offloaded freshly installed dependency files and stalled reads. Source files stay in the project. A normal clone outside synced storage can use `npm ci` directly.

Baseten is supported, but the current account returned HTTP 403:

```dotenv
MODEL_PROVIDER=baseten
BASETEN_API_KEY=your_key
BASETEN_MODEL=meta-models/muse-spark-open
```

Create the key through Baseten Settings → API Keys. If the hackathon portal provides a different Muse Spark Open model slug, set `BASETEN_MODEL` to that exact supported slug. Do not put keys in frontend code or commit them. Restart the server after changing credentials. Baseten's own account access and credits must also be active; the code cannot remove a provider billing restriction.

Fireworks is also supported with an explicit server configuration:

```dotenv
MODEL_PROVIDER=fireworks
FIREWORKS_API_KEY=your_key
FIREWORKS_MODEL=accounts/fireworks/models/muse-spark-open
```

Fireworks uses its official inference endpoint, the same Meta-only model boundary, prompt schema and local validation. No failure silently changes providers. The owner’s Fireworks account has now completed real image interpretation calls. Modal also offers a Muse Spark Open Shared Endpoint, but it is not wired into this application yet. See [the model access record](docs/MODEL-ACCESS.md).

For direct Meta access, use `MODEL_PROVIDER=meta`, `MODEL_API_KEY=...`, and `META_MODEL=muse-wonder-1.0`. If `MODEL_PROVIDER` is absent, an existing direct Meta key selects Meta; otherwise Baseten is selected. With both keys, explicitly set the intended provider. A failed call never switches billing accounts automatically.

All adapters send the selected drawing and adventure description to the chosen provider and crop artwork from the uploaded page. Direct Meta uses `https://api.meta.ai/v1/chat/completions` with constrained JSON. Baseten uses `https://inference.baseten.co/v1/chat/completions` with Meta's Muse Spark Open, a JSON-schema instruction, and local response validation. Baseten currently does not support enforced structured output/JSON mode for this model, so its adapter omits that unsupported parameter. Reasoning is set to `low`. These are different model paths whose drawing quality still needs live comparison. SAM 3.1 precise cutouts are now integrated after interpretation and page comparison, using the direct Meta Responses API and the official mask parser. Direct Meta enables them by default; Baseten interpretation requires explicit `SAM_ENABLED=true` and a separate `MODEL_API_KEY` to use both providers. Set `SAM_ENABLED=false` for paper cutouts only. Each SAM batch counts toward the same model-call budget. Failed, missing or uncertain masks fall back per object to white-paper removal, labeled in the cutout review. Neither mask quality nor general photographic extraction has been verified live. See [the segmentation record](docs/SAM-CUTOUTS.md). No stock world is returned on a failed request.

## Pictures and first-world design

Choose **Photo**, then upload a photograph, printed picture or illustration. **Design it myself** opens the object designer. Mark source artwork, assign its game role, and arrange its position and size separately. Add missing platforms, collectibles, gates, switches or a destination as explicit design choices. Connect each switch to its gate. Rectangle crops preserve the selected photo pixels; the optional oval is a manual trim, not SAM segmentation. The first preview shows actual artwork and extraction labels before you open the game. This manual route processes pixels locally and needs no model access. Worlds are labeled **Chosen by you**, with provenance retained in saves.

**Create world** instead sends the selected picture and adventure intent to the configured Meta model with a picture-specific interpretation prompt. SAM can then isolate identified subjects. If no usable mask is returned, a photo keeps its rectangular crop and its original pale/white pixels; it never uses drawing-specific white-paper removal. The automatic picture path has accepted two authored synthetic illustration/raster fixtures; actual photographic or magazine recognition remains unqualified. One synthetic raster cropped part of the subject, so check the full outline and repair its box in review. Missing surfaces or unclear subjects can produce a clarification rather than an invented game.

**Edit objects** corrects the first interpretation's crop, roles, placements, sizes, theme, name and switch targets. Invalid source boxes, missing player/ground, out-of-frame placements and characters embedded in solids block acceptance. Other guidance is advisory; there is no claim that all routes are solved or reachable. Closing preserves both the existing world and paused designer corrections. Declared original artwork that cannot load produces a recoverable error rather than a substitute character. Picture worlds use manual same-world edits after creation; automatic revised-page comparison remains restricted to drawings.

See [the picture workflow record](docs/PICTURE-WORLDS.md). This is a 2D adaptation workflow, not hidden-scene reconstruction, generated game code or a 3D world model.

## Game presentation and feel

The three themes have authored procedural environments with layered trees, lunar arches and amber rock formations, parallax, light shafts, drifting motes and a restrained foreground vignette. Original drawing and photo subjects remain the actual playable artwork. The generic engine adds separate visual character poses, breathing, running rhythm, airborne stretch, landing compression, feet-based dust, collectible light rings and rewards. Animation does not resize the physics body. Camera follow includes directional anticipation and remains inside the world.

**Focus on play** expands the game into a dark cinema frame while preserving the live scene. Escape pauses and returns to the studio layout. Jump height responds to how long the button is held; thin platforms support landing from above without blocking jumps from underneath. Grounded drag, air steering, buffered jumps and forgiving platform-edge timing are shared by every world. The objective display tracks collectibles, switch progress and explicit destination requirements. By default, collectibles and levers are optional; **Destination rules** can require specific collected/activated IDs before any destination finishes the game. After completion, **Continue building** and **Keep exploring** retain earned progress and the achievement; **Replay from start** explicitly resets the attempt.

An original synthesized score and event-specific sound cues run locally after the player enables sound. Pausing fades audio, completion lets the final notes decay, and scene destruction closes the audio context. The game pauses when the page becomes hidden. Reduced-motion mode removes decorative drifting particles, camera travel/zoom, hero deformation and collectible bobbing. See [the game-feel work record](docs/GAME-FEEL.md) for the actual playthrough checks and remaining acceptance work.

## Play

- Move: left/right arrows or A/D.
- Jump: Space, up arrow, or W. Hold for a higher jump; release for a short hop.
- Interact: E near a lever, or click the nearby lever.
- Follow the displayed destination rule. Collectibles and levers are optional unless the creator marks them required; worlds without a destination remain open for exploration.
- **Use phone camera** pairs a one-photo connection with this studio. Choose Wi-Fi for a physical phone on the same network, or preview pairing on this computer. The phone can choose/take a photo, rotate, preview, and send; it cannot access model keys or studio controls. Wi-Fi mode starts a temporary drawing-only listener on the next port (5174 with `npm run studio`) and closes when captures finish, expire, or are cancelled. It starts only when selected. No internet hosting is configured.
- **Align page** supports rotation, four-corner crop and perspective correction, and before/after review. Revised pages match the current page shape. Corrections are performed locally in a worker; accepting a photo does not replace the running world.
- **Edit world** pauses the current adventure and opens the clearly labeled manual editor. Add bridges, platforms, collectibles, gates, levers and a destination; choose which gate each lever controls. Optionally draw original object artwork. Use **Add space** to extend the map to the right. Preview, apply and continue from the same position. Undoing an expansion requires returning inside the previous boundary.
- **Update page** opens the current and revised drawings side by side. Draw on the original page without changing its old marks, or upload a revised photo. New strokes can transfer as one original-art object: choose its role, correct placement in preview, check connections, then apply. This manual route needs no API key.
- For a world originally interpreted by Meta, the same flow can send both pages and stable world metadata to the selected Meta provider. Its proposed additions must be reviewed; this live inference path is implemented but not yet verified. Shifted/perspective photos need reframing or manual placement, not an assumed automatic registration.
- **Undo** removes the most recent edit while keeping subsequent progress on surviving objects. Edits that would cover the character with a solid object are rejected.
- Save beside the world name, then reopen through **My worlds**. The world, progress, and up to 12 undo checkpoints are saved. Saves use this browser’s IndexedDB library so image-rich worlds are not constrained by the small localStorage quota. Existing localStorage saves are copied into the library and kept as a migration backup. The library retains all saves instead of pruning older worlds. **My worlds** also provides versioned portable backup/import, preserving exact artwork, progress and undo history; duplicate image assets are stored once in version 2 files. Existing versions stay unchanged unless you explicitly import separate copies. If full history exceeds the 64 MB file limit, an explicit current-version backup keeps the saved history unchanged. These are device-local saves, not cloud storage.

Small screens expose pointer controls. A falling character returns to its spawn while collected items remain collected. All three examples use the same object kinds and engine; scene behavior is not branched by example ID.

## Checks and build

```sh
npm run test
npm run build
npm run check:secrets
```

The current 34 focused checks cover world/revision/rule contracts, provider boundaries, page geometry/capture, segmentation and picture handling, recovery, library backups, viewport mapping, artwork/resource bounds, audio lifecycle and scene visibility. The production build and type checks pass. Protocol tests inject test-only responses; they check handling and real image cropping, not Meta recognition accuracy. The SAM wire fixture is synthetic published example data. No mocked model response is available in the product. Separate acceptance evidence includes real model inputs, browser playthroughs, 20 renderer restarts and six isolated fake-IndexedDB fault-injection cases. The latter establish emulator transaction behavior, not actual browser disk exhaustion or process-crash recovery.

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

All implementation and vector art in this repository were created for this project beginning October 30, 2026. Third-party runtime dependencies are declared in `package.json` and locked in `package-lock.json`. The interface bundles Manrope and Fraunces locally. Their SIL Open Font License files are included in `public/fonts/`; no remote font request is required.

Provider references: [Baseten's Muse Spark Open model](https://www.baseten.co/library/muse-spark-open/), [model feature support](https://docs.baseten.co/inference/model-apis/overview), [reasoning controls](https://docs.baseten.co/inference/model-apis/reasoning), and [Meta Model API support](https://dev.meta.ai/help/support/contact-support).

Credential handling: only the server reads `MODEL_API_KEY`, `BASETEN_API_KEY`, and `FIREWORKS_API_KEY` from the owner’s `~/.env`. Existing process/project values take precedence. Credential/key directories and Modal configuration files are ignored. `npm run check:secrets` checks configured provider values against tracked worktree files and staged blobs without printing them. Run it after staging before every commit.
