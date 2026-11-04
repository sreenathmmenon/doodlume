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

## November 4 — distinct choices and branch-specific consequences

The follow-up addresses the low depth assessment with explicit exclusive choices. A player can choose an outcome, perform its own follow-up, and finish through either valid branch. Choosing one option locks its alternatives; Undo restores the choice. A required choice counts once, rather than demanding mutually exclusive actions. Edited choice membership invalidates old receipts, while label changes preserve progress. Generated plans must prove that every offered option can participate in completion; bounded platform/roam verification also checks the corresponding physical routes. Existing manual fixed-route requirements remain supported.

Creators can group existing abilities or add an alternative placement/attachment atomically. Choice drafts, requirements and saved worlds retain their meaning. Hints offer alternatives without choosing for the player, skip excluded branches, and expose actual newly available actions. Preview text names the foregone option only when it is still possible. Completion describes the selected outcome. These are generic contracts; source names and sample identities do not select behavior.

### Current evidence

- A synthetic real-engine keyboard fixture completed two physically different routes: open a barrier and walk through, or keep it closed and jump over it with an earned capability. Undo restores the original barrier/capability state. This is runtime evidence, not model-generation evidence.
- Three real Fireworks-hosted Meta Muse Spark Open requests used the same unchanged AI-generated rough room drawing and creator intent. Attempt 1 required outline review; attempt 2 requested a placement outside the image; attempt 3 compiled two different arrangements with branch-specific final actions. Initial chair placement alone does not complete the mission. Actual browser play verified both branches, Undo and save/reopen.
- Visual review of attempt 3 found a real failure despite successful completion: the rug covered approximately 94.5% of the moved chair's opaque artwork. Explicit object/surface layers now support intentional underlays. A normal creator edit put the rug under other objects, preserved the chair visually, and survived save/reload. This edit is not represented as an unassisted model result.
- Source-relative placement supports center/left/right/above/below while preserving original size; invalid bounds are rejected. This is an image-plane arrangement, not simulated room geometry or physical lighting.
- Local SAM now separates a tight object prompt from its surrounding output context. Agreement across independent prompts recovers attempt 1's chair. A competing plant mask that would discard real outside-seed ink remains in review; a long-appendage regression prevents trimming a genuine tail to make a cleaner result. Five prior stored masks remained byte-identical. Attempt 3's chair still includes nearby desk strokes: consistent masks do not prove semantic identity. Two local negative-neighbor-point experiments failed to resolve that reliably and were not shipped.

Local evidence is in `outputs/verification/exclusive-choices-2026-11-04/`. Exact-response offline replays and synthetic fixtures are identified separately from live generation and ordinary browser edits. Original failed results remain retained. This increment improves actual choice, control and visible outcomes; it does not establish universal image conversion, human replay appeal or a 9–10 score in every category.

### Follow-up correction and release verification

Generated placement admission now compares source alpha at the actual rendered positions, including recovered art larger than its collider. It rejects a newly placed object that hides at least 90% of a protected object, while allowing declared underlays and preserving source overlap. Required resources and prerequisites are protected. Work is bounded by 2,048 action states, cached geometry comparisons and 16 million alpha samples. This is a pairwise visibility check, not a composition or semantic-quality guarantee; it does not detect several partial occluders jointly covering an object.

Replaying the exact original attempt-3 response triggered that diagnostic, followed by **one actual Meta correction request** with the unchanged source and intent. Meta declared the rug a surface; no manual plan rewrite was applied. A fresh normal import of this corrected artifact completed both branches, retained the visible chair over the rug, and saved/reloaded the final reading state. This hybrid verification is one correction of an existing response, not a fourth fresh initial generation. This phase used four hosted requests in total: three initial generations and that correction.

Pointer selection now respects explicit underlays and actual raised attachment/carried-art depth. Empty centers of outlined normal objects remain easy to select over an underlay; transparent overlaps between ordinary cutouts select the visible art. Actual chair-center and exposed-rug clicks were verified. Nine isolated overlap cases checked attached and carried surface/ordinary parts, transparent foreground, equal-depth ordering and thin-art fallback.

The final focused selection passed **102/102**, alongside TypeScript, production build and credential scanning. An independent simulated review of the inspected corrected room mission rated usability **8/10** and gameplay depth **6/10**. Those are mission-specific judgments: the branch has a distinct result, but only one decision and one prescribed follow-up. The remaining desk strokes and model-generated “work light” wording are visible defects, not resolved by the layering repair. Human appeal is unmeasured. No all-category 9–10 approval was awarded.

## November 4 — consequential allocation and saved recovery

The review exposed a structural limit: protected play removed every losing allocation, partly solving resource puzzles for the player. New optional `completionPolicy:"retryable"` lets a player try any immediately legal allocation. Possession, amounts, capacity, prerequisites, exclusive choices and one-use receipts remain enforced. Existing worlds stay protected by default. Generated retryable plans must have an initial solution and a reachable allocation fork with both a completing continuation and a genuinely losing continuation. This admission is bounded and currently applies only to pointer-based games; it does not assert that a numerical puzzle is enjoyable or semantically appropriate.

Every accepted action saves the preceding solvable position. Subsequent mistakes preserve that checkpoint. **Revisit choice** restores it even after saving, exporting and reopening; ordinary session Undo remains available. Checkpoints are scoped to the world and revision, validated on import, nonrecursive, and cleared by restart. An impossible run must be recovered or restarted before a world edit. The creator can switch Guided/Experiment through Play style; both directions were applied, saved and reopened through the ordinary editor without changing artwork, actions or resources.

Resources now display readable current/capacity badges at a stable screen size. Transfer previews state **One use** before the action; trying an already-used pair explains the restriction instead of silently doing nothing. A full receiver receives a restrained badge accent. This does not animate or transform the pictured subject. An optional recovery hint explains a real shortfall without exposing internal resource type identifiers.

### Evidence and unresolved quality

- A synthetic game was imported through the normal library and played in the real engine: losing allocation, shortage hint, Undo, repeated loss, save/export/reload, exact checkpoint recovery, completion and restart all passed. No game state was injected.
- The unchanged AI-generated rough marker reef was sent to Fireworks-hosted Meta Muse Spark Open. The first generation and correction failed: instructions were too long, tools were not carryable, and one-use transfer amounts could supply at most 10 of the required 14 units. Precise combined diagnostics now reach the correction request; no response is silently rewritten. Diagnostic subset arithmetic has explicit work/memory bounds and defers to full validation on exhaustion. Final public errors stay concise, while recognition-review recovery remains intact.
- One actual correction of the unchanged cached failed response produced a valid six-transfer puzzle with two allocation solutions. This hybrid result was imported normally and played with actual pointer clicks: a losing left-to-yellow allocation, Undo, six successful transfers, completion, save and reload. The original image and model plan were not manually edited. This is hybrid correction evidence, not a fresh initial generation.
- A separate fresh initial request with the same exact source and intent succeeded after its one automatic correction. It produced a different, simpler four-action graph. This phase used **five hosted calls total**: two initially failing calls, one hybrid correction, and two for the fresh run. It does not constitute unfamiliar-input coverage.
- An independent simulated gameplay review still assessed the six-transfer puzzle's **depth at 6/10**. The arithmetic insight is real, but the remaining moves execute it; there is little evolving capability or downstream strategic choice. Numeric badges improve fairness, not strategic depth. The generated instruction promising that fish “glow” overstates the actual badge accent and remains an identified wording defect in that saved model result. Human enjoyment and replay appeal remain unmeasured. No overall 9–10 approval was granted.

Local evidence: `outputs/verification/retryable-puzzles-2026-11-04/`, `outputs/verification/retryable-browser-2026-11-04/browser-report.json`, and `output/playwright/retryable-reef-*.png` / `reef-resource-*.png`. These distinguish live inference, hybrid correction, synthetic fixtures and actual browser play. Relevant state, planning, recovery, visibility and API error-boundary checks passed, together with TypeScript, production build, credential scanning and diff validation.

## November 4 — stationary sources, direct controls and physically different routes

Fixed resource sources can now be selected in place, without lifting a photographed object. Selection and carrying are separate saved states. Direct `operate` actions let a stationary control use real preparation requirements to open a gate, move a prepared object, or grant a supported capability. Both contracts are validated generically; no source name, filename or example selects the behavior. Creators can author these behaviors through Object abilities. Saved checkpoints, imports, revisions and completion searches retain their meaning.

Requested hints now explain a required choice before prescribing one branch's preparation, and honor committed/fixed routes. Move previews mark the actual destination using the same geometry as execution. Resource badges avoid neighboring badges and the current action prompt; transfer copy states the amount and one-use restriction. Completed or excluded tools no longer attract the default interaction cue. An independent review caught a completed dual-role control incorrectly blocking its remaining source use with empty hands; that message is now conditional on there being no selectable source action. A normal-import browser run explicitly dropped the supply, operated with empty hands, selected the controller and completed its remaining transfer.

Platform character art now accounts for transparent pixels below its feet without changing its texture or collider. Carried art sits beside the rendered character instead of crossing the face. Attached player equipment is bounded to the lower outside edge, preserving the character’s face and torso; non-player invention mounts retain their existing behavior. These are visual corrections, not source segmentation or terrain reconstruction. A residual difference between the robot test's selected floor collider and its pencil ground remains.

### Actual creation and play evidence

- A previously tested table photo compiled on one real Meta Muse Spark Open request through Fireworks (29,714ms). The mug remains fixed while supplying the plant. Normal import, pointer play, completion, save, reopen and export preserve the exact image, objects and model plan. This is a one-step source-fidelity test, not proof of deep photo gameplay or unfamiliar-input coverage.
- A new AI-generated rough pencil robot drawing was used with one unchanged intent requesting two routes. Initial generation/refinement and a later fresh correction exposed invalid controller roles, missing interaction-object declarations and an invalid fixed source in a moving world. Structural preflight now catches those semantic errors before paid boundary refinement. The complete sequence used six hosted calls, including a disclosed hybrid continuation of an exact cached corrected response plus one real boundary refinement. It is not a first-pass success or an entirely new initial run.
- The resulting exact Meta plan was imported through the normal library. Actual keyboard play completed both routes: collect the battery, charge the stationary control, press it and walk through the opened gate; or restart, fit the spring and jump over the gate while it remains closed. Both completed runs were saved, awaited visible save confirmation, reloaded and exported. Hydrated exports preserve all original entities, art, source image and interaction definitions byte-for-byte. No player position or completion state was injected.
- Completion now names the selected outcome even when the mission has a physical destination. A concise **Try another route** action appears only when a different member of a completed required choice can satisfy a bounded fresh logical completion check with existing fixed requirements retained. It performs an ordinary restart, without choosing/equipping anything or claiming an untried route. Actual replay restored the robot's original quantities, choices and gate, displayed both routes in the optional hint, and completed the gate route again. Logical admission alone does not prove arbitrary physical routes.
- Synthetic operation scenes separately exercised blocked readiness, source/operation selection, movement preview, Undo, save/reopen and creator editing. These scenes test a capability; they are not generation or gameplay-depth evidence.

Evidence: `outputs/verification/stationary-sources-2026-11-04/`, `outputs/verification/operate-2026-11-04/`, `outputs/verification/direct-operation-2026-11-04/robot-browser-verification.json`, and `output/playwright/operate-robot-*.png`. Failed reports and intermediate runs are retained. An early robot save check reloaded before asynchronous saving finished; the later confirmed exports are the valid persistence evidence.

### Current assessment, not a full-product approval

The simulated reviewer assessed the inspected operation fixtures at clarity 8/10, feedback 8/10 and controls 7.5/10; their depth is deliberately limited. The actual generated robot screenshots and confirmed exports establish materially different routes, but the reviewer still assessed that short mission's depth at 5/10: one early decision followed by traversal. The reviewer did not independently play the robot and did not grade the whole product. Route replay improves discoverability, not strategic depth. Human delight, broad unfamiliar-image reliability and universal extraction quality remain unverified. The owner's all-category 9–10 target is **not yet established**; passing regression checks is not a substitute for it.

### Final fresh-generation check

A further fresh request used the same unchanged robot drawing and intent after the semantic preflight fixes. It produced a valid interaction plan and reached boundary refinement, then required source-outline review instead of returning a playable world (72,554ms, two hosted requests and one local SAM worker). This raises this drawing's cumulative hosted count to eight. It is retained as `fresh-final-report.json` / `fresh-final-review.json`; the successful hybrid playthrough must not be reported as this fresh attempt succeeding. An exact offline replay identified the battery: independent masks include inconsistent adjacent paper, while the spring passes. No extraction guard was relaxed, model response changed, or successful mask borrowed from the earlier run. The recovery path now preserves the affected object ID and label: the exact stored-response replay returns a valid review for Yellow Battery rather than a generic source-route error. A normal upload with that saved response intercepted locally verified the selected source box and Adjust Yellow Battery control; this UI replay made no model request. Current release checks passed 190/190, TypeScript and the production build; browser flows and their stated limitations remain the quality evidence.
