# Doodlume hands-on guide

[Open Doodlume](https://doodlume-production-9df2.up.railway.app/) · [Watch the demo](https://youtu.be/cUQJPewqZbI)

Doodlume turns drawings and photographs into playable worlds, then gives the creator control over what happens next.

## Try three different experiences

1. **Rooftop springs:** pick up and fit a drawn spring to the cat, then use the higher jump to reach the finish. The world was generated from a rough drawing; the spring ability was authored in the studio.
2. **A little care:** use the pictured watering can on the pot. The game transfers a water quantity and completes its goal. The source is a real photograph; this is game logic rather than fluid simulation.
3. **Lunar rescue:** allocate crystals, power the beacon and rover, then fit the antenna. This example has authored rules and demonstrates connected object interactions.

## Create and continue inventing

Supply a drawing or photograph and describe what you want to play. Review the proposed world, correct details where needed and enter play. Draw a new part, give it an ability, preview the result and apply it. Change objects or completion requirements, undo an edit, save and reopen the same world.

## How it works

Meta Muse Spark Open, served through Fireworks AI, interprets the image and intent and proposes structured gameplay. Meta SAM 2.1 tiny separates supported source subjects. LaMa is a separate non-Meta model that repairs exposed background where needed. Doodlume validates the output, then Phaser runs the interactive world.

See [implementation evidence](REVIEW-EVIDENCE.md), [technical facts](PROJECT-FACTS.json) and [example credits](../public/art/showcase/README.md).

## Current scope

Gameplay is 2D. Unclear subjects may need correction, and model response times vary. Saved worlds are browser-local with portable backups. Ready-to-play examples do not run fresh inference when opened.
