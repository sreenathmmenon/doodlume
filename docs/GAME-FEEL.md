# Doodlume game-quality pass — 2026-10-31

The target is a distinctive game product that people enjoy controlling, exploring and making their own. Artwork presentation, control response, readable challenges and persistent authorship all matter. An aesthetic upgrade is not evidence of commercial demand or a judged outcome.

## Implemented

- Three original procedural environment directions: a teal grove with layered trees, a lunar archive with architectural silhouettes, and amber wilds with eroded rock columns. Deterministic scenery, light shafts, atmospheric depth, vignette and drifting light are generated locally. The player's original drawing/photo cutouts remain the actual playable foreground objects.
- Responsive camera framing with directional anticipation, vertical tracking, bounded movement and a closer view for narrow screens. Studio/play resizing keeps the same scene and progress. Camera target coordinates use Phaser's zoom-aware bounds calculation.
- Independent visual and collision layers for the hero. Breathing, running rhythm, airborne stretch, grounded lean and landing compression never resize the physics body.
- Faster grounded acceleration, drag and braking, separate air steering, variable-height jumps, jump buffering and platform-edge grace. Thin terrain/bridges support feet from above while permitting an upward jump through them. Thick terrain and gates remain solid.
- Landing dust, restrained footfalls, collectible light rings, a floating reward, gate feedback and a home beacon. Collectibles without artwork get an intentional light sprite, avoiding a missing-texture placeholder. A destination without supplied art gets an intentional drawn arch.
- Original locally synthesized ambient harmonies and separate jump, landing, step, collection, gate, return and completion cues. Muted by default; no remote audio or downloads. Pause fades sound, completion allows its final notes to decay, and shutdown closes the audio context. No listening-panel or cross-device audio certification is claimed.
- A dark focused-play frame, title treatment, collectible counter and progress-aware next objective. Escape pauses and returns to studio layout. Existing keyboard and touch controls remain. A hidden page pauses the adventure.
- Reduced-motion mode removes camera zoom/travel, decorative motes, hero deformation, dust/rings, collectible bobbing and gate travel. Original artwork and gameplay remain available.
- Explicit Fireworks-hosted Meta Muse Spark Open adapter alongside Baseten and direct Meta. Provider isolation and Meta-family model-name restrictions remain; errors never switch billing accounts. Existing focused provider checks cover Fireworks selection and credential boundaries without adding a broad test suite.

## Verification

- TypeScript and production build pass.
- The existing 20 focused contract/regression tests pass, including the extended provider-boundary assertions.
- Actual browser playthrough reached all three grove collectibles, crossed the bridge, activated the lever and completed the destination. Thin-platform upward passage and landing were also exercised. The renderer reported no errors during that playthrough.
- Mobile layout was inspected at 390 × 844 with document width 390. The first inspection exposed an undersized character; a closer responsive camera was added. Its first playtest caught an incorrect zoom-coordinate calculation, which was replaced with Phaser's own `getScroll` conversion before acceptance.
- Final mobile check: held on-screen Move right and Jump controls reached the first raised collectible. The closer camera retained the hero and followed the jump. The document width remained 390 at a 390 × 844 viewport; the temporary viewport override was reset afterwards.
- Final desktop resize/pause check: the same scene retained its collected item across mobile → desktop resizing. Pause/resume worked; Escape paused and returned to the studio layout.
- Existing saved grove reopened at revision 3, with 2 of 3 items and two undoable edits. The saved manually designed photograph world reopened with its original Earth crop, 1 of 1 items and its gate already open. These saves were not overwritten during this check.
- All three final environment directions were visually inspected. The photo world exercised the new lunar scenery with actual photographic source pixels; it remains labeled Chosen by you, not a model result. The browser reported no errors or warnings during the final theme checks.
- Screenshots are local evidence outside the repository, under `outputs/doodlume-game-feel-2026-10-31` in the parent workspace. A physical phone, controller hardware and audio listening trials remain unverified.

## Next product gates

1. **An adventure worth replaying:** one carefully paced route with an inviting start, escalating traversal, a discoverable optional route, a meaningful drawing intervention and a satisfying homecoming. New interactions must work from supported entity definitions and preserve progress.
2. **Reliable source-to-play:** connect a credited Meta-model provider; exercise 5–20 genuinely different drawings/pictures, record failures, correct unclear objects before play and compare inference latency. This remains a required live integration gate.
3. **Author attachment:** make original source marks visibly recognizable, make the effects of their edits legible and retain their choices and earned progress. Measure reactions with actual users; do not infer love or retention from effects alone.
4. **A complete product session:** reliable create → review → play → amend → save → reopen, clear recovery from failures, usable touch controls and acceptable performance on an actual lower-powered phone.
5. **Submission proof:** record the genuine workflow with the configured Meta model, source artwork and same-world edit; publish accurate model/partner usage and observed limitations. Finish the final demo only after the product path is real.

The game-quality target remains high. This record distinguishes implemented behavior, actual checks and work still required; it does not claim EA-equivalent production scope or guaranteed purchase intent.

## November 4 — source-driven object gameplay

Implemented a generic `place` action alongside transfers, attachments and tool use. A carried source object moves to a validated destination, returns to its original drawn size, releases the hand, and can be picked up again. Completion waits for movement to arrive. Ordered placements use explicit prerequisites; invalid or out-of-bounds placements request correction instead of silently resizing source art. The creator can add placements under Give it a purpose.

Interaction choices now support Up/Down or W/S, E/Enter and Escape without also moving the player or triggering a lever. Manual steering cancels a pending click-to-use journey. The compact carried-object strip shows the actual object and remaining quantity. Optional hints trace legal action/resource dependencies and can highlight an object without executing the action. Hints do not yet prove spatial reachability in every movement world.

Generation now asks for a role, meaningful change, decision/dependency and visible payoff grounded in the image. Physical placement cannot be represented by a misleading resource-transfer label. Roam validation explores alternate action orders and moved/attached object positions, rather than rejecting a valid plan after one greedy resource allocation. Fractional resource amounts have consistent full/empty boundaries.

### Observed evidence

- Six real Fireworks-hosted Meta Muse Spark Open requests across a rough room drawing, a marker reef drawing and a tabletop photographic input. The two drawings were AI-generated test inputs, not represented as drawings by children. No filename-specific game branches or substituted model replies were added.
- Room Tidy Top View: the live generated world has three ordered placements. Browser play clicked the actual source objects and targets, completed 3/3, saved, reloaded, and retained 3/3.
- Diver's Reef Helpers: the live generated world has three food supplies, three receivers and nine possible transfer routes. Browser play used three transfers to fill the receivers, completed 3/3, saved, reloaded, and retained 3/3. Both inspected desktop sessions had no document horizontal overflow.
- Creator UI: an unordered second placement was rejected with a readable prerequisite message; choosing the earlier placement allowed the new ability. The test draft was discarded, preserving the generated world.
- Separate synthetic runtime fixtures verified keyboard action choice, offscreen highlighting without progress mutation, immediate cancellation on steering, delayed completion during placement, and pickup/return to the placed location. These fixtures are not generation evidence.
- TypeScript and production build passed. The focused gameplay/regression selection passed 49/49 checks.

The tabletop photographic case remains unresolved: one plan requested placement outside the image, and the final attempt required correction of the keys' whole-object outline. It is not counted as a successful automatic photo-to-game conversion. Early room and tabletop failures are retained in the local evidence. The two successful small missions prove the mechanics, not depth, replay appeal, universal image support or a quality rating.

Local evidence is under `outputs/verification/gameplay-2026-11-04/` and `output/playwright/`; generated assets, raw model outputs and browser profiles remain ignored. The playable two-world import is `outputs/verification/gameplay-2026-11-04/playable-backup.json`.
