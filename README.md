# Doodlume

Turn your own drawings and photographs into playable worlds. Doodlume uses Meta Muse Spark Open to recognize actual image details and design a game around them. The original image remains visible and inspectable, and creators can keep editing the same world without losing earned progress.

## Review the product

After starting the app, open the **homepage at `/`** or the **creation studio at `/#studio`**. The homepage's playable examples are previously generated worlds, labelled as examples; opening one does not make a fresh model request. Use **Make a game** with your own image to exercise creation.

[Submission package](docs/SUBMISSION-PACKAGE.md) documents actual model/partner roles, event-period contributions and the planned 2:58 demonstration. The demonstrated model path is **Meta Muse Spark Open via Fireworks AI**, with **local Meta SAM 2.1 tiny** for supported cutouts. Baseten and direct Meta adapters are available options; Modal is not in the demonstrated runtime. Public deployment and the final film remain separate release gates.

The engine supports three play styles:

- **Adventure:** move and jump through source-based or clearly introduced geometry, collect objects, activate linked switches and reach a destination.
- **Exploration:** move freely in four directions through the original image, with source-positioned discoveries, deliberate obstacles and activations.
- **Discovery:** follow image-specific clues and find actual details in place. No separate character or pre-drawn platforms are required. Pointer/touch play, optional hints and a keyboard alternative share the same rules.

These are composable engine capabilities, not per-image scripts. Source recognition, introduced gameplay, source pixels and finishing requirements are kept distinct. Images are untrusted visual content; the model returns a bounded data contract, never executable game code.

## Run

Requires Node.js 22.12+.

```sh
npm install
cp .env.example .env.local
npm run studio
```

Open http://127.0.0.1:5173. Choose the Meta provider you can access in the ignored `.env.local` file. Fireworks uses `MODEL_PROVIDER=fireworks` and `FIREWORKS_API_KEY`; direct Meta and Baseten have separate settings in the template. The server can also read only its known provider-key names from the owner's `~/.env`. Keys never enter the browser bundle.

`npm run studio` builds and serves a stable local snapshot outside synced Documents. `npm run dev` runs the development API and Vite server. Production builds, dependencies and generated verification artifacts are ignored by Git.

## Original artwork and cutouts

Image discovery and exploration use the unchanged full image with source-coordinate interactions. Adventure can use actual source subjects and object cutouts. Introduced guides, ledges and markers are labelled separately; a crop is never described as a precise mask.

Two explicit segmentation options are available:

- Direct **Meta SAM 3.1**, using the server-side direct Meta key and its own access requirements.
- Local **Meta SAM 2.1 tiny**, with no segmentation upload or API key. Install it with `npm run setup:cutouts`, then set `CUTOUT_PROVIDER=local-sam2` in `.env.local`. Python 3.10+ and a supported PyTorch runtime are required; Apple Silicon uses MPS when available, otherwise CPU. The pinned model/runtime live outside the repository.

Local masks retain original RGB bytes and add predicted alpha. Dimensions, confidence, visible coverage and fragmentation are checked. Unusable masks retain an explicit paper/crop fallback. The local worker has bounded input/output, cancellation, time limits, a short queue and idle cleanup; selecting it never invokes a paid remote fallback.

Model references: [Meta SAM 2 code and weights](https://github.com/facebookresearch/sam2), [Meta SAM 3.1 API](https://dev.meta.ai/docs/sam/overview).

## Create, play and keep shaping

Upload an image or draw directly, optionally describe the desired experience, review its original image and gameplay, then play. Unclear source selections or unsupported requests stay actionable; the running world remains unchanged on a failed request. The three authored examples are clearly labelled and remain available in an expandable chooser.

The editor supports world additions, image updates, object placement, zoom/pan and keyboard placement. Tools match the world's movement style. Discovery regions can remain optional or become required with creator-editable clues. Finishing rules, clue order and required objects are validated together. Valid edits retain world identity, collected objects, activated interactions and completed achievements; undo retains surviving progress.

Saved worlds use this browser's IndexedDB. Portable backups include deduplicated artwork, progress and undo checkpoints; imports do not silently replace existing work. These are local saves, not a cloud account. Paired phone capture and page alignment are available; automatic paper comparison remains a drawing workflow, while photographs can use manual image/region updates.

The engine bounds are 12,000×5,000 and 160 objects. Current mechanics are bounded 2D movement, interaction and discovery; Doodlume does not generate arbitrary game code, reconstruct hidden 3D geometry or simulate a photographed room's physical properties.

## Validation

```sh
npm run check
npm test
npm run build
npm run check:secrets
```

The focused suite covers world/rule contracts, source pixels, recognition recovery, local/remote segmentation failure handling, editing/undo, backup preservation and renderer bounds. Real model runs and browser playthroughs are recorded separately; a valid model response is not counted as a completed game. See [live validation](docs/LIVE-VALIDATION.md) for dated conditions, observed failures and remaining limits.

No comparative superiority, retention across all ages or hackathon outcome is established by passing these checks.
