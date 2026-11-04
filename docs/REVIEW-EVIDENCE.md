# Doodlume: claims and evidence

**Your imagination, now playable.** Turn your drawings and photographs into playable worlds. Then invent what happens next.

[Live product](https://doodlume-production-9df2.up.railway.app/) · [Structured project facts](PROJECT-FACTS.json) · [Weighted rubric](JUDGING-GUIDE.md)

## The core contribution

Doodlume connects image-based game creation with continued authorship. The creator supplies a picture and an idea, reviews its interpretation, plays the resulting world, and can draw new parts or change abilities and goals inside it. The source remains recognizable as the world changes.

The strongest demonstration is a complete creative loop: a rooftop drawing becomes playable; a new spring is drawn and assigned to the cat; fitting it increases jump height; the creator plays through and saves the world. The spring proves one composable capability, rather than defining the entire product.

## Why this is an indie creation product

Doodlume puts the creator's own material at the center: an imperfect drawing, a pictured object or an imagined mission. The value is the ability to turn that material into actions and goals, then keep changing the result through a visual workflow. A creator can test an idea by playing it, draw a new part to change the experience, and return to a saved world.

The intended users are people with visual ideas who want to make games without first writing an engine. Artists can bring a scene into play; storytellers can connect objects and missions; a person with a photograph can explore pictured details through an interactive challenge. These are intended uses of the supported systems, not claims of measured adoption across those audiences.

The immediate demonstration should show the creator gaining agency: from supplying an image, to reviewing a game, to inventing a new action with a visible consequence. That is the product's clearest creative and technical argument.

## Checkable claims

| Claim | Visible evidence | Implementation |
| --- | --- | --- |
| A creator can make an image into a playable world. | Fresh upload, inference, review and opening were recorded for a rough drawing and a real photograph. Packaged examples let reviewers inspect the results without waiting for inference. | [Interpretation](../server/interpret.ts), [provider requests](../server/provider.ts), [world contract](../shared/world.ts). |
| A newly drawn part can change gameplay. | The [continuous gameplay excerpt](media/doodlume-spring-gameplay.gif) shows a normal jump, spring pickup, attachment, a higher jump and completion. The [spring world](../public/art/showcase/rooftop-springs.json) stores an authored ability. | [Editor](../src/components/), [interaction rules](../shared/interactions.ts), [game runtime](../src/game/). |
| The source picture remains part of the experience. | Original-image inspection, recognizable source subjects and the tracked [source and example catalogue](../public/art/showcase/catalog.json). | [Source extraction](../server/segmentation.ts), [local SAM](../server/local-segmentation.ts), [background repair](../server/source-background.ts). |
| Meta is part of the creation mechanism. | Muse Spark Open interprets image and intent; SAM 2.1 tiny supplies supported subject masks. These functions feed the playable system. | [Model selection and request shape](../server/provider.ts), [interpretation](../server/interpret.ts), [SAM worker](../scripts/local-sam-worker.py). |
| The system supports connected object challenges. | In [Lunar rescue](https://doodlume-production-9df2.up.railway.app/#studio?example=rover), crystals power the beacon and rover before the antenna completes the mission. This example is authored. | [Interaction contract](../shared/interactions.ts), [rescue world](../public/art/showcase/rover.json). |
| Photographs support pictured-object interaction. | In [A little care](https://doodlume-production-9df2.up.railway.app/#studio?example=patio-care), the can transfers a game water quantity to the pot. The original photograph and goal stay inspectable. | [Photo example world](../public/art/showcase/patio-care.json), [source-aware planning](../server/interpret.ts). |
| Creation continues after the first playthrough. | Editing, ability preview, undo, save, reload and reopen have recorded verification. Progress is retained for surviving objects and achievements. | [Revisions](../shared/revisions.ts), [library persistence](../src/lib/library.ts), [verification](QUALITY-REPAIR-VERIFICATION.md). |

## Impact and originality

The intended benefit is creative access: someone with a picture and a game idea can begin authoring through images and an editor. The distinctive combination is recognizable source artwork, playable actions and continued changes to the same world. The spring and photo examples show that connection through observable behavior. They do not establish adoption or long-term retention.

The available systems include adventure, exploration, discovery, abilities, resources, prerequisites and completion requirements. Their supported combinations provide variation without assigning a special hardcoded implementation to an example filename. The model supplies a structured plan; the shared runtime interprets the validated rules.

## Where execution can be inspected

The model boundary, world contract and revision logic are useful entry points for code review. Model responses are data, not executable code. Source geometry, interaction feasibility and finishing requirements are checked before acceptance. Provider recovery stays within explicit budgets and does not silently change the model or billing account.

[Live validation](LIVE-VALIDATION.md) separates creation outcomes from subsequent completed playthroughs. [Deployment records](LIVE-DEPLOYMENT.md) describe the hosted app and its checks. [Artwork provenance](../public/art/showcase/README.md) distinguishes real photographs, AI-generated source art, model-generated gameplay and authored examples.

## Evidence still being finalized

The replacement three-minute film is not yet published. The tracked GIF and live examples are available now; fresh-generation, editor and persistence recordings are retained for the final edit. Model configuration is evidence of selection, while a successful request and playthrough are separate evidence of execution. The public repository release remains under the owner's control.

There are no self-awarded judging scores in this evidence package. The rubric weights describe what the organizer evaluates; the linked artifacts let a reviewer assess the actual work.

## What comes next

The next product goals are stronger automatic game design from unfamiliar inputs, richer relationships between source objects, more expressive abilities and more varied missions. The current evidence establishes the working creation/edit/play foundation and its inspected examples. It does not present the roadmap as already implemented.
