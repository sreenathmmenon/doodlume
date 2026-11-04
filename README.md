<div align="center">

# Doodlume

### Your imagination, now playable.

**Turn your drawings and photographs into playable worlds. Then invent what happens next.**

[Watch the demo](https://youtu.be/cUQJPewqZbI) · [Read the story](BLOG.md) · [Open Doodlume](https://doodlume-production-9df2.up.railway.app/) · [Create a world](https://doodlume-production-9df2.up.railway.app/#studio) · [Try the spring game](https://doodlume-production-9df2.up.railway.app/#studio?example=rooftop-springs)

</div>

**Explore the product:** [Working examples and implementation](docs/REVIEW-EVIDENCE.md) · [Hands-on guide](docs/JUDGING-GUIDE.md) · [Technical facts (JSON)](docs/PROJECT-FACTS.json)

A cat on a notebook page can become a character you control. A photograph can become a challenge built around the things in it. Draw a spring, give it an ability, and change how high your character can jump.

Doodlume brings image understanding, original artwork and game creation into one experience. Start with a picture and an idea. Review the world it creates, play inside it, then keep shaping its objects, abilities and goals. You can create through drawing, photographs and an editor without writing game code.

[![Real Doodlume gameplay: a normal jump, picking up and fitting a drawn spring, a higher jump, and reaching the finish](docs/media/doodlume-spring-gameplay.gif)](https://doodlume-production-9df2.up.railway.app/#studio?example=rooftop-springs)

*An uninterrupted excerpt from real product gameplay, converted to a looping GIF at normal speed. The rooftop source is an AI-generated rough drawing. The spring was drawn and given an ability in the studio.*

## Why build Doodlume?

An idea for a game often starts as a sketch, a familiar place or a story someone wants to bring to life. Turning that idea into objects, controls and rules is a separate creative task. Doodlume brings those steps together so a person can start with what they can draw or photograph, then shape the game through play.

For an indie creator, the valuable part is control over what happens next. The first generated world is editable. Draw a tool, give it a purpose, connect objects through actions, change a goal and try the result. A small personal picture can become the start of a game that keeps developing.

| Starting point | What the creator can do |
| --- | --- |
| A character and a place drawn on paper | Build an adventure, control the pictured character and add an ability that changes its movement. |
| A photograph with recognizable objects | Create a discovery experience or a supported object-interaction challenge using the pictured details. |
| An illustrated scene with a mission | Connect resources, prerequisites and object actions into a challenge through the editor. |
| A world already in progress | Keep its identity, revise objects and finishing rules, undo changes, save and return. |

The creative loop is **picture → idea → play → invention → play again**. Source-based artwork, editable consequences and persistent worlds give the creator something to develop beyond a single generated result.

## Create a world. Keep inventing inside it.

1. **Bring a picture and an idea.** Upload a drawing, illustration or photograph, or draw directly in the studio. Describe the experience you want to create.
2. **Review what Doodlume understood.** Inspect the original, recognized objects and proposed gameplay. Correct the parts that need your input.
3. **Play.** Move, jump, explore, discover details or use objects, depending on the world and its rules.
4. **Invent the next possibility.** Draw a new part, give it an ability, move objects or change what completes the game. Preview an ability before applying it.
5. **Keep your creation.** Save and reopen the world, undo edits, or export a portable backup containing its artwork, rules and progress.

The spring is one example of this loop. The editor also supports object interactions, resource transfers, prerequisites, discoveries and finishing requirements. Those systems can be combined to create different challenges within the engine's supported mechanics.

## Three worlds to try

| [Rooftop springs](https://doodlume-production-9df2.up.railway.app/#studio?example=rooftop-springs) | [A little care](https://doodlume-production-9df2.up.railway.app/#studio?example=patio-care) | [Lunar rescue](https://doodlume-production-9df2.up.railway.app/#studio?example=rover) |
| :---: | :---: | :---: |
| [![A rough rooftop drawing with a cat and fish](public/art/showcase/rooftop-springs-thumb.webp)](https://doodlume-production-9df2.up.railway.app/#studio?example=rooftop-springs) | [![A real photograph of a watering can and a succulent pot](public/art/showcase/patio-care-thumb.webp)](https://doodlume-production-9df2.up.railway.app/#studio?example=patio-care) | [![An illustrated lunar landscape with a rover, crystals and a rescue beacon](public/art/showcase/rover-thumb.webp)](https://doodlume-production-9df2.up.railway.app/#studio?example=rover) |
| Fit a newly drawn spring to the cat and gain a higher jump. | Use the pictured can on the pot to complete a game-resource watering challenge. | Allocate crystals, power the beacon and rover, then fit the rescue antenna. |
| Meta-generated game with a creator-authored ability. | Meta-generated game from a real photograph. | Authored example using the same interaction engine. |

These are ready-to-play examples. To create something new, open the studio and supply your own image. The drawing and lunar illustration are AI-generated assets. The photograph is by [Shixart1985, CC BY 2.0](https://commons.wikimedia.org/wiki/File:Person_waters_succulents_on_a_table_in_an_outdoor_setting.jpg). Full [example provenance and credits](public/art/showcase/README.md) are included in the repository.

## Different pictures, different ways to play

| Play style | What the player does |
| --- | --- |
| **Adventure** | Move and jump, collect objects, activate linked interactions and reach a destination. Original subjects can become moving characters and props. |
| **Exploration** | Move freely through an image, discover its objects and trigger interactions positioned in the source. |
| **Discovery** | Follow clues and find pictured details in place, with optional hints, editable requirements and pointer or keyboard controls. |

The same world format supports these styles. Creation is driven by the image, creator intent and validated rules, rather than a lookup table assigning a fixed game to a sample filename.

## How the picture becomes playable

```mermaid
flowchart LR
    A[Drawing or photograph + creator idea] --> B[Meta Muse Spark Open\nvia Fireworks AI]
    B --> C[Objects, actions and goals]
    C --> D[Doodlume validation + creator review]
    A --> E[Meta SAM 2.1 tiny\nsource-object cutouts]
    E --> F[LaMa\nbackground repair]
    D --> G[Phaser game runtime]
    E --> G
    F --> G
    G --> H[Play, invent, save]
    H --> D
```

The models and the game engine have different jobs:

| Model | What it contributes |
| --- | --- |
| **Meta Muse Spark Open** | Interprets the image and creator intent, identifies objects and their relationships, and proposes structured gameplay. Served through **Fireworks AI** in the live build. |
| **Meta SAM 2.1 tiny** | Separates supported subjects from their original backgrounds so the source artwork can move independently. Runs on the application server. |
| **LaMa** | Repairs background exposed when source subjects move. This is a separate, non-Meta model running on the application server. |

**Meta connects the picture to the game.** Muse provides the semantic understanding needed to turn visible details into characters, destinations, clues and actions. SAM provides the object separation needed to move original artwork. Doodlume checks those outputs and turns them into rules a player can use and a creator can edit.

The model returns structured data, not executable game code. The application checks geometry, source artwork, interaction requirements and completion rules before accepting a world. Original-image inspection and creator correction remain part of the workflow.

The interface uses **React and TypeScript**, gameplay uses **Phaser**, and the Node.js application runs on **Railway**. Additional adapters support direct Meta Muse Wonder or Muse Spark, direct SAM 3.1, and Muse Spark Open through Baseten. Those are integration options; the live demonstration uses the three-model pipeline above.

## Models, API providers and deployment partners

| Technology | Role in Doodlume | Usage |
| --- | --- | --- |
| **Meta Muse Spark Open** | Image understanding and structured gameplay planning | Active model in the live creation pipeline. |
| **Fireworks AI** | Hosts Muse Spark Open and handles image-and-intent API requests | Active inference provider. Calls originate on the server; credentials stay off the browser. |
| **Meta SAM 2.1 tiny** | Source-object masks and cutouts | Runs on the application server, with no remote segmentation API call. |
| **LaMa** | Background reconstruction behind moving subjects | Separate non-Meta model running on the application server. |
| **Railway** | Hosts the application, API server and local model workers | Primary public deployment. |
| **Modal** | Hosted the containerized application and local model workers during deployment verification | Backup deployment documented in the [deployment record](docs/LIVE-DEPLOYMENT.md). It is not the inference API provider for the filmed Railway runs. |
| **Baseten** | Alternative API adapter for Muse Spark Open | Implemented integration. The recorded access attempt returned HTTP 403, so no successful inference is claimed for that attempt. |
| **Direct Meta Model API** | Alternative Muse Wonder/Muse Spark and SAM 3.1 request paths | Implemented options with separate access requirements, rather than additional models claimed to power the filmed run. |

Provider selection is explicit. A failed request does not silently switch to another provider or billing account. **React, TypeScript and Phaser** provide the interface, shared world contracts and game runtime; they are application technologies rather than model inference services.

## See Doodlume in action

[Watch the product demo](https://youtu.be/cUQJPewqZbI) to see drawing and photograph creation, a drawn ability changing gameplay, a connected rescue mission and saved progress. [Open the live product](https://doodlume-production-9df2.up.railway.app/) to try the examples or create your own world.

The [hands-on guide](docs/JUDGING-GUIDE.md) connects the examples to their implementation. The [technical facts](docs/PROJECT-FACTS.json) describe the active model pipeline, supported capabilities and current limits.

## Where this can go next

The next direction is richer game design from unfamiliar pictures: stronger object relationships, more expressive creator-authored abilities, and more varied missions with clearer feedback. The current engine and editing workflow provide the foundation. These are development goals, not additional capabilities being claimed in the demonstration.

## Run locally

Requires **Node.js 22.12 or newer** and credentials for a supported inference provider.

```sh
git clone https://github.com/sreenathmmenon/doodlume.git
cd doodlume
npm install
cp .env.example .env.local
```

Edit the ignored `.env.local` file. For the Fireworks path used in the live product, select:

```dotenv
MODEL_PROVIDER=fireworks
FIREWORKS_API_KEY=your_fireworks_key
FIREWORKS_MODEL=accounts/fireworks/models/muse-spark-open
```

Then start the studio:

```sh
npm run studio
```

Open **http://127.0.0.1:5173**. This builds and serves a stable local snapshot. Use `npm run dev` for development with Vite and the API server.

### Source-object cutouts and background repair

To install local Meta SAM 2.1, use Python 3.10 or newer. The setup script defaults to `python3.11`:

```sh
npm run setup:cutouts
```

Then add `CUTOUT_PROVIDER=local-sam2` to `.env.local`. The worker uses MPS on supported Apple Silicon installations and CPU otherwise. Model files live outside the repository. For the separate LaMa background-repair setup and model provenance, see [source background repair](docs/SOURCE-BACKGROUND-REPAIR.md).

Provider keys stay on the server. Never commit `.env.local`, provider credentials or model checkpoints. Deployment details are in [live deployment](docs/LIVE-DEPLOYMENT.md).

## Engineering and verification

The implementation keeps source imagery, introduced game elements and completion rules distinct. Edits retain world identity and progress associated with objects and achievements that remain in the revised world. Undo and portable backups preserve the information needed to return to earlier versions.

```sh
npm run check
npm test
npm run build
npm run check:secrets
```

Checks cover world and interaction contracts, source-art processing, provider recovery, editing, undo, saved worlds and renderer behavior. Real inference runs and browser playthroughs are documented separately in [live validation](docs/LIVE-VALIDATION.md) and [source-to-play verification](docs/QUALITY-REPAIR-VERIFICATION.md).

| Code | Responsibility |
| --- | --- |
| [`server/interpret.ts`](server/interpret.ts) | Image interpretation and game creation |
| [`server/provider.ts`](server/provider.ts) | Model-provider requests and explicit provider selection |
| [`server/segmentation.ts`](server/segmentation.ts) | Source-art extraction and mask handling |
| [`server/source-background.ts`](server/source-background.ts) | Background reconstruction |
| [`shared/world.ts`](shared/world.ts) | World definition and validation |
| [`src/game/`](src/game/) | Playable runtime and feedback |
| [`src/components/`](src/components/) | Homepage, studio and creator interface |

### Current scope

Doodlume creates editable 2D experiences within its movement, interaction and discovery systems. Unclear or obscured subjects can need creator correction, and generation time depends on the input and provider. Photo resource transfers change game quantities; they do not simulate physical liquid or plant growth. Saved worlds live in the browser's IndexedDB, with portable export and import for moving them between installations.

Built by [Sreenath Menon](https://github.com/sreenathmmenon).
