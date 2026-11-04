# Doodlume submission package

Updated 5 November 2026, IST. [Open the live product](https://doodlume-production-9df2.up.railway.app/) · [Watch the published demo](https://youtu.be/cUQJPewqZbI) · [Public repository](https://github.com/sreenathmmenon/doodlume). The owner has made the repository public. Form submission is not confirmed by this document.

[Live product](https://doodlume-production-9df2.up.railway.app/) · [Reviewer guide and weighted rubric](JUDGING-GUIDE.md) · [Release checklist](SUBMISSION-CHECKLIST.md)

## Project positioning

**Name:** Doodlume

**Tagline:** Your imagination, now playable.

**Short description:** Turn your drawings and photographs into playable worlds. Then invent what happens next.

**Description:** Doodlume connects visual imagination to game creation. Start with a drawing, illustration or photograph and an idea. Meta Muse Spark Open interprets pictured details and proposes objects, actions and goals. Doodlume turns the reviewed plan into a playable adventure, exploration or discovery experience while preserving recognizable artwork. Creation continues inside the same world: draw a new part, give an object an ability, change the finishing rules, play the result and save it for later. The spring demonstration shows that loop directly: a part drawn in the studio becomes a usable ability that increases the character's jump.

**Problem:** People can imagine games before they can program them. Doodlume lets them begin with their existing pictures and creative ideas, then use drawing and an editor to develop playable interactions. Its current impact evidence is the working creation and authoring journey; audience adoption and retention have not been measured.

**Problem statement:** Build for Your World.

**Track:** The supplied registration screenshot selected Indie Dev. Retain the actual registered track and confirm it on the final form.

## Describe your use of Meta products

Doodlume uses Meta Muse Spark Open through Fireworks AI to interpret an image and the creator's intended experience. The model identifies pictured objects and relationships and proposes structured game rules within our supported 2D mechanics. Doodlume validates the plan, source geometry, artwork and completion requirements before it becomes playable. Meta SAM 2.1 tiny runs on the application server to isolate supported source subjects using their original pixels. The creator can then draw additional parts, author abilities, edit goals, play the changes and retain the same world across saves and revisions. The demonstrated Meta models are Muse Spark Open and SAM 2.1 tiny. LaMa supplies separate, non-Meta background repair.

## Why Meta's models are important

Muse connects visible marks and photographic details to playable meaning: a character, destination, clue, tool or interaction. SAM separates source subjects so their original artwork can move independently. Together, these models preserve the connection between the creator's picture and the world they play. The application adds rule validation, game execution and continued authoring. The result remains inspectable and editable: the creator can review the interpretation, correct selections and decide what happens next.

## Feedback from partner technologies

Fireworks AI supplies the live Muse Spark Open inference path. We send image-and-intent requests through its chat-completions interface, use JSON output and validate the returned game contract locally. Recorded creation runs produced playable worlds, while other inputs required review or encountered provider delays. The application bounds request time and recovery rather than treating every model response as a completed game. More predictable latency and stronger source-coordinate grounding would improve the creation experience.

Railway hosts the current application, API server and CPU model workers. Modal also hosted the complete containerized application during deployment verification and remains the documented backup deployment. This is separate from an earlier unsuccessful Modal segmentation experiment. Baseten has an implemented Muse Spark Open adapter; the recorded access attempt returned HTTP 403, so it is not described as successful inference.

## Actual model and service roles

| Component | Demonstrated role |
| --- | --- |
| Meta Muse Spark Open | Image understanding and structured gameplay planning, served through Fireworks AI. |
| Meta SAM 2.1 tiny | Server-local source-object masks and cutouts. |
| LaMa | Separate non-Meta server-local background repair, recorded in the source-art diagnostics. |
| Fireworks AI | Active inference API provider for the filmed creation runs. |
| Railway | Primary live application hosting. |
| Modal | Verified application deployment and documented backup hosting, not the inference API provider for the Railway recordings. |
| Baseten | Implemented API adapter; recorded access attempt unsuccessful. |
| Direct Muse Wonder/Muse Spark and SAM 3.1 | Implemented alternative paths, not additional usage claimed for the filmed run. |
| React, TypeScript and Phaser | Interface, shared world contracts and game runtime. |

See [provider code](../server/provider.ts), [interpretation](../server/interpret.ts), [segmentation](../server/segmentation.ts), [background repair](../server/source-background.ts), and [deployment evidence](LIVE-DEPLOYMENT.md).

## Film and public demonstration

The [published demo](https://youtu.be/cUQJPewqZbI) covers image-to-world creation, continued invention, a continuous spring before/after, real-photo interaction, a connected rescue mission, save/reopen and an animated model explanation. The supplied local revised export runs 2:16.8. Optional refinements concern model narration timing and pronunciation, precise photo-interaction wording and minor pacing. The live product is https://doodlume-production-9df2.up.railway.app/.

Product scenes use real browser recordings. The model explanation is motion graphics with a live gameplay excerpt. The fresh rooftop generation took 109.375 seconds and the fresh patio-photo generation took 50.790 seconds in the recorded runs; shortened waiting must be labelled. These are individual observations, not advertised latency guarantees.

The earlier dinosaur-based 178-second export was rejected by the owner. Its historical export checks do not approve the replacement film. Do not submit it or link it as the current demo.

## Public example provenance

The current examples are documented in the [showcase catalogue and credits](../public/art/showcase/README.md):

- **Rooftop run and Rooftop springs:** AI-generated rough drawing; Meta-generated game, with the spring and its ability authored through the studio.
- **A little care:** real photograph by Shixart1985, CC BY 2.0; Meta-generated game. Its interaction transfers a game water quantity, without physical pouring or growth simulation.
- **Lunar rescue:** AI-generated illustration and authored game using the same runtime.

Packaged examples are labelled and do not perform new inference on launch. Preserve source credits and distinguish authored examples, fresh generation and replay in the film. Older private test-drawing filenames do not establish an artist's age or publication rights.

## Event-period contributions

The recorded repository history begins with implementation commit `4aa12f5` on 30 October 2026. Subsequent commits implement same-world editing, progress-preserving undo, capture/alignment, segmentation, picture-based worlds, the live Meta creation path, discovery/exploration and source-art repairs. Later work adds resource interactions, ability authoring, hosted execution and source-supported planning.

The 4 November homepage and studio changes include `567afc0`, `660bb0b`, `8738d5e` and `b1d07bb`. Follow-up fixes include `bbfdc1d`, `c7537f6` and `b901c10`. These commits remain intact. Deployment and verification records identify the running source separately from later documentation changes.

Commit dates identify recorded commits, not when every line was originally written. The entrant must declare any pre-existing code and external assets accurately. Preserve history and identify event-built features in the film rather than claiming every component was built from scratch without evidence.

## Remaining submission steps

- If replacing the published film, verify the new narration, captions, cuts and source continuity before changing the submission link.
- Verify the published video plays without the owner's login.
- Verify fresh signed-out product access and the required form fields: description, problem statement, track, repository, video, Meta usage, model importance, partner feedback and human contributors.
- Confirm contribution and asset declarations.
- Submit only on the owner's explicit instruction and retain the receipt.

Rubric weights and bonus-model requirements are recorded in the [reviewer guide](JUDGING-GUIDE.md). These documents explain the evidence; they do not assign official scores, claim prize eligibility has been approved, or establish a winning outcome.
