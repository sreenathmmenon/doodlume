# Doodlume — submission-first product direction and execution plan

Prepared November 3, 2026. Status: the rover episode now has verified source-object play, authored routing choices, a player-drawn functional part, visible travel and save/reopen. A distinct rough cat-care input is also verified with a disclosed selection correction. The new playable homepage is implemented and under final integration review; the final film, deployment and broad photo/rough-input corpus remain pending. This document incorporates the owner's steering during planning: win the hackathon through a substantial game, exceptional execution and a compelling 2:58 film; broader product expansion follows later. It supersedes conflicting future priorities in older milestone documents, not their historical evidence.

## 1. The direction

Doodlume turns a person's imperfect drawings and photographs into playable worlds where familiar objects become useful, characters have needs, and the player can invent changes that affect what happens. Preserve the person's art, intention, choices and progress. Give them a role worth playing, a challenge worth solving and a creation worth keeping.

The reference conversation's petrol pump, kitchen, garage and room examples explain the desired depth: fill, repair, prepare, serve, explore and invent. They are examples of meaningful action, not a fixed catalog of scene templates. Pokémon is a design reference for discovery, expressive behavior, mastery and attachment; it does not authorize copying its characters, collecting structure or geographic infrastructure. Wang is a reference for coherent product ownership and execution, not social-media imitation or a real reviewer.

The owner explicitly rejected the prior film. Preserve it as an old artifact, never treat its technical export checks as creative approval. Preserve both existing generated drawing sets. Attractive illustrations remain useful, but ordinary imperfect inputs must be demonstrated too. AI-generated test drawings must not be described as real children's drawings.

### Three promises that must be visible

1. **This is mine:** recognizable original marks and photographed objects remain present.
2. **I can do something meaningful:** actions have visible, consistent consequences and create decisions.
3. **My invention changes the game:** a new drawing or instruction changes a capability in the existing world, with progress retained.

The target is a strong first-prize submission. Neither this plan nor an internal review can establish a winning probability or a measured 20,000× advantage.

## 2. Research and evidence

| Evidence | Finding | Decision for our product |
|---|---|---|
| [Pokémon Legends: Arceus official gameplay](https://legends.arceus.pokemon.com/en-us/gameplay/) | Observation, differing creature behavior, useful abilities and crafting create decisions across encounters. | Give interactions discoverable rules and meaningful consequences; changing scenery alone is insufficient variety. |
| [Pokémon GO Buddy Adventure designer notes](https://pokemongo.com/news/buddyadventure-devinsights) | Designers connect expressive individual behavior with shared exploration and companionship. | Let a creator's own character react to specific events; preserve its identity. Persistent cross-world companionship is a later extension, not needed for this submission. |
| [Wang interview, October 11](https://www.davidsenra.com/episode/alexandr-wang) | The publisher's transcript emphasizes one coherent experience, an early impressive moment and defined quality thresholds. | One clear product story and explicit acceptance gates. Do not expand into a bundle of unrelated features. Transcript is machine-generated; no verbatim quotation used. |
| [Toca Boca World](https://www.tocaboca.com/toca-boca-world) | Everyday settings and player-authored stories are central to its official positioning. | Support roleplay through objects and actions, with optional goals instead of mandatory chores. |
| [Roblox Cube functional-object explanation](https://about.roblox.com/newsroom/2026/02/accelerating-creation-powered-roblox-cube-foundation-model) | Generated parts need behaviors; scripts are adapted to generated geometry. | Build reusable behavior definitions and adapters, separate from recognition and rendering. |
| [Meta drawing research](https://about.fb.com/news/2021/12/using-ai-to-animate-childrens-drawings/) | Abstract, unpredictable drawings create recognition challenges. | Respect creator corrections and invented meanings; do not demand polished drawings. |
| [Meta event page](https://dev.meta.ai/events/global-hackathon) and [CV event page](https://cerebralvalley.ai/e/meta-ai-developer-hackathon) | Rechecked November 3: submission November 4, 9 PM ET. | Deadline is November 5, 7:30 AM IST. Protect submission and film time. |
| Participant guide previously captured from [authenticated details](https://cerebralvalley.ai/e/meta-ai-developer-hackathon/details) | Re-read local capture: impact 30%, Meta tooling 25%, engineering 20%, demo 25%; public repo and event-work disclosure required. | Map evidence to all four categories. Fresh public details fetch exposes only loading, so do not describe the private guide as freshly revalidated online. |

Research is a combination of primary documentation and the current source/UI inspection; it is not evidence that these designers reviewed Doodlume. Earlier research includes bounded competitor observations, not a ranking or comprehensive entrant count. See SUBMISSION-RESEARCH-2026-11-02.md.

### Initial inspection — historical baseline before implementation

- At the initial planning pass, homepage and studio were inspected in browser at 1280×720. The homepage leads with a polished floating-ruins illustration. The default studio displays a grove collection adventure, a generic required-actions heading, required/optional counts and multiple authoring controls before play.
- That composition communicates a creation tool, but does not yet demonstrate the requested roleplay depth. This is a product-design assessment, not a new bug diagnosis or fresh full playthrough.
- `shared/world.ts`, `server/interpret.ts`, `server/creative-adaptation.ts` and `src/game/WorldScene.ts` constrain behavior to platform/roam/discover plus collection/activation/destination rules. The interpretation schema asks for at most 24 source objects; this is a current processing bound, not a legitimate promise of unlimited processing.
- The engine has useful existing foundations: source extraction, source-aligned scenes, movement, sound/feedback, review, editing, undo and local persistence. Retain and extend them.
- At that baseline, general object possession, quantities, tool-target compatibility, recipes, character needs and capability changes were absent from the world contract. A pump label or cooking prompt cannot supply those mechanics.
- `src/lib/library.ts` currently has no automatic retention cap. Older picture documentation mentioning an eight-world cap is historical and stale. The new plan uses current code as authority.
- Existing live model path: Meta Muse Spark Open through Fireworks, with local SAM 2.1. Other credited providers are options, not demonstrated dependencies. No new paid calls or credential reads were made for this plan.

## 3. The substantial game we should showcase

**Current verified flagship: a source-faithful rover illustration with resource-routing choices and a player-drawn rescue part.** The earlier workshop-in-a-photo direction below remains a concept reference, not a completed photo conversion. The rover was selected after actual source extraction and play checks; it is an authored showcase using general engine rules, not a permanent template.

A rough character drawing and an ordinary desk/play-area photograph become the player's workshop. A stranded small vehicle needs help delivering something important. The player inspects what is wrong, uses available objects, creates a missing useful part, restores the vehicle and sees the delivery succeed. A second need lets them reuse what they learned with a different decision. Exact artwork and plot are selected only after the first real capability proof.

Why this episode: it combines the reference's roleplay and useful tools with Doodlume's original drawing-to-game identity. A wheel turning, a charge level changing and a vehicle finally moving can be understood visually. It offers clear opportunity for creator invention, expressive characters and a satisfying ending.

### Required playable content

| Beat | Player action | Meaningful decision / consequence |
|---|---|---|
| Discover | Inspect the stranded vehicle and available objects | Learn a visible need; the answer is not just an object-name quiz. |
| Act | Pick up and use a compatible tool or supply | The right action changes a state; an unsuitable action gives concise feedback without consuming the item. |
| Learn | See how the object responds | Feedback teaches a reusable relationship, such as a supply filling a capacity or a part enabling movement. |
| Invent | Draw a missing part or modify a tool and assign its intended function | Original pixels become a functional object. The user can correct the interpretation. |
| Resolve | Apply the invention and complete the task | Visible causal payoff; the character responds to this accomplishment. |
| Extend | Meet a second need or try another supported solution | Reuse the learned mechanic with a new choice, not identical clicking with new artwork. |
| Keep | Save and resume | The invention, changed state and earned progress remain. |

The episode should support approximately 2–4 minutes of actual coherent play; the film shows selected consequential moments from it. Timing is a design target to test, not a retention claim. Success must not depend on a hidden filename, special image ID, injected completion or scripted success sequence. The story can be deliberately authored for the demo, but object interpretation and behavior must be real and reusable. Label authored examples honestly.

### Three general behavior families for the submission candidate

1. **Carry and use:** take an object, choose a target, validate compatibility, apply a consequence.
2. **Transfer a resource:** a source loses a bounded amount, a target gains it, the visual state updates. Supports charging, watering and filling without claiming fluid simulation.
3. **Attach and enable:** a drawn part attaches to a compatible target and grants a supported capability, such as movement. Geometry and appearance follow the actual source art.

These are candidate engine primitives, not three predefined games or a permanent creative ceiling. First prove one end to end, then extend. Existing collection, switches and traversal remain usable. More mechanics enter the submission build only if they strengthen the same film and survive validation.

**Breadth proof:** the same transfer behavior must work in two materially different inputs, such as a workshop charging task and watering a drawn garden. The same attach/use system must accept an unfamiliar drawn part. Different player intentions on one image should produce different supported goals. Test these transformations; do not merely change scene captions.

## 4. Architecture decisions

Preserve React + Phaser and existing source-art pipeline. Extend the world schema explicitly rather than adding scene-specific branches to the renderer.

| Layer | Responsibility | Required safeguard |
|---|---|---|
| Input understanding | Identify source regions and creator intent; support source image plus optional separate character drawing | Distinguish observed objects, inferred roles and generated additions. Never guess the creator's intention from age or identity. |
| Game plan | Propose a role, goal, object capabilities, action relationships and consequence sequence | Only reference supported runtime capabilities and real object IDs; one focused clarification for consequential ambiguity. |
| Compiler/validation | Produce a versioned world and behavior graph | Validate bounds, compatibility, reachability, resource conservation, dependencies and finish conditions before committing. |
| Runtime | Execute deterministic local actions and presentation | No inference calls per frame or for each basic input; invalid actions leave state intact. |
| Rendering | Preserve original pixels, animate state changes, maintain readable interaction targets | Match visible art to hit areas; avoid duplicated moving objects and false 3D claims. |
| Editing/persistence | Apply amendments atomically, preserve IDs and surviving progress; undo and save | Version migrations, reversible changes, no silent overwrite or progress reset. |

Introduce object capabilities and per-object state, event-driven effects, objective predicates and explicit source provenance. Do not expose this machinery to ordinary players. Keep raw code execution out of model responses. A plan interpreter with supported operations provides extensibility without making untrusted generated code part of the execution path.

For character expression, begin with context-sensitive motion, orientation and a few distinct reaction states that preserve unusual shapes. Full skeletal rigging is not required for an expressive response. Do not turn every creature into the same stock character.

World models/3D, GPS/AR, global collection, multiplayer, marketplaces, voice and cloud accounts remain later expansion. They have potential, but none is a dependency for proving this game's creative depth. Muse Image/Wonder is a separate access-and-value decision; the guide's creative bonus specifically names them, and current Spark Open usage alone must not be represented as qualifying for that bonus.

## 5. Work backward from the 2:58 film

This is a target storyboard, not a claim that footage exists. Every shot must be captured from the working product. An external cinematic render cannot stand in for gameplay.

| Time | What a viewer sees | Evidence it must establish |
|---|---|---|
| 0:00–0:12 | Ordinary drawing/photo, then the recognizable character performing a consequential action | Immediate ownership and real play; no long title card or upload tour. |
| 0:12–0:28 | Brief original-input reveal and the person's intention | Understand the product and who it is for. Disclose any shortened generation wait. |
| 0:28–1:03 | First task: inspect, select/use, visible consequence | A substantial game with a clear role and decisions. |
| 1:03–1:38 | Player draws the missing invention, corrects if needed, uses it | Creativity changes capability in the same world. |
| 1:38–1:58 | Payoff, character response and second decision | Satisfaction and progression beyond the first trick. |
| 1:58–2:22 | A genuinely different drawing/photo and a different interaction | Transferable capability; avoid a slideshow of unplayed worlds. |
| 2:22–2:38 | Concise Meta contribution shown alongside corresponding behavior | Specific real model roles; source provenance and supported rules. |
| 2:38–2:50 | Reopen the changed world or continue with the created object | Persistence and authorship. |
| 2:50–2:58 | Strong final gameplay image and a short product invitation | Memorable ending with accessible project link. |

Score the storyboard by what viewers can understand with audio muted, then improve sound and narration. Sound needs an actual listening pass. Retain continuous source recordings and a shot-to-feature ledger. The prior slideshow-like edit is not the visual template.

Homepage: one dominant genuine source-to-play sequence, one primary create action and a clear way to try the demonstrated world. Replace generic required-action headings with contextual purpose. Keep technical details available for judges outside the play surface. Artwork should carry the character and color; interface surfaces stay quiet. No unmotivated palette/font overhaul, all-black restyle, crowded counters or promotional claims that exceed the build.

## 6. Milestones and tasks

The checkboxes below close only the stated inspected task, not the complete milestone or a universal quality rating. The CSV is the detailed status ledger; unchecked tasks can be partially implemented. Evidence and unresolved acceptance work appear at the end of this document. Role owners describe responsibilities, not external endorsements.

### M0 — Direction and evidence (completed for planning)

- [x] R01: Use the reference conversation as the starting brief and incorporate subsequent owner corrections.
- [x] R02: Research Pokémon gameplay, Wang's product principles and comparable interaction architecture.
- [x] R03: Inspect current homepage/studio, relevant source contracts and historical verification limits.
- [x] R04: Recheck public deadline; read the saved participant rubric and submission requirements.
- [x] R05: Choose a submission-first direction, target film, dependency order and acceptance gates.

### M1 — Prove the defining interaction (P0)

Owner: gameplay/architecture. Depends on M0.

- [x] A01: Freeze a scene beat sheet: player role, goal, two decisions, invention, payoff; list the real operations each shot requires.
- [ ] A02: Establish a small mixed input set from preserved drawings, owner samples and permitted photos; include rough art and an unseen holdout. Record origin accurately.
- [x] A03: Implement versioned capabilities/state and one carry/use → attach → visible capability-change path using ordinary object definitions.
- [x] A04: Preserve source pixels and all unaffected progress through the new action; verify invalid targets leave state intact.
- [ ] A05: Capture an uninterrupted functional proof on one original input and repeat the same operation on a different input.

Exit: the invention really changes what the player can do; two inputs exercise the same general code. If this fails, fix the causal mechanism before building scenery or recording a trailer. Report the failure against the gate; do not relabel a collection click as repair.

### M2 — Turn interpretation into a substantial episode (P0)

Owner: model/gameplay. Depends on M1.

- [ ] B01: Extend interpretation and review for capabilities, targets, explicit creator intention and optional separate character art.
- [x] B02: Compile a role, task sequence and objective predicates from the supported action graph; no scene-name dispatch.
- [x] B03: Add bounded resource transfer and visible state presentation; confirm conservation, target compatibility and cancellation.
- [x] B04: Build the flagship episode's learning, invention, payoff and second-decision beats using the general system.
- [ ] B05: Add expressive event reactions and a satisfying finish; keep them specific to the action.
- [x] B06: Produce a fresh Meta-generated result and a materially different second scenario; log attempts and corrections, not only successes.

Exit: at least one complete coherent episode, plus demonstrated mechanic transfer. Source recognition, initial creation and incremental invention use actual documented paths. Any manual intervention is recorded.

### M3 — Protect creative control and ownership (P0)

Owner: architecture/UX. Depends on M1; closes after M2.

- [x] C01: Give the player a concise way to correct what an object is and what it should do.
- [x] C02: Apply a drawn addition atomically; retain stable identities, existing state and earned progress.
- [x] C03: Extend undo, restart, save, reopen and backup for new state; migrate legacy worlds without deleting them.
- [ ] C04: Preserve drafts and world state on timeout, failed segmentation, invalid plans and quota errors.

Exit: create → play → invent → use → undo/reapply → save → reopen succeeds without losing the original or progress. Old worlds still open.

### M4 — Make the demonstrated experience visually exceptional (P0)

Owner: visual/interaction/game design. Implementation depends on M2's real behavior.

- [ ] D01: Set a scene composition sheet: source identity, focal point, scale, contrast, lighting treatment, motion and sound. Choose the scene by actual play payoff, not illustration beauty.
- [ ] D02: Refine every visible action: hover/focus/selection, compatible targets, response timing, transitions and failure feedback.
- [ ] D03: Remove redundant copy and controls; use a contextual goal, minimal HUD, keyboard controls and focused play. Keep edit/undo/save easy to find.
- [x] D04: Rework the homepage around the verified transformation and playable episode; retain an obvious create path for drawings/photos.
- [ ] D05: Inspect full desktop flows at 1280×720, 1440×900 and 1920×1080; check spacing, clipping, contrast, font hierarchy and dialog consistency.
- [ ] D06: Perform an actual sound/listening and reduced-motion review; avoid autoplay audio and ornamental effects that obscure source art.

Exit: the hero sequence reads without narration, the original is recognizable, every shown control has a purpose, and no blocking visual or interaction defect remains in the inspected desktop flows. User taste approval remains distinct from technical checks.

### M5 — Prove reliability, variety and judge access (P0)

Owner: verification/release. Depends on M2–M4.

- [ ] E01: Run 12 varied source sessions, including at least 4 unfamiliar holdouts. Record intent, model output, corrections, supported behavior, completion, source fidelity and latency.
- [ ] E02: Include pencil, crayon, marker, ambiguous scribble, low-contrast photo, room, close-up object, cluttered scene, portrait layout, illustration, mixed characters and one revised drawing. The corpus is evidence, not an input limit.
- [ ] E03: Complete the flagship twice from fresh creation; verify a second distinct game's full loop and progress persistence.
- [ ] E04: Measure creation stages and active gameplay. Target 60 fps on the declared desktop, p95 frame time ≤25 ms during play, local action response ≤100 ms, and no visible stalled state. These are proposed release targets, not current measurements. Report generation median/p95 separately without promising an unmeasured limit.
- [ ] E05: Run build/type checks, focused state/migration/revision/provider regressions and secret scanning. Add only tests for material new invariants or reproduced bugs; avoid a broad new UT suite.
- [ ] E06: Verify the judge-facing deployment from a clean browser, with no local-only dependencies, exposed credentials or required owner session. Set explicit inference budget/rate control and visible recovery.

Exit: critical defects resolved, denominators and failures recorded, tested access path works. A failed holdout informs a fix or explicit capability limit; it is never silently replaced in the reported results. Observation of actual users is valuable if available, but no child testing or outreach is assumed authorized.

### M6 — Create and verify the new 2:58 film (P0)

Owner: film/product. Depends on M5 for final footage; shot planning already done.

- [ ] F01: Capture continuous real source sessions in a clean recording environment; exclude unrelated windows and notifications.
- [ ] F02: Edit the 178-second story around actions and consequences. Mark shortened waits and distinguish examples from fresh generation.
- [ ] F03: Write concise narration only after footage proves the statements; mix music/effects below speech and add readable captions.
- [ ] F04: Review beginning-to-end with audio and again muted; inspect transitions, pacing and visual continuity. Reject dead time and screenshots pretending to be gameplay.
- [ ] F05: Verify duration, resolution, audio, playback and every claimed capability against the shot ledger. Check a publicly accessible playback link.

Exit: a complete film with real gameplay, a comprehensible invention/payoff, diversity proof, precise Meta attribution and no unsupported claims. A technically valid export alone does not close this milestone.

### M7 — Complete the submission (P0)

Owner: release/submission. Depends on M5–M6.

- [ ] G01: Prepare problem, impact, track/theme, Meta-use explanation and factual partner feedback. Recommend Build for Your World; keep the already-selected track unless explicitly changed.
- [ ] G02: Document model/provider versions, event-period contributions, input origins, reproducibility, limitations and artifact access.
- [ ] G03: Prepare the repository for the guide's public-access requirement: check tracked files/history, environment examples and asset rights. The repo stays private during this planning task; any visibility change is an explicit release action.
- [ ] G04: Verify video/repo/demo links from a signed-out browser and prepare the final form. Record submission confirmation when submitted; never infer success from a prepared form.

Exit: accessible evidence and a confirmed submission. Public posting and social campaigning are separate actions and are not authorized by this plan.

## 7. Product priority policy

Priority order: defining playable invention → complete episode → state integrity → visual/interaction craft → demonstrated variety → final film and submission. Homepage art direction can proceed alongside gameplay, but publish only footage of actual working capabilities.

Report progress through working behavior, visible quality and evidence. Resolve failures in the defining interaction before expanding scope. Preserve a known-working build and saves before each structural change. Unfinished capabilities remain explicit; do not present the intended vision as already shipped.

Later expansion: richer recipes, multi-character simulation, reusable characters across worlds, community sharing, live collaboration, broader 3D, speech, mobile refinement and monetization. These are not prerequisites for the current coherent submission and are not cancelled product ambitions.

## 8. Acceptance register and review discipline

### Judge evidence, planned backward

| Recorded rubric | What the submitted experience must demonstrate | Evidence owner |
|---|---|---|
| Impact, 30% | A person can turn their own imperfect visual idea into an enjoyable interactive creation with much less authoring friction. Show the user's goal, their meaningful control and the finished experience. Do not claim educational outcomes, market demand or retention without evidence. | Product / M2–M5 |
| Meta tooling, 25% | Actual Meta inference understands the input and intention, proposes supported object relationships and contributes to the invention. Show source-to-output correspondence and actual model identity. Local runtime then makes interaction responsive. | Model / M2, M6 |
| Technical execution, 20% | Real source extraction, validated reusable behavior, persistent state, reversible edits and a working unfamiliar-input case. A clean-browser demo and readable repo must support the film's claims. | Architecture / M1–M5, M7 |
| Demo, 25% | A compelling opening, substantial decisions, a surprising invention, visible payoff and an excellent 178-second edit with intelligible sound. The experience holds up when played live. | Game design / M4–M6 |

The proposed flagship can contribute to all four categories; extra integrations or decorative breadth should not displace its execution. These are evidence requirements, not predicted scores.

| Risk | Evidence needed to close it |
|---|---|
| Beautiful image, shallow game | A complete episode with at least two meaningful decisions, learnable rules, creative intervention and payoff. |
| Every input gets the same game | Different source inputs and intentions produce distinct action/goal structures; same primitives transfer across them. |
| Only polished art works | Mixed corpus with unfamiliar rough inputs; correction is quick and preserves intent. |
| Invented source meaning | Creator can override role/function; generated additions and detected objects are distinguished. |
| Animation mistaken for simulation | Player can vary action and timing; invalid actions behave consistently; effect changes real runtime state. |
| Magic depends on one scene | No filename/world-name switches; new inputs use the same compiler and renderer. |
| New schema breaks old worlds | Backups and migrations verified; old save loads, edits, plays and reopens. |
| UI competes with the artwork | Desktop inspection finds no unnecessary visible controls or obstructed important scene elements. |
| Film conceals unusable flow | Continuous originals retained; cuts/time compression disclosed; a clean-browser live path also works. |
| Meta contribution is superficial | Fresh inference evidence connects actual source understanding and supported behavior planning to the demonstrated result. |
| Review score replaces evidence | Every claimed completion links to an observation; unresolved items remain visible. No blanket 10/10 or celebrity approval. |

Maintain tasks using Pending / In progress / Verified / Blocked / Deferred. A finished code change is not Verified until its user-visible gate passes. Carry original criteria forward; new findings are logged as new evidence, not hidden or used to rewrite earlier results. This planning pass did not run the formal four-round product-council protocol and makes no council approval claim.


## Implementation evidence — object interactions

The implementation now carries actual source artwork, transfers bounded resources, attaches drawn parts and changes real jump/movement/gate behavior. Rules reference object IDs; no input filenames select a scene. The editor can assign/remove abilities and preserves revision history. Model and manual required tasks share feasibility validation.

Verified in the application: a rough spring was drawn with the pointer, assigned a jump attachment, applied to an existing example copy, saved/reopened, removed, restored with Undo, picked up and attached. This is manual authoring evidence, not a model recognition claim.

Fresh Meta inference through Fireworks produced the café task from the preserved AI-generated café doodle. The prepared result was imported through the ordinary backup UI, played by selecting the mug and plant, completed, saved and reopened. Actual persisted quantities were mug 1, plant 2 from an initial total of 3. The café is one task, not a substantial flagship episode. Its first extraction left a visible crescent of the original mug. Subsequent whole-object recovery and local background repair corrected the inspected café result; this does not establish flawless extraction for other inputs.

The kitchen attempt exposed a rejected one-surface assumption; that general restriction was corrected while retaining physical checks. A subsequent actual Meta result generated four dependent transfers and an earned jump boost. Its quantities and effects passed deterministic execution, but browser inspection found a rear tabletop edge incorrectly treated as a floor through the robot. The resulting elevated actor and unnecessary final jump disqualify this artifact as visual play proof. It is retained as failure evidence; depth-aware grounding instructions and a tested actor-interior crossing check now reject that faulty geometry.

The compact ability editor keeps the game visible alongside controls. Rapid keyboard actions, source-backed gate visibility, no-destination completion, last-ability removal and referenced-object deletion received specific repairs. Completion presentation waits for the final action's visible consequence. These are scoped improvements, not a full-product score or external approval.

Evidence is in `outputs/verification/object-gameplay/`, `outputs/verification/runtime-interactions/` and `output/playwright/`. The task CSV records remaining work. The subsequent rover invention and alternative-allocation sessions, plus a distinct rough cat-care session, are recorded below. The remaining gates include a completed homepage recording, the final film, clean deployed access and broader input verification.

A separate initial upload → interpretation response → recognition review → play check replayed the genuine saved café response without new inference. Required actions survived review, keyboard focus did not accidentally pick up objects, and the final resource transfer was visible before completion. Review summaries and finishing controls now include object actions. Replay evidence is distinct from the fresh model call above.


## Current work — source objects, invention and meaningful choices

The three parallel implementation responsibilities are recognition/source fidelity, runtime/game feel, and safe state/interaction architecture. The primary agent owns authoring UX, integration, the showcase and evidence. Their outputs are engineering reviews and browser observations, not celebrity or external council ratings.

### Verified additions

- A rough key drawn with actual pointer input in the public editor was given an attachment-and-movement ability. Selecting the key and its target moved the existing character to the visually chosen destination. Save/reload retained the drawn object, action receipt and attachment. This was an explicitly manual editor verification scene, not a model-generation claim. Evidence: `output/playwright/editor-drawn-key-arrival.png`, `editor-drawn-key-reopened.png`.
- The real Meta-generated rover resource graph played through its three dependent transfers and saved/reopened. One crystal selection required an explicit recognition correction. Raw response and correction are preserved separately; this is not an untouched automatic result.
- Multiple valid actions for a held object now require an explicit player choice. Resource completion conditions allow alternative valid sequences. Spending that would make required goals impossible is rejected without losing supplies.
- New unmet goals reopen an already completed world for play while retaining its prior achievement. Completion waits for actual object travel to settle. An amended destination can be selected after new requirements are met.
- Ability drafts survive object selection and closing; unfinished abilities cannot silently disappear when applying. Deleting an unfinished new object clears its stale ability draft. Duplicate ability controls caused by sibling component keys were corrected.

### Current integration evidence

- **Original Meta rover:** `rover-live-model.json` contains three prescribed transfers. The original graph, one explicit crystal-box correction, local Meta SAM 2.1 extraction and separate LaMa background reconstruction remain individually recorded. The corrected world was played and reopened.
- **Player invention:** `rover-invention-world.json` and `rover-invention-saved.json` record an antenna drawn through the public editor, a creator-assigned attach-and-move ability, a visually selected destination and actual earned completion. The original transfers survive the addition. This is creator authoring, not automatic inference of an antenna's physical properties.
- **Authored choices:** `rover-choice-saved.json` preserves a different valid allocation: crystal 1 powers the rover, crystals 3 and 2 power the beacon, and the drawn antenna moves the rover only after both receivers are full. Six authored transfer alternatives share the generic rules; the original Meta response did not contain all six. Three available units equal total required capacity, so this demonstrates order/allocation choice rather than deep scarcity strategy.
- **State and continued invention:** completed worlds can acquire new unmet requirements without losing existing achievement. Sequential movement actions require an explicit prerequisite order; the latest earned receipt determines the restored position. Runtime blocks conflicting actions while a move is visibly underway. This is bounded object movement, not collision-aware vehicle navigation.
- **Source fidelity:** the corrected source-selection API preserves identity and graph. Optional configured LaMa repairs the authorized moving-object silhouette plus a bounded halo; all pixels outside that region remain unchanged. The original image is retained. Local weights are external, never downloaded during a request; fallback method and limitations are disclosed. See `SOURCE-BACKGROUND-REPAIR.md`.
- **Different rough input:** one actual Meta response interpreted an AI-generated rough notebook cat/fish drawing. Its first admission failed, then the same saved response was recompiled after a compatibility repair. An explicit fish selection correction was re-extracted locally. Public pickup, feeding, save/reload and reopen passed; `cat-care-browser-proof.json` records this. It has one care interaction and a static cat, not a multi-stage pet simulation. The rejected kitchen result remains in the evidence set.
- **Homepage:** the new page leads with the rover and offers rough cat care and an illustration adventure, a clear upload/draw entry and an original-source toggle. Packaged examples are real local playable worlds. Direct homepage drawing substitutes the art of a prepared rescue part, retaining its declared ability; it does not infer arbitrary new mechanics. The public homepage substitution preserved earned 1/3 progress; completing the remaining transfers, fitting that drawn part and waiting for actual rover travel reached World complete. Evidence: `output/playwright/home-own-invention-complete.png`. Raw continuous recordings are retained as `home-invention-continuous.webm` and `home-invention-continuous-1.webm`; their idle/debugging segments make them verification recordings, not the final film.

### Remaining acceptance work

1. Extend the existing scoped proof to broader complete sessions. The revised illustration-adventure route now completes with real keyboard input on original source surfaces; introduced platforms were removed and two source selections corrected. Homepage completion leaves the art unobstructed, source comparison retains progress, and direct tool switching passed. Direct-home drawing, studio invention, authored alternative allocation and save/reopen also have scoped proof.
2. Complete sound/listening, reduced-motion and remaining full desktop flow checks. Existing screenshot inspections do not certify every screen or subjective appeal.
3. Run the declared mixed rough-drawing/photo corpus and unfamiliar holdouts; report failures and corrections. The inspected rover, café and cat examples do not establish arbitrary-photo reliability.
4. Measure generation and runtime performance on declared hardware rather than infer responsiveness from implementation.
5. Create and review the final 178-second film, retaining continuous source footage and labeling authored examples, corrected regions and shortened waits accurately. No finished replacement film is currently accepted.
6. Verify deployment and public judge access, external dependencies/model assets, source rights and submission links. Prepare and confirm the final submission separately.

No blanket score is awarded. A working mechanic, an accepted visual scene, a complete episode and a finished film are separate observable gates.

### Focused integration checks

- TypeScript check passed. The focused integrated run passed **42/42** existing tests, covering world validation (including bounded authored jump strength), interaction/resource invariants, revisions, source compilation/review, artwork validation, legacy persistence and discovery. Two obsolete recognition expectations were updated to include the normalized empty `requiredResourceIds` list; behavior was unchanged. Log: `outputs/verification/object-gameplay/final-integration-tests.txt`.
- The credential scan passed for tracked files, staged blobs and the existing browser build; credential filename ignore rules passed. An additional configured-credential scan passed for all 17 currently untracked release files. No credential values were printed. The final current production build and staged release files were also scanned successfully.
- Rover, cat-care and Clockwork packaged worlds validated against the current schema, and all referenced local artwork files existed. Actual saved rover invention and alternative-allocation states still reconcile to completed goals.
- `git diff --check` passed, and the task CSV uses LF line endings. The current production build passed. Clean deployed access and the final film remain independent gates.
