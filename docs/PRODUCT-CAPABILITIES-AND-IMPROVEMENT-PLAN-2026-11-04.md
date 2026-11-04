# Doodlume — complete capability audit and improvement plan

Review date: 4 November 2026. Source baseline: `7968fd6`. Live service: https://doodlume-production-9df2.up.railway.app/. This is an analysis/plan, not an application change, a quality certification or a predicted competition result.

## Product assessment

Doodlume's strongest foundation is **personal visual material → playable relationships → creator changes the same world → progress survives**. It is more than a picture viewer with a character, and less than an unrestricted game generator. Its reusable 2D engine supports several substantial mechanics; automatic design does not yet reliably assemble them into equally compelling experiences on unfamiliar images. Presentation should make this creative loop immediately legible while preserving the source artwork and precise controls.

The product has useful foundations worth preserving: real Meta inference, actual source-pixel cutouts, a shared data-driven runtime, composable object actions, creator-assigned abilities, reversible same-world edits and portable local saves. The next improvement should connect these into a convincing complete experience. Merely adding integrations, cinematic decoration, more modes or another visual theme will not close the central quality gap.

## How to read the inventory

**Live** means inspected in the current deployed browser during this audit or explicitly linked recent release verification. **Implemented** means present in current source but not fully re-exercised during this audit. **Constrained** means implemented with material limitations. **Absent** means no current implementation was found. Rows describe capability areas and related controls, not a manufactured count of independent features. Existing documentation can be stale; this inventory gives current source and release evidence priority.

## Feature and capability inventory

### Bring an image or create artwork

| Capability | Status | What exists and its limit | Source |
|---|---|---|---|
| Upload a drawing, photograph or illustration | Live / constrained | PNG, JPEG and WebP; browser accepts files up to 12 MB, normalizes to1,600 px maximum side and PNG. Not every image yields equally good play. | `src/lib/drawing-file.ts`, `src/App.tsx` |
| Draw directly in the browser | Implemented | Pen colors, eraser, brush size, undo/redo, clear, resumable drawing draft. Synthetic examples are not represented as actual children's drawings. | `SketchPad.tsx` |
| State a desired game idea | Live | Optional text up to 500 characters including selected-mode prefix. Supported intent guides planning; unsupported mechanics are not executed as generated code. | `App.tsx:creationIntent` |
| Choose gameplay preference | Live | Auto, Adventure, Explore, Hands-on; advanced choice is disclosed under Gameplay. Hands-on is direct interaction, not guaranteed rich roleplay. | `App.tsx` |
| Choose drawing versus photo interpretation | Live / needs improvement | Explicit selector; initially Drawing, retained on upload. A JPEG can be either, so MIME inference alone is insufficient. | `App.tsx:useSource` |
| Photograph a paper drawing from a phone | Implemented, prior hosted verification | Private one-use pairing link, QR/link flow, expiry and revocation; sends source to the owner's studio. Not multiplayer or cloud save sync. | `PhonePairing.tsx`, `CapturePage.tsx`, `server/capture.ts` |
| Straighten a photographed page | Implemented | Four-corner perspective adjustment, rotation, aspect matching and preview; optional use-as-is. | `PageAlignment.tsx`, `align-page.ts` |
| Inspect the original | Live | Original artwork inspection with fit/zoom/pan; homepage original/game toggle. | `SourceInspector.tsx`, `Home.tsx` |
| Preserve creation drafts and cancel | Live / implemented | Source and idea survive failed creation; unfinished drawing/draft can be resumed or deliberately discarded. Request cancellation preserves the current world. | `App.tsx`, `SketchPad.tsx` |

### Interpret the source and create a game

| Capability | Status | What exists and its limit | Source |
|---|---|---|---|
| Actual Meta model interpretation | Live, prior release proof | Meta Muse Spark Open through Fireworks is the demonstrated hosted route. Source objects, intent and data contracts drive output. | `server/provider.ts`, `interpret.ts` |
| Direct Meta and Baseten adapters | Implemented / not current hosted proof | Configurable provider paths; existence is not evidence of tested current account/model access. No silent paid fallback. | `provider.ts`, `credentials.ts` |
| Inventory-first photo planning | Live | Freeze actual visible source IDs/boxes, then design action relationships; up to 24 inventoried source objects. | `photo-planning.ts` |
| Match source to traversal/exploration/discovery | Implemented / constrained | Model chooses supported play; explicit modes preserved when feasible. Not arbitrary simulation. | `interpret.ts`, `staged-planning.ts` |
| Source-aware object action design | Live / constrained | Compatible supplies/recipients can become fixed resource interactions; source facts and geometry constrain movable actions. | `photo-planning.ts`, `photo-source-facts.ts` |
| Image-specific investigation | Live, prior bookshelf proof | Ordered clues refer to real pictured details. Valid target order/finish required. Current results can still be linear hunts rather than deduction. | `photo-planning.ts`, `discovery-progress.ts` |
| Clarification and recognition review | Implemented, recent robot review observed | Ambiguous or unsupported source/action outcomes return useful review rather than fabricating capability. Correction may still demand too much effort. | `recognition-error.ts`, `WorldSetup.tsx` |
| Automatic source masks | Implemented / constrained | Local Meta SAM 2.1 tiny on hosted route; direct SAM 3.1 optional adapter. Accepted mask is not semantic identity certification. Occlusions remain difficult. | `local-segmentation.ts`, `segmentation.ts`, `actor-grounding.ts` |
| Creator-confirmed outlines | Implemented | Keep/remove brush, preview, undo, zoom and bounded edge cleanup retain original pixels; exact source-bound fingerprints. | `SourceOutlineEditor.tsx`, `server/source-outline.ts` |
| Reconstruct the background behind a moving object | Implemented / constrained | Configured local LaMa and bounded source repair prevent obvious duplicate actors; texture imperfections and failed masks can remain. | `source-background.ts`, `moving-source-art.ts` |
| Bounded semantic repair | Implemented | A typed correction may repair invalid design under the same request budget; it must preserve intent/source/activity contract. | `retryable-planning.ts`, `photo-planning.ts` |
| Safe data-only compilation | Implemented | Models return validated game data, never executable game code. Unknown IDs, invalid movement, conflicting requirements and bad bounds are rejected. | `shared/world.ts`, `interactions.ts`, `server/interpret.ts` |

### Play and interact

| Capability | Status | What exists and its limit | Source |
|---|---|---|---|
| Adventure/platform play | Implemented, prior rough-robot keyboard completion | Character movement/jump, source surfaces, collectible goals, linked levers/gates, destination. Source grounding can require review. | `WorldScene.ts`, `source-platform-scene.ts` |
| Free 2D exploration | Implemented | Four-direction character roaming, source-positioned discoveries and obstacles. Not a reconstructed 3D room. | `roam-motion.ts`, `roam-route.ts` |
| Direct pointer play | Live | Select pictured tools/objects and their targets; no separate avatar needed. | `object-interactions.ts` |
| Keyboard alternatives for objects/discovery | Live | Object selector, named actions, focus controls; arrow/Space/E/Q controls vary by mode. DOM alternatives preserve access to canvas actions. | `WorldCanvas.tsx`, `WorldScene.ts` |
| Pickup, hold, put back and stationary source use | Live | Carry actual extracted art where safe, or select fixed supply in place. | `shared/interactions.ts`, `object-interactions.ts` |
| Transfer resource quantities | Live | Compatible type, supply, capacity and positive amount; fixed can→pot verified live. Game quantities are authored rules, not real measured contents. | `interactions.ts` |
| Place an object at a destination | Implemented | Bounded unchanged-object placement with fit/visibility checks; no arbitrary rotation/stacking physics. | `interaction-move-geometry.ts`, `interaction-planning.ts` |
| Use or attach a part | Live / implemented | A carried item can trigger a bounded effect or attach to a target. Rover antenna completion directly verified this audit. | `interactions.ts` |
| Operate an existing object | Implemented | Direct controllers can cause explicit valid movement/gate/ability effects; does not infer a full machine simulator. | `interactions.ts`, `ObjectBehaviorEditor.tsx` |
| Open gates, improve jump/speed, move a subject | Implemented | Reusable bounded effects with mode restrictions. Object travel is authored interpolation, not collision-aware navigation. | `interactions.ts`, `object-interactions.ts` |
| Causal prerequisites | Implemented | Action dependencies, full-resource requirements and costs can gate earned consequences. No arbitrary automatic narrative engine. | `interactions.ts` |
| Alternative actions and exclusive outcomes | Implemented | A player can choose explicit mutually exclusive outcomes, with validated finishing routes. The homepage rover has allocation alternatives but no exclusive-choice group. | `interactions.ts` |
| Guided and experiment play policies | Implemented | Guided protects a completing route; experiment can permit a mistake and recover to a solvable checkpoint. | `interactions.ts`, `world.ts` |
| Action undo and revisit choice | Live / implemented | Runtime offers bounded action undo/recovery where valid, distinct from world-edit undo. | `WorldCanvas.tsx` |
| Goal requirements and optional discoveries | Live | Required actions, filled objects, collectible details, activations and choices; completion waits for visible motion. | `world.ts`, `App.tsx` |
| Hints and previews | Live | Optional clue/object hint, legal-action preview, resource-before/after display, unavailable-action reason. Could communicate less technically. | `interaction-guide.ts`, `interaction-preview.ts` |
| Play presentation | Live | Pause/restart, focused play, browser fullscreen, overview/zoom/pan, original artwork access. Desktop does not need touch-direction arrows. | `App.tsx`, `WorldCanvas.tsx` |
| Sound and visual feedback | Implemented / partly inspected | Opt-in synthesized score/foley, pulses, transfer cues, movement and completion. Listening quality and sustained delight not established by code. | `soundscape.ts`, `atmosphere.ts`, `object-interactions.ts` |
| Reduced motion | Implemented / not fully exercised | Motion branches and CSS media rules exist. No full assistive-technology conformance claim. | `WorldScene.ts`, `Home.css` |
| Completion and continued play | Live | Keep exploring or continue creating while retaining the earned achievement; changed unmet goals can reopen play. | `App.tsx`, `world.ts` |

### Create, correct and evolve the same world

| Capability | Status | What exists and its limit | Source |
|---|---|---|---|
| Source-art editor | Live | Select objects from canvas/list, zoom/pan, keyboard positioning, names and size/position controls. Current modal/inspector remains tool-heavy. | `WorldEditor.tsx` |
| Draw/upload a new object | Implemented, prior browser proof | New artwork becomes a placed object with creator-assigned role/ability. Drawing alone does not automatically invent any mechanic. | `WorldEditor.tsx`, `SketchPad.tsx` |
| Add traversal objects or interactive regions | Implemented | Mode-aware tools for scenery/terrain/bridge/collectible/goal and source regions; roles match runtime constraints. | `WorldEditor.tsx`, `WorldSetup.tsx` |
| Assign and remove abilities | Live inspection / prior applied proof | Transfer, place, operate, movement, gate, jump and speed choices; target/destination and constraints. | `ObjectBehaviorEditor.tsx` |
| Visually choose effect destinations | Implemented | Select destination on scene rather than entering only coordinates; validates supported fit/visibility. | `WorldEditor.tsx`, `ObjectBehaviorEditor.tsx` |
| Set resources, costs and preparation | Implemented | Creator controls amounts, supply/capacity, readiness and action prerequisites. Needs a more approachable rule-authoring presentation. | `ObjectBehaviorEditor.tsx` |
| Author alternative outcomes | Implemented | Choice editor can group actions and require one outcome; preserves valid world rules. | `ObjectBehaviorEditor.tsx:ChoiceGroupEditor` |
| Change finishing rules/clues | Live inspection | Required versus optional goals/actions/resources, discovery clue editing/order. Repeated action labels can obscure source/target scope. | `GoalRules.tsx`, `WorldRulesSummary.tsx` |
| Update paper drawing/photo | Live inspection / implemented | Draw on current page, upload revision or phone capture; automatic compare for drawing and manual placement/update path for photos. | `PaperUpdate.tsx`, `server/amend.ts` |
| Review additions before commit | Implemented | Suggested additions, source evidence and manual correction are separate from applying to the active world. | `PaperUpdate.tsx`, `WorldEditor.tsx` |
| Correct source selection and geometry | Implemented | Selection rectangles/roles, source refinement, mask confirmation and initial layout review. | `WorldSetup.tsx`, `source-refinement.ts` |
| Preserve identity and earned progress through edits | Implemented, prior browser proof | Typed patches validate base revision and reconcile surviving progress; changed effects cannot silently inherit old receipts. | `shared/revisions.ts`, `interactions.ts` |
| Undo a world edit | Implemented, prior verification | Retains valid progress and bounded revision history; unsafe character-covering changes rejected. | `shared/revisions.ts` |
| Expand world bounds | Implemented / bounded | Existing engine allows bounded expansion; not infinite streaming worlds. | `WorldEditor.tsx`, `shared/world.ts` |
| Resumable ability/editor drafts | Implemented | Pending ability changes kept through selection/close; Apply blocked while a draft is incomplete. | `WorldEditor.tsx`, `ObjectBehaviorEditor.tsx` |

### Keep work, demonstrate and operate

| Capability | Status | What exists and its limit | Source |
|---|---|---|---|
| Local world library | Live inspection / prior release proof | IndexedDB saves artwork, world, progress and history; browser/origin-specific. Explicit Save, not cloud autosave. | `src/lib/library.ts`, `WorldLibrary.tsx` |
| Save a personal example copy | Live | Example provenance retained; editing does not mutate the packaged example. | `App.tsx` |
| Export/import portable backups | Implemented, prior live proof | Deduplicated art, progress and up to 12 undo checkpoints; 64 MiB document limit and bounded 512 MiB expansion. Import conflicts do not silently replace work. | `library.ts`, `WorldLibrary.tsx` |
| Unsaved-change protection | Implemented | Stay, discard/open, or save/open; errors retain current work. | `App.tsx` |
| Interactive homepage examples | Live | Rover invention, rough cat care, illustration adventure; same runtime. Prepared examples are not fresh model calls. | `Home.tsx`, `public/art/showcase/` |
| Homepage own-drawing part | Implemented / constrained | Replaces prepared part art and retains its declared rescue ability. Needs precise adjacent wording. | `Home.tsx:useInvention` |
| Deferred game engine loading | Live observation | No Phaser before Play; downloaded after deliberate Play. Single measurement is not a broad performance benchmark. | `main.tsx`, `Home.tsx` |
| Local recording aid | Implemented, developer-only | Explicit localhost tab/canvas WebM recorder, no audio; not a video editor or generated film. | `DemoRecorder.tsx` |
| Opt-in diagnostics | Implemented | Local frame/lifecycle/creation timings and numeric server provider timings; no image/prompt/key collection in those metrics. | `runtime-diagnostics.ts`, `server/model.ts` |
| Public hosted desktop product | Live, recent release verified | Correct-account Railway service; health/readiness and private-path/origin checks passed. Modal backup is separate. | `docs/LIVE-DEPLOYMENT.md` |
| Bounded creation and provider-busy handling | Implemented |120-second ceiling, paid-request reservations, cancellation, one budgeted explicit 503 retry. Stalls beyond this remain. | `server/model.ts`, `planning-budget.ts`, `index.ts` |
| Concurrent generation admission | Constrained | One global in-flight interpretation per service process; another visitor gets 429. No multiuser job queue or distributed quota implementation. | `server/index.ts` |
| Credential and source protection | Implemented, last scan passed | Server-side provider credentials, ignored key files, origin/host boundaries, validated requests and bounded image/worker input. Not a comprehensive security certification. | `credentials.ts`, `hosting.ts`, `scripts/check-secrets.mjs` |
| Automated regression coverage | Implemented, last release 283 passed | World/interaction/source/edit/storage/provider checks. Tests establish specific invariants, not aesthetic excellence or general recognition. | `package.json`, release evidence |

### Not currently implemented or established

- Arbitrary3D reconstruction, navigable spatial room reconstruction, world-model simulation, AR or real-world physics.
- General recipes/cooking, liquid/plant growth simulation, semantic object transformations, rich autonomous NPC routines or conversational characters.
- Universal picture understanding, recovery of hidden objects, automatic high-quality games for every possible input, guaranteed no provider timeout.
- Multiplayer, cloud user accounts/synchronization, public playable publishing/remix links, community feed or marketplace.
- Proven attachment/retention across ages, education outcomes, willingness to pay, comparative market superiority or a competition-winning score.
- A finished accepted replacement 2:58 film. The current request focuses on product; film work is not substituted for product improvement.

## Findings that change the next work

| Priority | Finding | Evidence and implication | Planned response |
|---|---|---|---|
| P1 | Automatic game quality is uneven | Real watering became a meaningful but single-step transfer; bookshelf became a visual hunt. The engine can express more than the generator reliably creates. | Evaluate candidate activities for source relevance, goal, agency, consequence and safe completion; improve selection using those failures. Do not force arbitrary complexity onto a simple image. |
| P1 | The first creative edit is not inviting enough | Empty inspector says Select an object to edit; selected inspector already has name/ability. New ability exposes transfer/resource/target/supply terms. | Teach the first selection, then offer a plain-language rule builder and local consequence preview. Preserve the existing advanced inspector. |
| P1 | Source type is easy to miss | Upload keeps Drawing by default. The choice changes planning, not only UI wording. | Put a small user-correctable Drawing/Photo choice beside the preview. Test optional content detection; never infer a photograph solely from JPEG MIME. |
| P1 | Homepage does not visibly prove its photo promise | All current examples have AI-generated drawing/illustration sources. Home own-part operation retains an authored ability. | Replace/rotate one current example with a verified real-photo interaction. One adjacent line explains retained part ability; no new marketing section. |
| P1 | Action feedback still reads like a utility | Expanded selector panel and resource arithmetic help precision but compete with the artwork. Multiple goals list repeated Power the beacon/rover labels. | Make direct scene actions primary; contextual preview for selected target; accessible selector as deliberate alternate. In rules, show source→action→target so alternatives are distinguishable. |
| P1 | Creation wait and correction remain material | Selected live photo took 51.866 seconds. A rough robot still requested outline review. One process admits one interpretation. | Truthful stage/status, cancellation and deliberate retry; measure requests separately from wait/review. Preserve originals and exact error context. Queue only if measured contention warrants it. |
| P1 | Some fidelity wording overstates confidence | Every SAM mask is called Precise cutout although semantic identity is not proven by accepted pixels. | Use neutral source-extraction wording and keep original/cutout comparison. No relaxed acceptance thresholds. |
| P2 | Design language exists, but complex states need more craft | Current Manrope/Fraunces and ink/vermilion are coherent. Editor has nested disclosures and dense technical form states. | Apply one hierarchy/spacing/control-state contract through every critical state, rather than replacing the palette or adding decorative effects. |
| P2 | Return and sharing are limited | Strong local saves/backups; no public playable project link or cloud sync. | Make Save status/local ownership explicit. Later add opt-in read-only published snapshots; keep remix/source privacy distinct. |
| P2 | Large orchestration and CSS increase change risk | App 2,486 lines, editor 1,754, styles 4,084 + 2,634. No measured defect follows from line count alone. | Characterize transitions, then extract only boundaries needed by a verified UX change. Avoid migration/rewrite as a substitute for quality. |
| Evidence gap | Retention, all-age appeal and willingness to buy | No representative user research or comparable market benchmark. | Observe consenting adult first-time creators; do not turn preference into a fabricated9/10. Child testing would be separately arranged. |

## Product direction to pursue

**Make the picture feel like the player's own place to act.** Preserve its recognizable marks or photographed objects. Give the player an understandable role and one visible desire/problem. Let the first action teach the rule, a subsequent action or creator edit change the result, and the ending show what their invention accomplished. More objects, mandatory chores or decorative particles do not substitute for agency.

Different inputs should create different meaningful action structures through shared primitives. For example: distribute visible energy among devices; care for a pictured character with a pictured supply; arrange genuinely separated objects into a useful pattern; explore evidence-rich details; or traverse suitable drawn surfaces. These are planning possibilities, not five filename-selected templates. A simple image may honestly support a short interaction. If an intended roleplay needs an unsupported transformation or character state, either add a general mechanic deliberately or make the limitation clear; do not rename an existing counter as a simulation.

The product's distinction should be **recognizability + consequence + invention**. A rough line can become a creator-chosen useful part. The UI should clearly distinguish model-proposed play, creator-authored abilities and previously prepared example rules. This builds confidence without covering the stage with explanations.

## What a substantially stronger game should feel like

The ambition is a creation experience people want to explore and return to. The following are proposed product outcomes, not capabilities declared finished:

| Desired improvement | What changes for the player | Architectural requirement |
|---|---|---|
| A recognizable role and purpose | The player understands what they are trying to help, build, organize or discover in their own image. | A concise source-grounded mission and supported action graph; optional creator override, not a long generated story. |
| Consequences with personality | A successful action visibly changes the pictured world's game state, rather than only incrementing a toolbar count. | Reusable state/effect vocabulary with source-faithful visual feedback. Rich character reactions or transformations require actual new capabilities; existing counters cannot masquerade as them. |
| Discovery rather than chores | The player reads relationships, tries a hypothesis and learns something useful. | Clues and affordances grounded in visible evidence; optional hints; unnecessary inventory targets removed. |
| Invention changes the outcome | A drawn addition gains a creator-understood ability and unlocks a new action in the existing game. | Plain rule authoring, visual destination/target, safe effect preview and persistent revisions. Appearance replacement and new ability authoring stay distinct. |
| More than one satisfying route when supported | A player can pursue different useful outcomes or solve a challenge differently. | General action/choice/resource constraints, legible consequences and validated finishing routes. More clicks or arbitrary scarcity are not automatically better. |
| A finish that belongs to this world | The outcome shows what the player actually accomplished and suggests a relevant next invention. | Completion triggered after real state change/motion, retained achievement and useful edit/replay entry. |
| A return worth making | A creator recognizes their own work, continues from it and can show a result clearly. | Reliable saves, readable world cards, reversible edits and eventually explicit share/remix publishing. No streak pressure or invented retention claims. |

For a simple input, this may be a short satisfying interaction. A richer input can sustain a more substantial episode. The planner should recognize the difference and explain unsupported requests clearly. **Our internal quality standard should reward the best supported game for the image, not force every image into the same complexity or mechanic.**

## Visual and interaction design specification to prepare before implementation

1. **Homepage:** retain one dominant artwork stage and one clear creation action. Show a real-photo interaction, a rough drawing and a richer authored world in the existing chooser. Make selected-example behavior understandable through the action itself. Keep provenance small but readable. No extra carousel, partner-logo wall, fake activity metrics or long sales copy.
2. **Creation:** one source preview, one optional idea, compact source-kind control, one Make game action. Gameplay options stay optional. Include a truthful wait expectation, not an unsupported countdown or fabricated progress bar. Failed/cancelled work stays immediately resumable.
3. **Review:** compare actual source with the playable interpretation, reveal uncertain selections only where needed, and explain the main action in one sentence. Keep precise controls behind Edit objects. Make the distinction between accepted pixels and verified object identity visible when relevant.
4. **Play:** stage first, compact mission, contextual selected-object/action preview. Keep quantity details when they matter, but avoid showing every possible label at once. Hover, focus and selection should share stable names/signifiers. Expanded keyboard controls must remain reachable and avoid required play targets. Focused/fullscreen play must preserve state and exit clearly.
5. **Editor:** explore a larger desktop canvas treatment with persistent top tools and contextual right inspector, rather than assuming more modal nesting is best. This is a design proposal to test, not authorization for a risky rewrite. Object identity and existing abilities already exist; improve the first selection and rule comprehension instead of duplicating them.
6. **Rule authoring:** progressive sentence: **When [source] is used with [target], [effect], after [condition].** Let creators choose a scene destination and preview a legal effect before Apply. Resource amounts/costs and alternate outcomes remain available as advanced fields. This compiles into existing validated contracts wherever possible.
7. **Typography:** preserve Manrope UI and selective Fraunces display. Establish explicit tiers for display, scene title, inspector heading, field label, supporting note; avoid tiny labels serving primary instructions. Use tabular numerals for resources/zoom and concise source names without losing full accessible names.
8. **Spacing and controls:** use the existing4/8/12/16/24/32 scale; align labels/fields/footers to consistent edges. One visual primary per surface. Check default, hover, focus, selected, disabled, busy and error states. Destructive/remove actions must not visually compete with creation/play.
9. **Color:** keep calm workspace and source art central. Use selection/focus/error as distinct roles, never color alone. A photo-derived scene accent may be tested only with contrast validation; it must not recolor original artwork or generate a new arbitrary app palette per image.
10. **Motion and sound:** feedback should communicate cause: a resource travels, a mechanism responds, a character/vehicle reaches its new state. Preserve pixels and label any introduced effect. Reduced motion conveys the same state without flourish. Opt-in sound supports the action; no autoplay or decorative noise.
11. **Finish and return:** show the accomplished outcome before completion controls, then a useful choice to replay another route or change this world. Save state and browser-local storage ownership should be unambiguous; completion must not obscure the final consequence.

## Milestones and tasks

These are ordered by dependency and user-visible benefit, not time promises. Status: Planned unless stated. No implementation is authorized by this analysis alone.

| Milestone | Concrete tasks | Exit evidence | Dependencies |
|---|---|---|---|
| M0 — establish current truth (Complete) | Inventory code, inspect live home/create/play/editor/rules/library/update flows, retain actual failures, complete simulated critique. | Linked audit evidence and a list separating working, constrained and absent capabilities. | Current baseline |
| M1 — approve one visual/interaction treatment | Produce five cohesive reviewable states: homepage, create/review, focused play, selected-object editor, completion. Include loading/error/empty variants; map all existing functionality. | Screens reviewed at 1280×720,1440×900,1920×1080; no clipped primary action, inaccessible advanced control or source-art distortion. Preference decisions remain explicit. | M0 |
| M2 — make first creation understandable | Improve source-kind choice, concise expectations, honest busy/recovery copy, uncertainty-targeted correction and initial goal/action preview. Keep optional controls optional. | Fresh drawing and photo sessions reach play; cancel/fail/retry preserves source, idea and active world. Photo route is deliberate and visible. | M0; uses M1 controls |
| M3 — improve automatic meaningful game design | Define internal activity-quality checks; sample varied unseen inputs with preserved intent; inspect action graphs and real play, then repair dominant failure categories. Add a generic state/effect only when multiple inputs demand it. | Source-specific goal; at least one supported consequence; no arbitrary chore chains; playable finish. Record number of attempts, reviews and completed games separately. Simple games are not penalized merely for being small. | M2; current engine |
| M4 — make creator invention effortless | First-selection invitation, linked scene/list/inspector feedback, sentence rule builder, visual target/destination, local preview, immediate play→edit→resume. Preserve advanced inspector. | New creator can predict and demonstrate one meaningful edit; Apply/Discard/Undo work, same identity/progress survives, no hidden unfinished ability. | M1–M3 |
| M5 — strengthen game feel | Action/target readability, concise feedback, scene-safe keyboard panel, distinguishable alternatives/rules, earned payoff, coherent sound and reduced-motion behavior. | Observe source→action→result without relying on prose; input remains responsive; final motion completes before finish; no misleading visual physics. | M3–M4 |
| M6 — verify reliability and desktop craft | Mixed holdout corpus, outlines and corrections; timeout/busy/cancel; old-save/edit/undo/import paths; load and lifecycle measurements; targeted CSS/state extraction only as needed. | Report all cases and actual latency; no regressions in defining flows; security/secret/build checks. Queue development requires measured contention, not assumptions. | Each prior milestone increment |
| M7 — make finished creations presentable | Update existing homepage examples with honest photo/drawing proof and a richer playable result; high-quality world cards with original/outcome; optional published snapshot design later. | A clean-browser visitor understands what was created, what they can do and what was authored. Any sharing is explicit, source-aware and opt-in. | M3–M6 |

### Suggested first implementation batch

- Clarify source type beside the image and preserve explicit choice.
- Replace overconfident mask language with truthful extraction wording.
- Improve empty editor invitation and action/target naming in rules.
- Design and test sentence-based ability authoring while retaining the advanced path.
- Add a verified actual-photo case to the existing homepage chooser, with no extra section.
- Review the first meaningful action and its feedback on each featured world before adding visual decoration.

This batch combines low-risk clarity work with one substantial creative-control improvement. It does not pretend the source recognition or game-design problem is solved by copy changes.

## Acceptance checklist for each implementation increment

- [ ] Original image and source colors remain recognizable; introduced art/effects are identified.
- [ ] Explicit supported creator intent survives; no filename/sample identity selects mechanics.
- [ ] A fresh unfamiliar drawing and a photograph complete source→review(if needed)→play.
- [ ] One creator edit has a predictable visible consequence; Apply/Discard/Undo retain identity and valid progress.
- [ ] A previous saved game and backup load/play/save/reopen after the change.
- [ ] Desktop primary actions, focus and advanced controls remain reachable at all three agreed sizes.
- [ ] Copy, control naming, font hierarchy, color, spacing and loading/error/empty/success states are inspected visually.
- [ ] Counter changes are not described as physical transformations; authored examples are not described as fresh generation.
- [ ] Generation attempts, corrections, failures, actual completions and observed latency are recorded separately.
- [ ] Relevant regression checks, build, typecheck and credential scan pass. Keep checks targeted; do not inflate the suite with implementation-mirroring tests.
- [ ] No universal reliability, perfect score, all-age attachment or winning claim is made without evidence.

## Research references and limits

[Panic's Pulp](https://play.date/pulp/) demonstrates an integrated creation/preview environment with optional deeper controls. The relevant principle is low friction between creating and playing, not copying its look or its bounded tile engine. [Game Accessibility Guidelines](https://gameaccessibilityguidelines.com/give-a-clear-indication-that-interactive-elements-are-interactive/) support consistent signs that source objects can be interacted with; Doodlume should test those signs without covering the image. These references inform proposed design tests; they do not establish our product's usability or competitive superiority.

The council transcript is a simulated analytical review, not actual participation/endorsement by the named public-work inspirations. Initial recommendations are revised where later inspection showed existing controls already solved part of the concern. No score is fabricated. No real user interviews, physical phone-camera test, listening evaluation, screen-reader conformance audit or exhaustive all-input test was performed during this audit. Previously recorded live runs are distinguished from actions exercised again here. No production application changes or deployment are part of this review.


## Review artifacts

- Complete four-round simulated council: [transcript](reviews/2026-11-04-full-product-council.md), [structured record](reviews/2026-11-04-full-product-council.json). Forty reviewer contributions, nineteen proposals and thirteen decisions; original contributions and dissent preserved.
- Work checklist: [task register](PRODUCT-IMPROVEMENT-TASKS-2026-11-04.csv). M0 audit is complete; proposed application improvements are not falsely marked done.
- Local screenshots and detailed intermediate evidence are retained under `outputs/full-product-audit-2026-11-04/` (ignored by Git). The audit reviewed the complete live homepage plus create, sketch cancellation, playing/completion, original comparison, editor selected/empty/expanded ability states, completion rules, image update and empty library. Current source covers the wider feature catalogue.

The live application is unchanged by this analysis. The next implementation should start from M1's coherent state designs and the small clarity changes in M2, with the source-specific game-design and creator-invention work proceeding against the same acceptance register.
