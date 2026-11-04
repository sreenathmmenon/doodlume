# Doodlume: the game starts with your picture

**Your imagination, now playable.**

*By Sreenath Menon*

There is a cat on a rooftop, a ladder between buildings and a fish waiting at the other end. It is the sort of picture that already suggests a little adventure. You can almost see the cat making the jump. The story is already in the picture; making it respond to a player is the next step.

Doodlume starts there. Bring a drawing or photograph, describe what you want to play, and turn it into a world you can enter. Then keep creating inside it.

[Try Doodlume](https://doodlume-production-9df2.up.railway.app/)

## Give the creator somewhere to take the next idea

I wanted the creator's imagination to stay involved after the first game appears. You might play a scene and decide it needs a new tool. You might want a different goal, a new interaction between two objects, or another way to move through the picture.

In Doodlume, those ideas have somewhere to go. You can draw a new part, give it an ability, choose what it works with and try it in the same world. You can edit objects and finishing rules, undo a change, save the result and come back to it.

The moment I care about is the one after someone plays their first world and thinks, “I know what I want to add.” Doodlume gives that thought a practical next step: open the editor, make the change and play again.

The picture matters throughout that process. Its characters, marks and objects give the world a recognizable identity. A creator can see what came from the source and what they have added. That makes the relationship between the picture, the game and their decisions easier to follow.

## A spring makes the idea visible

In the rooftop world, you can watch an idea become a usable game mechanic.

First, the cat has its normal jump. In the studio, a new spring is drawn and given an ability: attach it to the cat to increase jump height. Back in play, the cat picks up the spring, fits it and jumps higher. The player can see the effect of the part they just created.

[![Actual Doodlume gameplay showing the normal jump, spring attachment, higher jump and finish](docs/media/doodlume-spring-gameplay.gif)](https://doodlume-production-9df2.up.railway.app/#studio?example=rooftop-springs)

*This is a continuous excerpt from real product gameplay at normal speed. The rooftop source is an AI-generated rough drawing; the spring and its ability were authored in the studio.*

A spring is one example of giving an object a purpose. An ability can change movement; a tool can participate in an interaction; an action can depend on a resource or another completed action. The creator can also decide which discoveries or actions are needed to finish. These supported rules give objects a role in the game.

For someone making a game, that turns playing into part of the design process. Try an idea, see its effect and decide what to change next.

## Photographs bring another kind of possibility

A photograph already contains places, objects and relationships. Those details can become material for an interactive experience.

In the [patio example](https://doodlume-production-9df2.up.railway.app/#studio?example=patio-care), a real photograph contains a watering can and a succulent pot. Doodlume turns those pictured objects into a goal-driven interaction. Select the can, use it on the pot and watch the game's water quantity transfer as the goal completes.

The visible consequence is a change in the water count and completion of the goal. The original photograph stays in view. This example uses game quantities rather than simulated liquid or plant growth.

Doodlume supports three ways to approach an image. Adventure gives a character a route and a destination. Exploration lets a player move through the scene and interact with its objects. Discovery turns details in the image into clues and things to find. The picture and the creator's request help determine a suitable form of play.

The [lunar rescue](https://doodlume-production-9df2.up.railway.app/#studio?example=rover) shows another side of the engine. Allocate crystals to power the beacon and rover, then fit the antenna to move the rover and complete the rescue. This is an authored example, included to show how several object actions can connect into a mission.

## How a picture becomes a game

There are two things the system needs to understand: what is visible in the image and what the creator wants to do with it.

**Meta Muse Spark Open**, served through **Fireworks AI**, handles that interpretation. The image and creator intent go into a request. The response describes objects, their relationships, proposed actions and goals in a structured form.

Doodlume checks that plan before it reaches the player. It checks whether objects have usable positions and artwork, whether interactions have meaningful supported effects, and whether the required actions can fit together. The creator can inspect what was understood and correct selections that need attention. A misread object needs a useful correction path.

Moving original artwork introduces another problem. A cat drawn on a page is part of a single image. To let it move independently, the system needs a usable outline of that subject.

**Meta SAM 2.1 tiny** runs on the application server to find supported subject outlines. Doodlume uses those masks to separate source artwork into cutouts. The color and texture come from the original picture, while transparency allows the subject to move independently. The moving cat can still carry the pencil marks of the source drawing.

When a subject moves away, its old position needs attention too. **LaMa**, a separate non-Meta model, reconstructs exposed background where learned repair is needed. Doodlume checks source artwork and distinguishes masks from simpler crops. Unclear or obscured subjects can still need creator correction.

The playable result runs in **Phaser**. Doodlume's application code handles movement, interactions, resources and finishing conditions. **React and TypeScript** provide the studio and shared world contracts. The primary application is hosted on **Railway**; **Modal** was also used for a verified application deployment and is documented as backup hosting.

```mermaid
flowchart LR
    A[Your image + game idea] --> B[Meta Muse Spark Open]
    B --> C[Objects, actions and goals]
    C --> D[Validation + creator review]
    C --> E[Meta SAM 2.1 tiny]
    A --> E
    E --> F[Source cutouts + LaMa repair where needed]
    D --> G[Playable world in Phaser]
    F --> G
    G --> H[Draw, edit and play again]
    H --> D
```

Fireworks supplies the active model API path. SAM and LaMa run within the hosted application environment. The repository also contains Baseten and direct Meta API adapters; their available integrations and recorded usage are described separately in the [README](README.md#models-api-providers-and-deployment-partners).

## Make room for another attempt

A creator needs room to experiment. Changing an object should not mean losing the entire world. Trying an ability should be reversible. A saved game should reopen with the changes the creator made.

Doodlume keeps world identity through revisions and preserves progress tied to objects and achievements that remain in the revised world. It supports undo, browser-local saves and portable exports containing artwork, rules and progress.

These details matter at the point where an idea changes. You move an object, test a jump or add a finishing requirement, and the result may need another adjustment. Being able to undo and return to a known state makes that kind of experimentation easier.

For an indie creator, the starting material can be something personal: a rough drawing, a scene they made, or a photograph they want to explore. Doodlume gives them a way to work on its behavior through objects and rules. Recognizable artwork and meaningful control are central to the experience I want to build.

## What I want to improve next

The next challenge is stronger automatic game design from unfamiliar pictures. Recognizing an object is one step. Finding an interesting role for it, connecting it to other objects and producing a satisfying objective is a deeper design problem.

The direction is richer relationships between source objects, more expressive creator-authored abilities and more varied missions with clear feedback. Some images still need correction, and inference can take time. Those are areas to improve as the creation system develops.

The current product already connects image interpretation, source artwork, editable rules and real play in a world the creator can save and continue. I want each extension to give that creator another useful way to express an idea.

I want Doodlume to make it easier to follow the thought that arrives while looking at a picture: this could be a game, and I know what I want to happen next.

**Doodlume. Your imagination, now playable.**

[Create a world](https://doodlume-production-9df2.up.railway.app/#studio) · [Read the technical overview](README.md) · [Inspect the evidence](docs/REVIEW-EVIDENCE.md)

---

The playable examples are saved worlds, so opening one does not trigger a new inference request. The patio source photograph is by [Shixart1985, CC BY 2.0](https://commons.wikimedia.org/wiki/File:Person_waters_succulents_on_a_table_in_an_outdoor_setting.jpg). The rooftop drawing and lunar illustration are AI-generated assets. Full source and example details are in the [showcase credits](public/art/showcase/README.md).
