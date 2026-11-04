# Doodlume: reviewer guide

**Your imagination, now playable.** Turn your drawings and photographs into playable worlds. Then invent what happens next.

[Open the product](https://doodlume-production-9df2.up.railway.app/) · [Read the implementation overview](../README.md) · [Submission package](SUBMISSION-PACKAGE.md)

For a claim-by-claim evidence map, see [claims and evidence](REVIEW-EVIDENCE.md). [Structured project facts](PROJECT-FACTS.json) provide the same project identities, models, service roles, capabilities and artifact paths as JSON.

## The problem and the contribution

A person can picture a game before they know how to build one. Doodlume gives that person a way to begin with an image and an idea, turn recognizable artwork into play, and keep authoring the result. Objects, abilities, interactions and goals remain editable after creation.

The selected problem statement is **Build for Your World**. The product connects a familiar creative activity, drawing or photographing, to game creation without requiring the creator to write game code. The demonstrated contribution is a working source-to-play and continued-authoring workflow. Audience adoption, learning outcomes and retention have not been measured.

## How to assess the project

Weights below come from the [participant guide](https://cerebralvalley.ai/e/meta-ai-developer-hackathon/details). The explanations are paraphrased. They are not scores awarded to Doodlume.

| Criterion | Weight | What Doodlume demonstrates | Where to inspect it |
| --- | --- | --- | --- |
| **Impact** | **30%** | An image and an idea become a game the creator can play and keep changing. The creator can add a part, author an ability and return to a saved world. | Creation studio, spring example, editor and save/reopen journey. |
| **Use of Meta AI tooling** | **25%** | Muse Spark Open connects pictured details to objects, actions and goals. SAM 2.1 tiny isolates original subjects for movement. These outputs feed an editable game system. | [Interpretation](../server/interpret.ts), [provider](../server/provider.ts), [segmentation](../server/segmentation.ts), real generation and source-art inspection. |
| **Technical depth and execution** | **20%** | Structured world validation, source-aligned artwork, bounded provider calls, interaction prerequisites, edits, undo, saved progress and portable backups. | [World contract](../shared/world.ts), [revision handling](../shared/revisions.ts), [runtime](../src/game/), [verification records](LIVE-VALIDATION.md). |
| **Demo** | **25%** | A fresh drawing becomes playable; a drawn spring becomes a usable higher-jump ability; a real photograph supports object interaction; a world saves and reopens. | Real product recordings, continuous spring before/after, playable examples and the final three-minute film once published. |

The film should let the audience see the causal chain: source image, model interpretation, playable result, creator edit, changed behavior. The model workflow animation explains the architecture; the product interactions are live recordings.

## A short hands-on route

1. Open [Rooftop springs](https://doodlume-production-9df2.up.railway.app/#studio?example=rooftop-springs). Try the normal jump, then take and fit the spring and observe the higher jump.
2. Open [A little care](https://doodlume-production-9df2.up.railway.app/#studio?example=patio-care). Select the pictured can and use it on the pot. This transfers a game water quantity.
3. Open [Lunar rescue](https://doodlume-production-9df2.up.railway.app/#studio?example=rover). Allocate crystals, power the beacon and rover, then fit the antenna. This is an authored example of the interaction engine.
4. Use **Make game** with a new image to exercise actual model generation. Packaged examples do not issue a fresh inference request.
5. Inspect the original, edit a world, save it and reopen it. Saves are browser-local; exports provide portable copies.

## Eligibility and prize fit

The guide describes an initial eligibility review for theme fit and reasonable use of Meta Model API or Meta open-weight models, followed by weighted scoring from 0 to 10. The top five projects in each track advance to the final review using the same rubric. It does not describe a model-count scoring bonus.

Doodlume uses **Muse Spark Open through Fireworks AI**, a partner-served Meta open-weight path. This matches the stated model/serving route for the **Best Build on Meta Open Weight Models** bonus, subject to organizer and infrastructure-partner verification. It is not an award or a confirmed eligibility decision.

The **Best Creative Build** bonus specifically names **Muse Image or Muse Wonder**. The current recorded pipeline does not establish their use. A configured adapter alone is not evidence for that bonus. Local SAM 2.1 is identified accurately; it is not labelled SAM 3.1.

The main rubric should guide the presentation. A stronger demonstration of one meaningful creative capability is more useful than a list of unexecuted integrations.

## Evidence and source status

The authenticated guide was captured on 2 November in the local research record. On 5 November, the public text retrieval returned only a loading shell and the signed-in browser retrieval failed. This document was reconciled against the saved guide, not a newly confirmed revision of the authenticated page. Recheck the participant page for any organizer amendments before submitting.

Product/deployment evidence is described in [live deployment](LIVE-DEPLOYMENT.md), [live validation](LIVE-VALIDATION.md), [source-to-play verification](QUALITY-REPAIR-VERIFICATION.md), and the tracked [showcase provenance](../public/art/showcase/README.md). Historical run durations and test counts describe their recorded conditions, not a general success rate or current scoring result.
