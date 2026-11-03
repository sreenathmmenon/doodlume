# Playable showcase provenance

These are saved, authored example worlds, not fresh model requests on every visit. The same world validator and game runtime used by the studio load these files. No filename selects a special gameplay implementation.

The source illustrations and rough notebook drawing are **AI-generated test inputs**, not photographs of real people’s work or drawings collected from children. Moving source artwork remains recognizably derived from those inputs. `scripts/showcase/package-world.mjs` converts inline artwork in a saved world into local lossless WebP assets; it does not generate a game or alter its rules.

## Rover

- An actual Meta Muse Spark Open request through Fireworks interpreted the rover, three crystals and beacon and proposed three prescribed charge transfers. Raw response: `outputs/verification/object-gameplay/rover-live-model.json`.
- One crystal’s recognized box required an explicit manual correction. The correction and raw model meaning are retained separately in `rover-recognition-correction.json`. Local Meta SAM 2.1 isolated moving artwork; local LaMa reconstructed the authorized background removal regions. LaMa is not a Meta model. See `docs/SOURCE-BACKGROUND-REPAIR.md` for model provenance, external weights, fallback behavior and licensing uncertainty.
- A rough antenna was drawn through the public studio editor. Its attach-and-move ability and destination were creator assigned. The actual play/save evidence is `rover-invention-world.json` and `rover-invention-saved.json`.
- This packaged version includes an **authored revision** permitting each of the three crystals to power either receiver. Both receivers must be full before the antenna can move the rover. The six alternatives and filled-state prerequisite were not all present in the original Meta response. `rover-choice-saved.json` records a completed alternative allocation and the attached part.
- Travel changes the original rover’s persisted position and moves the attachment with it. It is a bounded authored movement, not simulated repair, vehicle physics or obstacle-aware navigation. The remote headlight beam in the original background remains outside the object-removal region; it was not selectively erased to improve this sample.
- The homepage’s “Draw your own part” replaces the prepared antenna’s artwork with the visitor’s ink while retaining its declared ability and earned state. It does not infer arbitrary new mechanics from that ink. The studio exposes general ability/destination authoring separately. Public homepage completion is documented in `home-invention-proof.json` and `output/playwright/home-own-invention-complete.png`.

## Rough cat care

- An actual Meta Muse Spark Open response interpreted an AI-generated rough pencil-style cat and fish on lined paper. Raw response: `cat-care-live-model.json`.
- Initial compilation failed; the saved response was recompiled after a compatibility fix without another inference request. Subsequent automatic source admission correctly required review. One fish selection was manually corrected and locally re-extracted; the game graph stayed intact. See `cat-care-recompiled-status.json` and `cat-care-recognition-correction.json`.
- The player takes the original fish and feeds the cat through a bounded food transfer. Public play, save, reload and reopen passed, as recorded in `cat-care-browser-proof.json`. This example demonstrates one care interaction, not a multi-stage pet simulation or an animated eating behavior.

## Existing adventure assets

Clockwork is an authored illustration-adventure example. Its current revision uses source-aligned surfaces and a bounded authored jump-strength parameter; that parameter belongs to the general world contract. Existing dinosaur and kitchen files are retained legacy examples, not proof of the new object-interaction flow. In particular, the separately recorded rejected kitchen conversion must not be described as accepted visual evidence.

## Claims and release boundaries

The packaged worlds are reproducible examples of supported behavior. They do not establish universal photo conversion, perfect segmentation, player retention, production deployment readiness, or external judge approval. Original inputs and failed/corrected attempts are preserved in the verification directory. Generated browser assets contain no provider keys; fresh inference remains a server operation. Final public release must separately verify input/model rights and clean deployed access. Raw gameplay recordings are verification artifacts, not the finished submission film.

## Display derivatives

`*-thumb.webp` (192×128) and `*-preview.webp` (up to 1440px wide) are resized/compressed derivatives of the corresponding existing source artwork, not additional generated scenes. The homepage uses these lighter files for browsing; Original and the game continue to use the full source assets. Thumbnail crops are navigation previews only; the main artwork remains contained and uncropped.
