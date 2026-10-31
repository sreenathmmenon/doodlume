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
