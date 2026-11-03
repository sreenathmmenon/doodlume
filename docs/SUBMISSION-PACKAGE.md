# Doodlume submission package

Prepared 3 November 2026. This is submission copy and a recording plan, not a completed film or a claim that the project has been submitted. The current application is local; repository visibility is still private.

## Positioning and submission selections

**One line:** Turn your own drawing or photograph into a game, then keep shaping what happens inside it.

**Description:** Doodlume lets a creator turn a drawing, illustration or photograph into a playable world while keeping their own artwork recognizable. Meta Muse Spark Open interprets the image and the creator's idea; a validated game engine turns those interpretations into an adventure, an exploration or an image-based discovery game. Creators review the result, play it, and change objects or finishing rules in the same world. Original artwork, meaningful control and continued authorship are the product—not a one-off generated animation.

**Problem:** People can imagine a game long before they can program one. Existing drawing and game-making workflows separate the thing they created from the systems needed to play it. Doodlume makes an existing image the starting point for interactive authorship. It is intended for people who draw, invent stories or want to play with a familiar photograph; audience adoption and retention have not been measured.

**Recommended problem statement:** Build for Your World. **Track:** retain the entrant's actual registered track; the supplied registration screenshot selected Indie Dev. Confirm the final form rather than implying a track change.

## Paste-ready: Describe your use of Meta products

Doodlume uses Meta Muse Spark Open, served through Fireworks AI as `accounts/fireworks/models/muse-spark-open`, to interpret an uploaded image and a creator's play idea. The model identifies source objects and their positions and proposes structured gameplay within our supported 2D mechanics. We validate those outputs before they become a playable world, preserving the distinction between visible source artwork and introduced game elements. For supported source-aligned adventures, Meta SAM 2.1 tiny runs locally to mask moving subjects using their original pixels. The editor then lets the creator alter objects and finishing requirements while retaining world identity and surviving play progress. The demonstrated runtime uses Muse Spark Open and local SAM 2.1; it does not use SAM 3.1, Muse Image, Muse Voice or a generative 3D world model.

## Paste-ready: Why Meta's models matter

The central challenge is connecting a person's imperfect, unfamiliar image to something they can actually play and keep authoring. Muse Spark Open supplies the semantic interpretation: which visible marks or photographed details can act as characters, objects, destinations and clues, and how the requested idea relates to them. SAM 2.1 supplies source-pixel masks where a subject must move independently of its original page. Together, these models let the creator's artwork stay recognizable while becoming interactive. Our deterministic validation, source-coordinate processing and game runtime turn model suggestions into bounded, inspectable behavior; the creator can correct the result instead of accepting an opaque generated scene. This is demonstrated on inspected drawings, illustrations and photographs, not a claim that every image produces a finished game automatically.

## Paste-ready: Feedback on partner technologies

Fireworks AI enabled our working hosted Meta Muse Spark Open path. Its chat-completions interface accepted the image-and-intent requests, and we exercised the real provider during creation and repair trials. We used an explicit JSON contract and local validation because our Fireworks adapter does not request strict provider-enforced JSON Schema. Some source-to-play results required correction: a recorded repeat of a detailed illustration needed route review rather than reaching play automatically. Clearer structured-output guarantees and more predictable source-coordinate grounding would reduce that repair work. We also implemented a Baseten adapter, but the recorded access attempt returned HTTP 403, so we cannot report a successful Baseten deployment or compare its performance. A private Modal SAM experiment did not produce a usable inference result and was stopped; Modal is not in the demonstrated runtime. We ultimately ran SAM 2.1 locally. These are observations from our integration, not a general ranking of the partners.

## What actually ran

| Component | Actual role and evidence | Submission wording |
|---|---|---|
| Meta Muse Spark Open on Fireworks | Current safe status inspection at 02:46 UTC on 3 November reports Fireworks and `accounts/fireworks/models/muse-spark-open`. Earlier real request/play records are in [live validation](LIVE-VALIDATION.md) and [desktop repair verification](QUALITY-REPAIR-VERIFICATION.md). | Used. Configuration alone is not a successful call; retain the final filmed run's outcome separately. |
| Meta SAM 2.1 tiny, local | Selected and configured in current status. `scripts/local-sam-worker.py` loads `configs/sam2.1/sam2.1_hiera_t.yaml`; documented repaired adventures used actual local masks. | Used locally for supported cutouts. Not SAM 3.1 and not a Meta Model API segmentation call. |
| Meta SAM 3.1 API | Remote adapter exists; no successful live SAM 3.1 result established in current evidence. | Implemented option, not demonstrated usage. |
| Baseten | Meta-family adapter exists. Historical live attempt: HTTP 403. | Integration attempted; not the running provider. |
| Modal | Historical private segmentation experiment stopped without usable inference output. | Experiment only; not hosting the submitted application. |
| Muse Wonder / Muse Image / Glimmer / Voice | Direct adapter has a Muse Wonder default, but it is not selected. No demonstrated use of these other models established here. | Do not list as used or claim the creative-model bonus from them. |
| Game runtime and editor | Source processing, validation, movement, rule enforcement, edits, undo and local saves are application code. | Do not attribute deterministic game physics or arbitrary game-code generation to the model. |

Safe, local configuration evidence: `outputs/submission/model-status-safe.json`. No API-key values were printed, copied into documentation or added to this package. The credential scan compares configured secrets internally without disclosing them. Provider contract: [server/provider.ts](../server/provider.ts). Image interpretation: [server/interpret.ts](../server/interpret.ts). Local masking: [scripts/local-sam-worker.py](../scripts/local-sam-worker.py). Edit/progress contract: [shared/revisions.ts](../shared/revisions.ts).

The six recorded pipeline-acceptance outcomes in `outputs/pipeline-repair/verification-results.json` took 21.8–55.8 seconds under their recorded conditions; their `playCompleted` fields are false because that ledger records generation, not subsequent play. Later browser play evidence is separate. A repeat detailed-illustration attempt in `final-live-results.json` required review. Do not combine these records into an invented universal success rate, instant-generation claim or latency SLA.

## Showcase image provenance

The homepage uses recorded generated worlds, not a live model request on every example launch. Its world IDs match the retained pipeline records: `clockwork` → `verified-clockwork-final-live-recompiled-world.json`, `dino` → `verified-crayon-platform-recompiled-world.json`, and `kitchen` → `verified-kitchen-roam-world.json` under `outputs/pipeline-repair/`.

- **Clockwork and dinosaur:** user-supplied images from `Downloads/Inkling-sample-drawings`, mapped by `recompile.mts` to `06-adult-20-years-ink-watercolor-platformer.png` and `03-kindergarten-5-years-crayon-platformer.png`. Those filenames do not establish the creator's age, authorship, physical drawing process or publication rights. No age or child-authorship claim should accompany the demo.
- **Kitchen:** an AI-generated test image, not a verified photograph of a real room. `verify-variety.mts` maps this world to `generated-kitchen`; the existing private corpus manifest records it as “AI generated for varied-input testing.” The homepage calls it a room image, and its alternative text identifies the generated scene.

These records establish the local source chain and reported origin only. They do not establish a license or rights clearance for the supplied drawings, or identify the kitchen image's generator and applicable publication terms. Resolve those external-asset declarations before public submission. Do not package private corpus manifests or personal filesystem paths as public evidence.

## Event-period contribution statement

**Draft grounded in repository history:** Doodlume's recorded implementation history begins with commit `4aa12f5` on 30 October 2026. Subsequent event-period commits add same-world editing and progress-preserving undo (`9661272`), revised-page comparison (`d40a09a`), capture/alignment (`2cd02b6`), segmentation integration (`1a4bf86`), picture-based worlds (`eb763db`), the live Meta drawing path (`c2ba8c8`), image-native discovery/exploration (`4dd8469`) and source-artwork/desktop repairs (`2c0d3b9`). The 3 November working changes add the new homepage and demo entry, applied-edit save/discard/stay protection, explicit editor reset/undo behavior, library layout fixes and clearer discovery completion. These product changes are recorded in commit `5fbd5b8` (3 November 2026). Earlier concept research and planning preceded this implementation history.

**Unresolved author declaration:** commit timestamps establish when work was committed, not when every line was first written. This repository audit does not establish that there was no pre-event code. Before submission, the entrant must accurately identify any pre-existing implementation and external assets. Do not substitute “built entirely from scratch during the event” for this qualified statement without evidence. Preserve the existing history rather than rewriting dates. The authenticated guide gives a 27 October–4 November build period and requires the demo to identify event-created features.

## Exact 178-second film plan

This is an edit decision list. The intervals total **2:58 (178 seconds)**. Record genuine interactions first; choose the clearest verified source, then edit to these boundaries. The narration below leaves space for visible actions and pauses. A shorter clip or a homepage animation is not the finished film.

| Time | Picture and action | Narration / readable caption |
|---|---|---|
| **0:00–0:10** · 10s | Original drawing fills the frame; match-cut to its recognizable subject moving under real control. Reach a visible object. Tiny caption identifies a recorded Doodlume result. | “This was a drawing. Now its character moves, its objects matter, and its creator decides what happens next.” |
| **0:10–0:25** · 15s | Brief homepage proposition, then choose the creator's own image. Keep the creation action visible; no long brand introduction. | “Doodlume turns your own drawings and photographs into games you can keep shaping. You can begin with an idea and an image, without first programming a game.” |
| **0:25–1:05** · 40s | One real upload or drawing → concise intent → actual model request → review original image/object correspondence → accept → movement and objective. Shorten generation only with a visible time-cut caption showing that run's measured duration. | “Here is the source and the idea. Meta Muse Spark Open interprets the image. I review the objects and the goal, then play. The art is still mine, and the rules are visible.” |
| **1:05–1:35** · 30s | One meaningful edit: add a crossing in original ink, or reposition a reachable ledge; apply; immediately take the changed route. Show previously earned collection still present. Use the option actually verified in the recorded world. | “The first result is only the beginning. I can create a new route, apply it, and use it in the same world. My earlier discoveries remain while I change what is possible.” |
| **1:35–1:55** · 20s | Two other real recorded worlds: photo discovery with an actual clue interaction, then photo exploration or crayon adventure. Each includes input and consequence, not a static gallery. Label them recorded examples. | “Different images invite different kinds of play: an adventure through a drawing, a search through a photograph, or a place to explore. These examples use the same engine.” |
| **1:55–2:20** · 25s | Clear source→interpretation→mask→play visual using actual captured data. Show Muse Spark Open / Fireworks and local Meta SAM 2.1 accurately. Spend 3–4 seconds on readable source code/contract for the event-built interpretation or revision step. | “Muse Spark Open connects visible details to game objects and goals. Local Meta SAM 2.1 separates moving subjects from their source. Our validation and game engine turn that interpretation into controlled, editable play.” |
| **2:20–2:43** · 23s | Apply a meaningful edit, open another world, choose Save and open, then reopen the original and show the saved change. Include a short Undo beat only if readable; prioritize the complete save/reopen proof. | “A world stays something you own and revise. Save it, leave it, and return to the change you made. Unsaved edits are explicit; switching worlds asks you to save, discard, or stay.” |
| **2:43–2:58** · 15s | Finish on memorable real gameplay, original image beside it, then a clean product name and working public destination once available. Small end caption lists event-built feature scope. | “Your image is not just an inspiration for a game. It becomes the place where you play—and keep creating. Doodlume. Your imagination, now playable.” |

**Capture rules:** 1920×1080 target if the actual screen capture supports it; legible UI beats artificial upscaling. Keep speech/captions readable and source art central. Play footage stays real-time. Mark accelerated generation or discontinuous edits; never replace a failed request with an unrelated stored result while implying continuity. Use only accurate model identities from the filmed path. Do not include keys, private support pages, participant chats or diagnostic clutter. Verify the exported file's duration, every caption, audio, opening/closing frames and link access before calling it finished.

## Submission gates still open

- **Public repository:** `gh repo view` confirmed `PRIVATE` on 3 November. The guide requires public access. Preparing documentation does not change visibility; owner authorization and a final secret/asset review precede publication.
- **Public product access:** only loopback operation is verified. The server intentionally restricts host/origin to local addresses; a public interactive deployment needs an explicit hosting/configuration change and its own verification. A static homepage alone does not make new-image generation publicly usable.
- **Final film:** this document is a script, not an exported 178-second video. Capture, edit, duration/audio checks, hosting and signed-out playback remain to be completed.
- **Contribution and asset attribution:** identify pre-existing work and rights-cleared public demo assets; the current product implementation commit is `5fbd5b8`. Initial concept planning predates the repository's recorded implementation.
- **Final current-build evidence:** attach the freshly recorded request, meaningful edit→play result, and save/reopen proof to the chosen final demo. Broader arbitrary-image reliability is not established.
- **Form completion:** confirm track/problem statement, list all actual human contributors, public repository, public video and any required live URL. Submit only after the owner requests the final submission; retain a receipt.

The authenticated [participant guide](https://cerebralvalley.ai/e/meta-ai-developer-hackathon/details) states **4 November, 9 PM EST** as the deadline: **5 November, 7:30 AM IST**. Its rubric is impact 30%, Meta tooling 25%, technical execution 20%, demo 25%. Judging runs 5–8 November and live finals are 9 November at noon ET. See [research ledger](SUBMISSION-RESEARCH-2026-11-02.md) for source distinctions and the public-page date discrepancy. No later judging period is treated as extra build time.
