# Drawing and studio verification — October 31, 2026

The active provider is Fireworks hosting Meta Muse Spark Open (`accounts/fireworks/models/muse-spark-open`). Actual source images and intents were sent through the normal server interpretation pipeline. No model result was substituted with an authored example.

## Input trials

Five distinct authored drawings were checked with real model requests. Four passed local placement validation: grove (8 objects), first light (4), clockwork crossing (8), and pencilled detour (5). Moon delivery was rejected because a proposed crop contained no clear ink; the running world was not changed. The four additional trials took approximately 16–28 seconds each; the grounded grove took approximately 22 seconds. Inputs were authored digital drawings, not a physical-paper or photographic benchmark. Placement validation does not solve the full route.

Hosted drawing boxes are aligned to nearby source marks before source-pixel extraction. Support strokes and local connected components help correct approximate coordinates. This is a bounded image heuristic, not SAM or a guarantee of semantic identification. Photos skip this drawing-only operation and retain pale pixels. Objects remain reviewable and editable before play.

## Product changes

The studio opens on the game. New world opens source input and intent; successful interpretation opens a review with real artwork and a playable-world preview before acceptance. Creation, review, game controls and settings use concise copy. Manrope and Fraunces are served locally with their licenses.

The renderer follows the available viewport instead of letterboxing a fixed-size canvas. Bounded tile textures support expanded maps without allocating a map-sized background bitmap. Add space extends the width in 1,440-unit steps, up to the validated 12,000-unit limit. Existing objects and progress are preserved; undo refuses to strand the player outside the restored map. The engine still has eight generic roles. It does not support arbitrary game mechanics, 3D reconstruction or every diagram.

## Automated verification

All 20 existing focused tests pass, including added assertions inside the existing revision test for expansion, preserved state, undo and rejected shrinking. The production build and TypeScript checks pass. The staged credential scan is a separate pre-commit gate.

## Provider limitations

Direct Meta key creation remains restricted and live SAM 3.1 is unverified. Baseten returned HTTP 403. A private Modal SAM 2.1 experiment did not yield a usable inference result and was stopped; it is not part of the runtime. Fireworks is explicitly selected; no failure silently changes providers or billing accounts. No public deployment or cloud-save integration has been made.

## Browser verification

The browser accepted a fresh uploaded first-light drawing, called the real Fireworks Meta model, reviewed its four original-art crops, and opened it as **From your drawing**. Keyboard play collected the star and reached the house. The world was saved separately. Expanding to width 2,880 and undoing retained the collected item and advanced revisions to 2 and 3. A 390 × 844 browser viewport exposed touch controls; a held right-control press visibly moved the character. This is browser emulation, not a physical-phone test.

The first review exposed a zero-size dialog canvas; rendering now waits for a nonzero observed layout before creating Phaser, and clicking the game host restores keyboard focus. Saves remain device-local; cloud persistence and arbitrary diagram/photo recognition have not been established.

A later browser repeat of clockwork crossing was rejected for unclear object geometry despite its earlier successful request. Recognition is not yet consistent across repeated complex drawings. The first-light drawing succeeded both in the input trial and the completed browser playthrough; these results should not be presented as a general success rate.

After the renderer fix, a fresh real first-light generation displayed its complete world in the review dialog. Reloading the library preserved the earlier completed model world, its collected star and revision 3; the original saved grove remained alongside it. The final staged scan also checked configured Modal token values and the generated browser build.


## Quality repair pair 1 — saved work and continued authorship

Loading, migrating and saving no longer prune worlds beyond eight. IndexedDB saves take precedence over the retained localStorage migration backup. Fresh authored examples receive separate world identities, preventing a new attempt from overwriting an edited save. Atomic write failures report an error; the open world remains available for backup. A forced storage-quota/interrupted-write browser trial remains outstanding.

My worlds now exports the open world, an individual save or the library as a versioned JSON backup containing source artwork, progress and undo history. Imports validate the entire file before writing, preserve existing IDs by default, and offer explicit independent copies with remapped history identities. The portable file is limited to 64 MB; this is not cloud sync.

Completion offers Continue building, Keep exploring and Replay from start. Building/exploration preserve the completed achievement, used levers, collected items and character state. Goal overlap does not replay the completion overlay. Only an explicit replay starts a fresh attempt. Continued state survives world revisions, undo, save and reopen.

Browser verification used an isolated loopback origin and clearly labelled authored QA fixtures, not model-generated results. Twelve worlds survived import and reload; a malformed twelve-world backup was rejected without changing the library; importing an existing backup showed all twelve conflicts and disabled the zero-new-world action. A single-world copy import produced a thirteenth independent save. An actual downloaded library backup validated with all twelve original IDs and its saved history.

A completed QA world at its goal continued into the editor, expanded from 2,880 to 4,320 units at revision 3, resumed without a repeated completion overlay, collected another item through keyboard movement, paused and saved. Its downloaded backup retained two collected IDs, the activated lever, completed/exploring flags, character position and two undo checkpoints. Reload/reopen retained these; undo advanced to revision 4 while keeping later collected progress. Explicit replay reset the attempt to zero items while preserving world/history. A 390 × 844 viewport check covers the backup controls and library layout; it does not establish physical-phone usability.

Two focused regression tests bring the suite to 22. They cover retention, migration precedence, conflict-safe import/copy, malformed backups and immutable earned-state continuation. Production build and type checking pass. Original council scores remain a historical baseline: these repairs do not establish a 10/10 rating, broad recognition reliability, device performance or emotional engagement.


## Quality repair pair 2 — readable interaction and source-first creation

Creation uses a single logical source → intent → Create flow at narrow widths. The source image opens a separate original-image inspector with a keyboard-operable 100–400% zoom, contained scrolling and a Fit action. Returning keeps the source and intent. Phone intent text uses 16px type.

The editor provides Add at center, a chooser for new objects, arrow-key movement in ten-unit increments, Shift-arrow one-unit movement, Delete/Backspace removal, and the existing numerical placement fields. Existing objects remain protected. A browser test inserted a bridge with Enter, moved X from 610 to 621 using coarse/fine keys, inserted and deleted a platform, selected the surviving bridge through the native chooser and applied the edit. This is targeted keyboard verification, not a screen-reader or physical-device certification.

Six rendered supporting-text samples now measure contrast ratios from 5.76:1 to 6.09:1. The previously reviewed editor instruction changed from 12px at 3.03:1 to 13px at 5.92:1 on the cream surface. This does not assert that every surface in the app has been audited. Operational labels, tools and numerical fields also use darker text and larger controls.

At a 390 × 844 browser viewport the source occupied 328px of the available content width, followed vertically by intent and Create; the page had no horizontal overflow. The original-image inspector reached a 1,304px scrollable image at 400% while the page remained 390px wide. Source pixels were unchanged.

Settings and creation now say API key configured, and explicitly distinguish a local configuration refresh from a live provider request. Segmentation configuration no longer claims a live-tested connection. Help describes the current review flow, generic collectible objects, optional collection, destination completion, touch controls, continued authorship and backups. The gameplay hint marks collections as optional. No model credits were spent on these checks.

Recognition repeatability, bounded required-objective authoring, expanded-map precision/zoom, physical-phone use, forced storage interruption, named-device performance and real creator engagement remain separate open acceptance gates. The original council is not re-scored automatically from these repairs.
