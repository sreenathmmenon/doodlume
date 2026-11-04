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

## Quality qualification — November 1, 2026 (local time)

This entry is the current qualification record. Earlier entries above remain historical snapshots, including their then-open gates and test counts. The private local evidence is in `../outputs/doodlume-quality-all-2026-10-31/` relative to the repository; the folder uses the UTC session date.

### Recognition and repair

Fifteen actual Fireworks Meta Muse Spark Open (`accounts/fireworks/models/muse-spark-open`) interpretation calls exercised 12 distinct deterministic authored digital inputs plus three repeats. The distinct inputs covered separate line art, pale pencil rendering, saturated marker, touching character/ground, a shadowed/tilted digital page, ambiguous characters, a dense labelled diagram, textured overlapping illustration, a synthetic photo-like raster, one switch/two gates, no ground and a revised bridge page. Every SVG/PNG source, intent, output, latency and model/provider identifier was retained. All inputs were synthetic; the photo-like fixture is not a real photograph or magazine page.

The 12 distinct outcomes were eight accepted previews, one quarantined repair review and three actionable clarifications. Pale pencil, touching-ground and bridge inputs were accepted in both runs. Including repeats, the 15 calls yielded 11 accepted previews, one repair and three clarifications, with no request/processing failures. SAM was disabled, no provider was substituted and no automatic retries were made. End-to-end exported-interpretation latency was 5.42–15.74 seconds, median 10.34 seconds; this includes local processing and inference, but not browser upload/review/render time. This small corpus does not establish a general success rate or resolve the earlier clockwork-repeat inconsistency.

A sixteenth actual Fireworks request ran through the browser on the ambiguous-switch source. The recovered original objects were reviewed, the gate target was chosen, corrections survived closing/reopening the designer, and the resulting world was played and saved. Separately, the clean corpus model world was imported into isolated browser QA, played to 2/2 collected objects and completion, then saved. These are real inference outputs, not authored examples substituted for recognition.

Recoverable output now preserves valid source selections and artwork in a separate review-only candidate. Unlocated/duplicate identities are left out with explanations; unclear switch links remain unassigned. Missing characters/ground and blank crops receive actionable local repair. Crop changes invalidate the earlier crop and prepare artwork from actual original pixels; final world validation still gates acceptance. Paused corrections are kept separately from the running world and cleared when the source or inference changes. Source/upload version guards invalidate stale requests and late file decodes. Declared artwork loading failures pause the game and offer recovery instead of silently replacing the original character.

Accepted geometry does not prove complete semantic crops. In the synthetic photo-like fixture, the proposed subject crop trimmed approximately 45 pixels from the top; the retained source-coordinate overlays expose this limitation. Picture review explicitly asks the creator to check full outlines and provides crop correction. Real photographs, magazine pages and precise SAM cutout quality remain unqualified. Fresh bridge interpretation is not proof of revised-page inference continuity.

### Rules, precision and preservation

Destination rules select bounded required collectible and activated-lever IDs. The contract rejects repeated, missing or wrong-role references; the HUD, review and runtime distinguish required from optional actions. Premature destination overlap checks these requirements. Completed achievements remain earned during continued authorship; explicit replay starts a new attempt. Exploration worlds can receive a manual destination through Edit world. This remains a bounded 2D role/rule vocabulary, not arbitrary generated mechanics.

The editor now includes fit/detail zoom, pan, object focus, numerical placement and keyboard controls for expanded worlds. These features complement the earlier source inspection and contrast repairs; physical-touch and assistive-technology qualification remain separate.

Version 2 portable backups deduplicate identical PNG assets while restoring exact source/crop strings, progress and undo history. Existing version 1 backups remain readable. Import conflicts preserve existing versions or create explicitly independent copies; rule references and checkpoint world identities survive copying and export/import. A focused probe confirmed undoing a copied rule change restores its prior rules without clearing earned collected/activated IDs.

Six isolated fake-IndexedDB fault-injection cases passed: retention beyond twelve worlds, migration precedence, synchronous quota-style transaction failure, abort after a staged successful replacement, safe retry and conflict-safe copy with rules/state/history. Existing records survived the injected failures. This used `fake-indexeddb 6.2.4` in memory and did not touch the owner's browser data or add a product dependency. It is not actual browser disk exhaustion, a process crash or a physical-storage test.

A deterministic capacity trial round-tripped 26 repeated artwork references using one deduplicated asset. A full-history backup containing 26 unique large assets accurately hit the 64 MB limit; explicit current-version export preserved exact current pixels and left all 12 saved checkpoints unchanged. An oversized current version was rejected clearly. Expanded artwork references are bounded at 512 MB; neither limit implies cloud persistence or unlimited storage.

### Performance and renderer lifecycle

The measured profile was a Mac16,1 with 16 GiB memory, Chrome 156, a 1512 × 756 browser viewport and the loopback service, without network/CPU throttling. Readings came from opt-in in-app frame/lifecycle instrumentation, not a DevTools trace or a physical-phone benchmark.

An authored maximum-bounds QA world (12,000 × 5,000, 160 objects) initially measured a 109.3 ms p95 frame interval. Bounded terrain baking, bounded artwork allocation and scene visibility work reduced the measured p95 interval to 9.8 ms across 9,173 samples; one sample exceeded 33 ms. These are renderer frame intervals on this machine and fixture, not a universal FPS guarantee. The later record showed a 740 ms first-world-ready time and 341.7 ms latest setup time; cache/network conditions were local.

Across 20 restart transitions, the DOM retained one game canvas at each step. Cumulative lifecycle counters ended at 24 games created, 23 destroyed and one active. This supports cleanup of those observed transitions. The observed heap value and counters do not prove absence of every memory leak or long-session/device behavior.

The measured main JavaScript response was 1,481,772 bytes with identity encoding, 335,357 bytes with gzip and 306,162 bytes with Brotli. The server returned matching Content-Encoding, Vary and immutable cache headers for hashed assets. These are measured response sizes for this build, not whole-page transfer or first-use mobile-network measurements.

### Current checks and limits

The latest 35 focused tests, type checking and production build pass. Protocol fixtures remain test-only; the product has no mocked model success path. Credential scanning remains a separate staged pre-commit gate and should not be inferred from build success.

The work closes concrete save/recovery/rule/precision/lifecycle gaps and supplies measured local evidence. It does not establish 10/10 quality, 100× competitive superiority or a release outcome. Actual photographs/magazine pages, physical devices/Wi-Fi/camera use, live SAM 3.1, broader device/performance coverage, real browser storage exhaustion, real creator engagement/emotional attachment and broad recognition repeatability remain unqualified. No public deployment or cloud save service was introduced.

Final browser fault qualification: temporarily removing only the isolated QA copy of the character SVG produced a visible retry/backups alert, disabled play, and disposed its renderer (one created, one destroyed, zero active canvases). Restoring the file and retrying restored the same world. Missing static files now return 404 rather than the HTML app shell; a 15-second startup deadline also bounds stalled decoding. The final routing regression is the 35th focused test. The final full-map run measured 10.3 ms p95 across 5,503 samples, three above 33 ms; backing surfaces remained five viewport-sized canvases.


## Creation and play improvements — November 1, 2026

A new four-round product council produced 40 comments from ten separate simulated reviewer perspectives over 23.4 minutes. The original report is retained outside the repository in `../outputs/doodlume-quality-council-2026-11-01/`. This is a structured design review, not participation or endorsement by the named people, and it supplies no numerical 10/10 certification. Implementation and browser evidence are retained separately in `../outputs/doodlume-quality-closure-2026-11-01/`.

### Personal creation and truthful requirements

The studio now gives personal drawing/upload a visible entry point above examples. Creation starts with a blank personal draft rather than an example image or example intent. An unfinished drawing, source image, play idea and correction review are retained separately from the active world. Inspecting the active world shows that world's source; changing examples does not replace the creation draft. Starting over is explicit. Create, Review and Sketch dialogs reserve an action region with a whole-dialog scrolling fallback at short heights.

The model contract now includes bounded required collectible and lever IDs. Invalid, unmatched requested, contradictory or unresolved requirements stay in review and require explicit confirmation; they do not silently become optional. The pre-play review names the destination, required actions and optional actions and lets the creator edit these without modifying the active game. The intent associated with a result is captured with that request, so later text edits cannot relabel an older result. Selecting an already-selected image type preserves corrections, and returning from requirement editing restores keyboard focus. Provider configuration labels identify the selected provider rather than implying direct Meta API access.

Two actual Fireworks Meta calls used the same synthetic line-art page with different intents. Optional exploration returned empty required-action arrays; collecting both stars before the house returned both actual star IDs as required. The latter ran through the browser: the creator changed and restored one requirement in review without changing the active game, played to 2/2 and completion, then saved it separately. Opt-in timings for that call measured 11,362.2 ms from request to review and 247.6 ms from acceptance to playable. The deliberate review interaction took another 58,346.8 ms; it must not be reported as model latency.

### Differentiated play and visible interaction

Fresh examples now have different objective structures: the grove requires two ground-level seeds and offers an optional upper detour; the moon requires its named switch to open its named gate, with optional stars; the canyon has a playable lower route and return steps, with an optional creator-built shortcut. Actual keyboard playthroughs completed all three. The observed totals were grove 2/3, moon 1/3 and canyon 2/3, confirming that optional items did not prevent completion. The moon switch can also be reached from a well-timed ground jump; its ledges are not mandatory. These are authored examples, not model-generated games.

Nearby-switch cues name both the switch and its target. Touch controls have a visible Use label. Procedural accents follow the world's palette. Reduced-motion play uses bounded camera follow without look-ahead or interpolation rather than forcing an unreadable whole-world overview; this is a source correction, not a physical-device or vestibular-user qualification.

At a 390 × 844 browser viewport, personal creation and the drawing action remained visible and usable. At 844 × 390, the full drawing dialog scrolled, bringing its footer into the viewport. An actual unfinished stroke survived closing and reopening the drawing draft. These checks used browser viewport emulation, not a physical phone.

### Source artwork and revised pages

Live play exposed removal of enclosed white interiors from line drawings. Paper removal now follows only near-white pixels connected to crop boundaries. Enclosed white pixels and original RGB bytes remain; open outlines are not artificially painted closed. The server and manual source-crop path share the same bounded helper. Reprocessing retained actual model boxes restored 6,604 opaque white pixels in the cat and 14,116 in the house while leaving every RGB byte unchanged and outside paper transparent. Existing saved art is not silently rewritten.

Revised-page comparison also exposed inaccurate model boxes. New grounding matches only an already-proposed addition to one unique, nearby, size-compatible component of actual new ink. It requires identical normalized image dimensions and preservation of at least 99.8% of original ink. It never discovers new game objects from image differences or guesses their roles. Corrected selections are marked for review and rechecked for duplicate geometry before actual revised pixels are cropped. Large shifts, ambiguous components, changes to old marks and unsupported matches remain explicit manual clarification. This does not geometrically register arbitrary photographs.

The comparison prompt now separates original normalized source boxes from resized/moved gameplay boxes and explicitly states the revised-page coordinate formula. Expanded world bounds do not change the page's 1440 × 820 base mapping.

### Qualification boundary

This work retains the original product direction: original artwork to playable 2D world, continued creation, preserved identity and earned progress. It does not establish unlimited generated mechanics, universal image understanding, arbitrary photo registration, 10/10 quality in every category, 100× competitive superiority or any prize outcome. Real paper photographs, physical-phone camera/network behavior, live SAM 3.1 and real creator engagement across ages still require direct evidence. The council's earlier decisions are not retroactively converted into perfect scores by code changes.


Manual revised-page repair now offers an explicit **Use page artwork** action on a selected new object. This performs local cropping from the revised image with the same paper/white-interior handling. A blank selection reports an error and preserves prior artwork; an out-of-page selection is rejected. In-flight preparation blocks Apply and cancels on selection, geometry, source or world changes. Built-in, custom and source-page artwork are labelled distinctly. A typed page-change description survives opening the editor and returning to the page.

An actual browser repair rejected a blank crop, then extracted the complete bridge from x 889, y 579, width 252, height 36. Applying and saving produced revision 2 with six entities. The downloaded backup confirmed the original five entities were exactly unchanged, the same world ID remained, both collected star IDs and the completed/exploring achievement remained, and the new entity held real PNG artwork, normalized source coordinates and manual crop provenance. Undo produced revision 3 with both earned stars and the achievement still kept. This was explicitly manual repair, not an automatic model success.


Automatic revised-page qualification is deliberately recorded with its failures. Five real comparison calls were made during this repair: an initial browser comparison rejected an empty crop; a captured comparison accepted a truncated bottom-edge selection; a repeat after grounding rejected an unmatched proposal; a captured controlled repeat accepted the full grounded crop; and a browser comparison after coordinate clarification accepted the complete bridge. The truncated captured reply was also replayed offline to verify the grounding fix; that replay is not another model call. The two captured calls used the actual saved world and actual revised upload, with only structured response content retained privately and no request headers or credentials logged.

The final automatic browser proposal was visibly labelled Meta via Fireworks and marked Needs your review. Reviewed Apply and Save produced revision 4 with a new `paper-` bridge ID and the complete x 889 / y 579 / 252 × 36 original-art crop. Export checks confirmed all five old entities were exactly unchanged, the original world ID stayed, both collected items and the completed/exploring achievement remained, and one undo checkpoint was retained. Reloading and reopening showed version4, 2/2 items, the retained achievement and the undo action. This single success after prompt clarification is not proof of broad or repeatable revised-photo recognition. The earlier rejected trials remain part of the evidence.


A third fresh first-world interpretation accepted both required stars and visibly preserved the enclosed white cat/house interiors in browser review. It measured 7,081.6 ms from request to review and 183.7 ms from acceptance to playable; 65,315 ms of intervening review was human-operated QA, not model time. An actual browser regression check changed the pending idea, reopened the older result, prepared its object review, and confirmed the older result still displayed its original required-star intent. Selecting Drawing again retained that result. Closing requirement editing restored focus to Edit requirements.

For a controlled premature-finish check, a temporary destination was manually placed near the start of that fresh world. Actual character overlap at 0/2 did not complete the game and displayed both missing star requirements. Undo removed this explicitly authored test destination; playing the original route collected 2/2 and completed the model world. It was saved as a separate sixth QA world. The temporary destination is not represented as model-generated.

This improvement session used eight real model calls in total: three first-world interpretations and five revised-page comparisons. None used a mocked success path, hidden provider substitution, or automatic retry. The focused suite remained 35 tests; meaningful failure cases were added to existing tests rather than expanding a redundant UI/unit suite.


Final focused-play framing now sizes the complete panel around dynamic headings, revision strips and controls, and scrolls the complete focused layout to the top rather than centering only its canvas. Browser rectangles measured top 12 / bottom 744 at 1512 × 756 and top 6 / bottom 838 at 390 × 844 with revision 3 present. Short 844 × 390 layouts retain a 200px play surface and permit page scrolling. This is viewport emulation, not device certification.

Before the final renderer repair, the build repeated the authored 12,000 × 5,000 / 160-object whole-world rendering trial on the same Mac/Chrome profile. Across 7,757 recorded frame intervals, p50 was 8.3 ms and p95 was 9.9 ms; one interval exceeded 33 ms. There was one active game/canvas, with five backing surfaces no larger than 1460 × 592. The latest setup measured 297.2 ms. These local frame intervals do not establish physical-phone performance, universal FPS, network performance or the absence of all memory leaks.

The final 35 focused tests and the production TypeScript/Vite build passed. No broad or redundant test suite was added. The original owner library remains separate from all QA saves.


The refreshed main preview retained exactly the owner's two original saves. Green Grove Homeward reopened completed at 1/1 and revision 3, and its original-source inspector showed the correct saved image. QA worlds and downloaded backups stayed on the isolated QA origin. The private repository remained private. Staged-file/build credential scanning passed, including configured provider/Modal secrets and credential ignore rules.


### Final renderer failure and recovery qualification

A final main-preview world switch at a natural 1512 × 700 viewport exposed a black canvas and a real WebGL framebuffer exception after the interface had reported readiness. Earlier playthroughs did not cover that failure. The release was held. The renderer now has one resize owner, rounds and bounds framebuffer dimensions, marks readiness only after a successful rendered frame, and handles errors inside its own game loop and context-loss listener. A failure disposes that canvas and exposes Retry artwork while retaining the last valid play state. A retry retains the failed attempt; an explicit restart or a different world must not inherit that recovery snapshot.

Controlled qualification used a separately built local copy on port 5179, with model requests disabled. A test-only F9 hook threw once inside the protected game step while an actual Meta-created world was playing with one of two stars collected. The interface displayed the recovery message, data-ready became false and the game canvas count became zero. Retry restored the visible game at 1/2. Save and reopen retained 1/2; an explicit Restart reset the attempt to 0/2. The hook exists only in the isolated test copy, and canonical source/cache hashes were unchanged. This is injected-failure qualification, not a claim that the new build spontaneously failed or that every GPU failure is covered.

After rebuilding and refreshing the main preview, the owner’s Green Grove Homeward rendered visibly at revision 3 with its 1/1 achievement retained. Returning to the fresh grove also rendered visibly at the same 1512 × 700 viewport. The old captured error remains in the evidence; the new successful screenshots do not erase it. The library still contains the original two saves.

The final renderer build repeated the authored 12,000 × 5,000 / 160-object whole-world trial at 1512 × 756. Across 12,035 recorded frame intervals, p50 was 8.3 ms and p95 was 9.5 ms; five intervals exceeded 33 ms. There was one active game/canvas and five backing surfaces no larger than 1420 × 519. Setup measured 318.1 ms. This is local, unthrottled Mac/Chrome evidence, not physical-phone or universal performance certification. The final TypeScript/Vite production build and all 35 focused tests passed after the renderer change.


## Supplied drawing/photo qualification — November 1, 2026

All seven PNG files in the owner's `Downloads/Inkling-sample-drawings` folder were inspected and sent through the real product interpretation route using Meta Muse Spark Open via Fireworks, with SAM disabled. File names are sample labels, not verified ages, authorship or provenance. The first pass used original full-frame image bytes, without automatic retry or pre-cropping. Evidence, complete responses, input/crop contact sheets and the completed-game backup are private local artifacts in `../outputs/doodlume-inkling-validation-2026-11-01/`; none of the supplied images or generated image payloads are committed here.

| Supplied sample | First live result | Follow-up evidence and outstanding limits |
| --- | --- | --- |
| Abstract crayon marks | Clarification, no fabricated game | Asked for a distinct character and a platform. No automatic playable-world claim. |
| Crayon rocket | Correction review: character intersects support | A fresh same-input call after the support-refinement repair reached preview. The stars were optional. Full play/collectibility was not qualified. |
| Dinosaur and three platforms | Correction review: unexpected finishing rules | Repeat still required confirmation. The model used a platform beneath the star as a destination. This remains a review issue, not an accepted interpretation of an explicitly drawn exit. |
| Blue robot and floating islands | Preview accepted, but visible crop defects | After manual paper-corner alignment through the UI and the final image-processing changes, a fresh live result was played to 4/4 required diamonds and the flag. Saved, exported and reopened. Some residual paper and overlapping source artwork near the flag remain defects. |
| Hooded traveler, bridge and castle | Correction review: character overlaps solid scenery | The repeat remained blocked at spawn. Dense perspective and connected cliff artwork need manual adaptation; no played completion is claimed. |
| Detailed clockwork scene | Preview accepted, but incomplete character/ring crops | A repeat reached preview too, demonstrating that acceptance alone was insufficient. Final local refinement of the retained selections explicitly flags uncertain marks. This final local replay is not another live model result, and the full route remains unqualified. |
| Elephant drawing screenshot | Clarification, no fabricated ground | Asked where a surface/destination should be placed. The visible elephant alone did not become a complete automatic game. |

### Defects found and changes

The old global binary-ink refinement treated photographed paper texture and desk/background as ink. It could replace a complete platform with a thin horizontal row and shift or truncate interactive-object crops. Whole-image refinement now requires a predominantly clean white page. For other sources, only already-proposed interactive marks are examined in bounded local windows using boundary-connected paper separation, component association, overlap/size/distance checks and ambiguity rejection. A failed isolation produces a correction-review note. It does not discover additional objects, assign new roles or substitute stock art. Connected surfaces retain the complete model selection; top-edge refinement on clean pages can expand a selection but cannot discard its original lower contour. These bounds do not guarantee every model selection is complete.

Paper removal now estimates a shaded-paper tone only when a majority of crop-edge samples are consistently light and neutral. It adjusts alpha only and retains original RGB bytes and closed interiors. Colored/varied edges do not qualify for that adaptive estimate. This is local image processing, not a SAM mask or a generated replacement. Reprocessing 62 retained selections from the five repeat results reduced alpha on 655,747 pixels with zero RGB changes. This controlled same-box comparison isolates the paper change; it is not a new recognition success. Separate final local refinement recovered the full robot and four diamonds from the retained original-page boxes while flagging uncertain dense-scene selections. Residual paper grain, connected foreground and overlapping objects inside one rectangular crop remain limitations.

The completed-game screen also exposed an unreadable secondary action. Its foreground/background colors were corrected; this is a small visual repair, not a new feature.

### Calls, actual play and verification

Thirteen actual Meta interpretation requests were used: seven first-pass inputs; five fresh same-file, same-intent repeats for samples 2–6 after the support repair; and one final UI creation from the manually aligned robot page. Repeats are stochastic fresh replies, so differences between them do not isolate a code change. No mocked inference or alternate provider was used. The final UI request took 26,007.5 ms to review, followed by 32,408.1 ms of operated review and 278.3 ms from acceptance to playable. Review time is not model latency.

The final robot result, Blue Bot Sky Hops, contains 18 original-art entities and four required diamond IDs. Actual keyboard play collected 1/4, 2/4, 3/4 and 4/4, then completed at the flag. One early jump attempt fell into the lower area; the attempt was explicitly restarted and the route completed using W plus movement. The exported product backup confirms four collected IDs and completed=true. No geometry, collectible state or completion was injected for this playthrough. The initial baseline was imported into the isolated test library only to inspect its actual defects. Test saves stayed on port 5180; the owner's original port-5173 library was not replaced.

The focused suite remains 35 tests, with regression assertions added to the existing picture test for shaded paper, retained color/interiors, pale strokes, conservative background handling, complete support extents, local mark association and uncertain-selection review. TypeScript and the production build passed. A single completed sample is not seven successful games, broad photo recognition, real-age usability evidence or a 10/10 certification.


## Expanded image coverage — 2026-11-01

The earlier seven-input run did not establish broad image support. A further run used 16 unique inputs: the seven supplied files, four newly AI-generated inputs (messy crayon marks, a dense city sketch, a kitchen scene and abstract watercolor), and five independently sourced photographs (cat, furnished room, toy cars, sunflower and chessboard). Online source URLs and generated-input provenance are saved in the private evidence directory outside the repository. These are test inputs, not verified evidence of any particular age group or real user satisfaction.

All inputs received the same generic instruction: “Make a complete playable game inspired by this image. Keep its visual identity; design the missing game elements yourself.” The run used the normal exported interpretation function with three concurrent inputs, one real Meta Muse Spark Open request through Fireworks per input, SAM disabled, and no provider fallback. Images were resized with the same bounded normalization intent as the client. The first pass returned 14 worlds, of which 13 had zero placement errors; two inputs required extraction review and one generated spawn overlapped a support. The test harness initially used the wrong backup state field; this was corrected locally using the already returned worlds, without repeating those 16 model requests.

The compiler now separates actual visible source selections from a model-proposed gameplay plan. Images without an existing game layout use their complete original image as a backdrop, actual subject/item crops when available, and explicitly generated guide/platform/objective/destination elements. The interface labels this Creative adaptation. Uncertain exact-layout extraction can use the model’s separate adaptation plan when there is no unresolved clarification. Genuine unsupported or ambiguous creative requests remain errors rather than quietly dropping the request. Generated route supports were narrowed and adjacent rises bounded to prevent the demonstrated starting collision. One focused regression covers abstract input and the wide-avatar/steep-rise case; the existing suite now has 36 passing tests.

Three affected inputs were rechecked with fresh real requests after fixes (19 model requests across the 16 unique inputs). Their final worlds pass schema and starting-placement checks. The final 16/16 result is **world validation, not 16 completed or polished games**. Latency remained variable; one recheck took approximately 62 seconds. This is not a speed/readiness success claim.

Actual browser play additionally completed the abstract watercolor world (destination reached, 2/3 optional items) and the independent room-photo world (all 3 required source-item crops collected and destination reached). Both were imported through the normal library UI into an isolated local test library, played with ordinary movement/jump keys, and saved. Completion screenshots are in `../outputs/doodlume-wide-input-validation-2026-11-01/`. Earlier robot completion remains separate evidence. The other new worlds were not all played to completion.

Scope remains a bounded 2D exploration/collection/switch engine. A full-image backdrop plus a route is broader input support, but it does not establish unlimited mechanics, 3D reconstruction, compelling age-wide retention, production readiness, first-prize likelihood, or superiority over commercial games. Generated-world art direction and variation still need substantial improvement.

## Image-native modes — 2 November 2026

The current compiler supports platform adventures, four-direction exploration, and ordered discovery on an unchanged source image. Mode selection comes from the model's structured plan and the person's requested experience. It does not route by filename or image identity.

A fresh run used sixteen independent inputs: the seven supplied drawings, four generated images (messy crayon, dense pen city, kitchen photo, abstract watercolor), and five online photographs (cat, room, toy cars, sunflower, chessboard). Fourteen of sixteen passed generation and world/setup validation on the first run. Two failed honestly: a blank destination description and an actual clued leaf classified as terrain. After generic normalization fixes, fresh model requests for both passed. All sixteen therefore have accepted structurally checked outputs after two targeted rechecks; this is not sixteen completed games. Raw first-pass failures are retained. Each request used the same general creation instruction, one actual Fireworks-hosted Meta vision call, and no segmentation in this batch. A separate watercolor request explicitly asking for four-direction movement returned a validated exploration game.

The room-photo discovery was completed through normal browser keyboard-access controls. Required clues, an activation, and the final source object were visited. Two optional objects remained optional. Saving, adding an additional requirement with an editable clue, applying it, and undoing it retained earned progress and the achievement. The discovery editor opened without requiring a nonexistent player. A separate synthetic browser fixture exercised canvas selection, ordering, hints, replay and save/reload; that fixture is not counted as live inference.

Local Meta SAM 2.1 tiny was installed and called through a private serialized process. Four crayon source crops retained original RGB pixels with masks; a cached repeat took 646 ms. Photo testing exposed a fragmented cat-body mask, which was rejected in favor of the original crop while three other details passed. This is SAM 2.1, not SAM 3.1. No claim is made that every photograph receives a clean silhouette.

Evidence is stored outside Git in the task's `outputs/doodlume-image-native-2026-11-02` directory. The qualification summary preserves the initial 14/16 outcome and the two subsequent successes. Full free-exploration and final-release platform playthroughs remain separate verification work; accepted geometry alone is not completion evidence.

Final integrated checks: all 40 focused tests, TypeScript and production build passed. The credential scan passed for tracked files, staged blobs and the browser build. Discovery zoom and Fit image were exercised in the real browser without changing earned progress; a 390×844 viewport had a 390px document width, a 364px canvas and a separate 51px controls footer. A fresh supplied dinosaur drawing then passed the complete UI upload → live Meta interpretation → local SAM → review → adventure-render flow. Review reported two original-art objects and one precise cutout. The new adventure was started and saved, not completed. The exploratory watercolor was started and saved with one of three items; its remaining route is not yet verified. No completion was injected.

## Category quality-floor pass — 2 November 2026

The per-category minimum target is recorded in QUALITY-BAR.md and AGENTS.md. It is a release target, not a claim that all categories have already earned a9/10.

Observed fixes: a new exploration guide has a screen-sized dual-contrast focus; canvas points steer through real physics with slowing near arrival, manual takeover, cancellation and collision-stop feedback. No collected or completed state is assigned by steering. Fresh games do not award items before deliberate navigation. The compiler also starts exploration outside interaction regions and retains real platform collectibles and source destinations instead of padding a mission with generated duplicates. Unknown source references produce explicit errors. Desktop and phone direction controls, mode-specific help, discovery keyboard pan/zoom/fit and renderer-loading recovery were improved.

Actual browser evidence: the revised watercolor start remained0/3 after starting; one normal canvas click moved the guide across the artwork and produced2/3 through collision/overlap mechanics. The resulting progress was saved. Full route completion remains a separate check. On390×844, document width stayed390, canvas measured364×318.7, and directional controls were48×45. On320×700, document width stayed320 and canvas measured294×264. No console errors were reported in these checks.

A running dinosaur adventure on this Mac recorded6,850 rendered-frame intervals: median8.3ms, p959.2ms, zero intervals over33ms, one active game and one canvas. It was a running scene with an idle player, not an active traversal or physical-phone benchmark. The same session reported first-world readiness500.4ms, that world setup83.7ms, LCP408ms and CLS0.0004. The sixteen-request previous live generation run measured median13.38s and nearest-rank p9522.06s, including its two failed responses. These limited observations do not establish phone or global-network performance.

Offline compatibility replay of the retained final sixteen model replies (using the two latest rechecks) plus the explicit exploration reply passed17/17 with the revised compiler. It used no network or SAM and is not seventeen new inference requests or playthroughs. The focused suite now passes42 tests; TypeScript and production build passed. Remaining gates include broader completed playthroughs, physical-device/assistive-technology checks and actual-user evidence for delight and replay value; those categories remain unverified at the9-range target.


## Desktop authorship and visual release — 2 November 2026

The completed four-round council preceded implementation. The owner then rejected the retained sage/cream identity; that preference supersedes the council's earlier warm-workshop recommendation. The new canonical palette uses obsidian surfaces, chalk text, one citron primary accent, locally served Fraunces world titles and Manrope functional typography. Creation, review, library, rules, editor, loading and focused play were inspected in the actual desktop UI. Source artwork retains its own colors. Desktop direction buttons are absent; mobile optimization was paused at the owner's instruction. No actual audience study establishes attachment or a numeric quality score.

Platform assembly now uses recognized source surfaces and artwork as actual foreground geometry, with a bounded reachability check and only needed introduced connectors. The original image remains inspectable. The renderer uses source-derived low-frequency atmosphere rather than a crisp second copy of the character/page. Discovery retains the complete photograph and settles found objects into small checks. There is no filename or sample-identity routing in the compiler; validation inputs do not set an input limit. The engine remains bounded 2D gameplay, rather than arbitrary genre or 3D simulation.

Manual edits can reposition, resize, rename and relink existing supported objects through atomic stable-ID revisions. Actual UI verification changed a photographed pillow's x position from671 to681 and renamed it, applied the revision, then undid it. Five required actions, optional progress and the earned completion remained intact; the resulting world was saved. Existing object role and source-art identity remain protected. Undo history and personal-world restoration use the existing library contract; the last saved personal world reopens paused. New source imports and cancellation do not replace the existing world before acceptance.

A fresh actual UI upload of the supplied crayon-platform photograph used Fireworks-hosted Meta Muse Spark Open and local Meta SAM2.1. Review reported7 source objects and7 precise cutouts. The resulting game retained the actual drawn platforms and one playable dinosaur, was accepted, started, saved, backed up, and imported through the ordinary library UI into the main preview. This final new platform game was not played to completion. Offline compatibility replay accepted17 retained model replies without network or SAM; those are compatibility checks, not17 new generations or playthroughs. Earlier complete robot/discovery sessions remain separate evidence.

Final integrated verification passed TypeScript, all44 focused tests, production build and whitespace checks. The focused suite covers atomic updates, undo, gate links, malformed backups, source placement, model/provider failures, source assembly and rendering bounds. Actual UI checks additionally exercised create, saved-world library, source selection/edit/apply/undo, save/reopen, discovery focus and the fresh model-to-review-to-play flow. The staged credential scan passed: configured secrets were absent from tracked/staged files and the browser build, and credential paths are ignored. Full active traversal across every retained input and actual user retention remain unverified; no perfect score or winning outcome is claimed.
