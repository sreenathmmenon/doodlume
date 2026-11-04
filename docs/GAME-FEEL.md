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


## November 4 — action inspection, experimentation and correction

A four-round simulated council recorded 40 attributed contributions before implementation verification. It did not certify the product or establish human delight. Original contributions remain in the ignored local council report; later fixes do not rewrite earlier reviews.

### Implemented and verified

- Selected-action previews use the actual reducer. Transfers show real before/after quantities; placement describes the actual move; prerequisites explain blockers before approach. Multiple-action targets show choices and explanations before moving the player. Completed one-time actions no longer obstruct picking up their now-ready receiver. Upgrade previews reflect the effective capability, including an already stronger upgrade.
- Undo last action retains up to 16 exact pre-action snapshots during the current world/run. Rebuilding the scene restores resources, attachments, opened gates, object positions and completion state. Pickup/drop are not undo checkpoints. History clears on a new world/revision/restart and is not persisted as gameplay-action history across reloads. Saved game progress and creator-edit history keep their existing persistence contracts.
- The completion panel preserves artwork, prioritizes Keep exploring, and offers Continue creating. Restart remains in the existing stage controls; the duplicate completion Replay button was removed. Mission-specific completion text replaces generic filler.
- Decoded schema/interaction-compiler failures may request one model correction using the original normalized source and exact intent. The rejected JSON/error is bounded untrusted diagnostic data. Budget refusal retains the original error; provider errors, aborts, source-review errors and human clarification never trigger that retry. Malformed/truncated JSON is outside this correction scope.

### Observed sessions

- Room placement: blocked prerequisite and incompatible target were explained without execution. All three placements completed. The original drawing and final positions remain visible.
- Reef: transferred food, undid it, allocated the same supply to another fish and completed the mission. Keep exploring then Undo restored 2/3 with earlier receipts intact. Pause and movement prevent undo until a stable state.
- Crayon Space Voyage: actual Fireworks-hosted Meta output on an unchanged AI-generated rough crayon drawing. Two of six stars fuel the original rocket, then the rocket can move to the central green planet. All 15 supply pairs and 30 orders passed reducer verification. Browser play blocked premature launch, completed fueling/placement, saved and reloaded completion. These are equivalent supply choices, not evidence of deep strategy.
- Synthetic real-engine fixtures verified physical gate closure, attachment reversal, moved-object restoration, 16-entry history bound and world/revision/restart isolation. A far target with two blocked actions opened its choice menu without moving the player; keyboard selection explained the blocker without adding a receipt. Fixtures are not model-generation evidence.
- The initial space attempt failed. The second succeeded after disclosed creator-intent refinement. This is not a perfect automatic-conversion rate. Initial concern that the rocket included a neighboring star was disproven by alpha inspection: all 23,800 pixels in that region are transparent. Unnecessary experimental segmentation changes were discarded. Background reconstruction still has sparse residual marks.

A local CPU benchmark found no sustained preview/reducer bottleneck on room, reef, rover and a synthetic 64-action graph. It is not a browser frame-rate or network-generation benchmark. The focused gameplay/planning selection passed 54 tests before the later diagnostic-aggregation regression; typecheck, production build and credential scan passed. Final desktop screenshots and follow-up verification live under `output/playwright/`.

Still open: robust automatic conversion of unfamiliar photographs, richer non-equivalent choices and longer mission arcs, actual player feedback across ages, and physical assistive-technology checks. This increment does not establish every category at 9/10 or any competitive multiple.


The subsequent hybrid repair verification replayed the unchanged first failed space response, then made exactly one live Meta correction request with the same original image and intent. Meta corrected the edge destination but retained an invalid self-moving noncarryable tool. Compilation rejected it, with no further retry or substitute. This is evidence of bounded failure and partial response to feedback, not successful automatic repair or a new end-to-end generation. The compiler now reports independent carryability, self-movement and destination-fit problems together (bounded at 1,500 characters), instead of exposing only the first. Offline replay of the untouched failed response produced all three diagnostics; the improved diagnostic version has not had a further paid correction attempt. Two original live generations plus one hybrid correction are recorded separately.

Final completion layout replaces the mission strip with an 83-pixel-high horizontal completion section above the artwork at both inspected desktop sizes (1280×720 and 1440×900). The artwork is no longer overlapped, the repeated mission counter is hidden during completion, and the final-action toast clears when completion appears. Both primary actions have 44-pixel height, no overlap and no document horizontal overflow. These measurements do not establish universal layout or subjective visual excellence.


### Follow-up assessment and measurements

Two independent simulated reviewers reassessed the implementation; their complete, attributed assessments are in `outputs/gameplay-council-2026-11-04/final-technical-assessment.md` and `final-experience-assessment.md`. These are judgments, not external endorsements, competition predictions or user-study scores. Visual recheck increased the inspected desktop score after the overlapping completion panel was removed. Scores are not averaged to hide the weak categories.

| Reviewed category | Assessment | Scope / unresolved requirement |
| --- | --- | --- |
| Visual craft | 8.5/10 | Inspected desktop screens; distinctive subjective appeal still needs actual players. |
| Source fidelity | 8/10 | Inspected drawings; residual background marks and broader photo coverage remain. |
| Creative control / undo | 8/10 | Supported mechanics, exact session undo; no redo or persisted gameplay-action history. |
| Controls / feedback | 7.5/10 | Actual scripted play; first-time comprehension and assistive technology unverified. |
| Reliability | 6/10 | Deterministic play works; unfamiliar-image generation still fails or requires review. |
| Performance | 7/10 provisional | Local CPU evidence; broader devices and generation distributions unverified. |
| Game design / depth | 5.5/10 | Current short missions lack non-equivalent decisions and sustained progression. |
| Delight / replay evidence | 4/10 | Evidence strength only; no human dislike or attachment inferred. Human appeal unknown. |

On the actual generated space world, a local browser measurement observed 131 ms from Undo click to the ready scene plus two animation callbacks. A following 180-callback sample had median 16.7 ms, p95 16.8 ms and maximum 16.8 ms. These are local callback/ready-state timings, not hardware display latency or a universal frame-rate guarantee. The final relevant contract/regression selection passed 56/56; final typecheck, build and credential scan are release checks. The all-category 9–10 target remains unmet, particularly meaningful gameplay depth and reliable unfamiliar-source generation.
