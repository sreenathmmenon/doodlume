# Milestone 1 — studio foundation record

Date: October 30, 2026. Local development only. No remote repository or deployment.

## Scope and honest completion boundary

The foundation and visual-direction slice is implemented. The earlier detailed blueprint calls its broader M1 **“Make an original drawing genuinely playable.”** That broader acceptance gate is **not complete**: it requires a verified live Meta interpretation/extraction and actual device capture-to-play evidence. This record does not replace those criteria with authored examples.

## Implemented

- React studio with source drawing beside a real Phaser world, original visual assets, three palettes, editable world name, help, settings, and clear example labels.
- Three data-defined worlds using a single engine and shared entity contract: player, terrain, bridge, collectible, lever, gate, goal, decoration.
- Responsive movement, coyote-time jump allowance, jump buffering, terrain collisions, collection, gate targeting, completion, and fall recovery. Small joins up to 10 world pixels do not catch the character's feet.
- Keyboard controls and small-screen pointer controls; sound starts muted; reduced-motion preference removes decorative particles.
- Device-local saves restore character position, collected object IDs, activated lever IDs, and completion state.
- Upload validation/normalization and a pointer sketchpad with ink colors, eraser, clear, and a bounded undo history. A new source does not silently become an example.
- Server-only Meta adapter with structured output, scene validation, original-page crops, request timeout, cancellation, one request in flight, request-count cap, and explicit missing-key/failure responses.
- Interpretation review/accept step before a new generated world replaces the current world. This is a new-world preview, not a persistent paper amendment.
- Separate local repository with ignored credential files and a setup template.

## Verified

- Production TypeScript/build check passed after integration.
- Three focused automated checks passed: all example contracts, invalid ID/target rejection, and preserving surviving progress IDs.
- Browser playthrough: grove, moon, and robot worlds each collected all three sunseeds, activated the intended lever, crossed the open gate, and reached the completion screen.
- Saved grove run with two seeds and an open gate; reloaded the page; reopened through My worlds; confirmed the same character position, two seeds, and open gate; completed the run.
- Pointer sketch: stroke, clear, undo, and use-drawing returned the actual image to the source panel.
- Uploaded an original local PNG through the actual file chooser; the normalized drawing appeared in the source panel with its filename and Your Drawing label.
- With no Meta key, Bring it alive opens setup and leaves the current world unchanged.
- Desktop and 390-pixel responsive layout reviewed in Chrome. This is browser viewport evidence, not a physical-phone capture test.
- Runtime regressions found and fixed during review: scene lifecycle startup; SVG raster loading; lever knob alignment; small bridge-edge collision snag; clear/undo ink-state recovery.
- Resolved macOS dependency offloading by using an ignored dependency-cache symlink outside Documents. After the fix the complete test/build run passed; the production bundle built in 2.68 seconds.

## Still open

- Configure and verify the actual Meta account/model/credits; run a real drawing-to-play trial and record latency/output.
- Real SAM extraction, mask quality review, and trustworthy artwork/physics bounds for unfamiliar drawings and photos. White-paper removal is only a foundation adapter.
- Paired phone capture, page registration/perspective correction, and readability assessment on an actual device.
- Same-world paper amendments: stable identity, previewed patches, bridge creation, correct existing-gate binding, atomic application, stale-request protection, and undo/recovery.
- The planned 5–20 distinct drawing trials. Three authored examples are not that evidence.
- Final product craft pass, submission assets, public repository requirements, deployment, and the final 2:58 product demo.

## Next integration gate

Use a newly drawn, clear page with one character, visible ground, collectibles, and a destination. Verify that the server receives genuine Meta output, renders recognizable cropped source art, and lets the user play it. Reject ambiguous or unplayable interpretations with a focused next action. Preserve the current world on any failure. Only then mark the original drawing-to-play criterion complete.

## Model access follow-up

The owner reports direct Meta API-key creation is blocked by a payment authorization-hold restriction after trying two cards. Added an alternative adapter for Baseten-hosted Meta Muse Spark Open, explicit provider selection, schema-aware request formatting, local output validation, and billing-specific errors. Baseten's adapter does not request its unsupported enforced-JSON mode. The live model gate remains open pending a working provider key. The updated five focused checks and production build passed. The browser connection screen and missing-key response were verified. See [model access recovery](MODEL-ACCESS.md) for official sources and a support-message draft.
