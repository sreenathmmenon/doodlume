# Pictures and first-world design

Implemented October 31, 2026. The manual path works without model access. The automatic Meta picture path is coded but still needs live inference validation.

## Delivered

- Drawing / Photo-picture source selection. Picture uploads open directly; paper alignment remains available separately. Paired-phone pictures enter the same source flow.
- A picture-specific Muse interpretation prompt, retaining the existing supported 2D roles. It asks for clarification when a subject or usable surface is missing and does not claim hidden-scene reconstruction.
- SAM cutouts after interpretation when configured. When unavailable, picture crops preserve their original colors and pale/white regions instead of applying drawing-specific white-paper removal.
- Pick. Place. Play., a first-world designer shared by manual selections and the review of a Meta interpretation. Crop bounds and game placement are independent.
- Rectangle selection by pointer or numeric fields, role reassignment, object naming, independent placement/size, drag placement, theme and adventure text, removal, and explicit switch-to-gate targets.
- Added platforms, bridges, collectibles, gates, switches and destinations are labeled as additions. A character or scenery must be selected from the source image. There is no model result simulated for the manual path.
- Optional oval trimming, chosen by the person, for round photo subjects. It is a local geometric crop, not SAM segmentation; background inside the oval remains.
- Checks for one character, usable terrain, valid bounds, valid gate links, source-crop bounds and a character embedded in solids. Missing destinations, large characters and missing support produce guidance. Route reachability is not proven.
- Real source pixels are prepared locally before acceptance. Existing model cutouts survive layout-only changes; changing a source crop or trim shape replaces that cutout with an explicitly manual extraction.
- Prepared previews show extraction details, require acceptance, and lead to the existing shared engine. Manual worlds are labeled Chosen by you and retain that provenance in device-local saves. Cancelling keeps the current game intact.
- Automatic revised-page comparison remains limited to drawings. Picture games use the manual same-world editor for later additions.

## Image-rich saves

The first real-photo trial exceeded the old localStorage quota. Saves now use a native IndexedDB library, with atomic writes and the existing eight-world retention limit. Earlier localStorage saves are migrated without removing their backup. Unchanged images are not rewritten on each load. Save failures leave earlier records intact. Storage remains local and subject to browser/device capacity; no cloud upload is introduced.

## Verification boundary

Twenty focused tests now include one added picture-protocol/review check. It checks the picture prompt and metadata, actual pale RGB/alpha pixels when SAM is unavailable, valid manual provenance, rejection of invalid source boxes, and blocked character spawns. It uses a synthetic test-only transport and is not evidence of model recognition accuracy.

The browser trial uses the public [NASA Blue Marble photograph](https://www.nasa.gov/image-article/blue-marble-view-from-apollo-17/) as a manually selected subject. No model call is made by that route. The character, added platform/collectible, switch, gate and destination all use the ordinary shared engine; no behavior depends on this image or world name.

Verified in Chrome:

- A real photograph imported in picture mode; selected source pixels became a playable character, first as a rectangle and then with an explicit manual oval trim.
- Source selection by pointer and numeric fields; independent drag placement; role selection and a chosen switch-to-gate target.
- A character placed inside the ground blocked acceptance. Returning it above the ground re-enabled preview.
- Cancelling a first-world refinement left the prior preview's original position unchanged (120 rather than the cancelled change to 600).
- The designer fit a 390×844 viewport with a 390-pixel document width and no horizontal overflow.
- The game moved the photo character, collected its item, opened the selected gate and reached its destination. It also finished after reopening a progress save.
- Image-rich saves initially exposed the old localStorage limit. After the IndexedDB change, the photo world saved successfully and reopened after a page reload with one collected item and the activated gate retained.
- The earlier grove reopened with two collected seeds, revision 3 and its two undoable edits. Both worlds remained in the library.

These are manual photo-adaptation and shared-engine results, not live Muse/SAM inference. One real photograph is not a broad unfamiliar-input benchmark.

This increment does not add Muse Image generation/inpainting, speech recognition, arbitrary generated mechanics, automatic background reconstruction, 3D worlds, or live camera tracking. Actual model accuracy, latency and broad input quality still require the working provider account and unfamiliar-input trials.

## Primary references

- [Muse Spark image perception](https://dev.meta.ai/models/muse-spark)
- [SAM image and box prompting](https://dev.meta.ai/docs/sam/segmenting)
