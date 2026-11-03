# Doodlume — submission checklist

Updated: 3 November 2026, IST. The product is the priority; the 2:58 film is the acceptance journey we work backward from. Checked items have evidence. Implemented changes awaiting browser checks remain unchecked.

Deadline: **4 November, 9 PM EST / 5 November, 7:30 AM IST**. Participant guide: judging 5–8 November; finals 9 November at noon ET. Submit before the deadline; judging days are not extra build time.

## The judge's first 178 seconds

| Time | Product must prove | Acceptance |
|---|---|---|
| 0–10s | The creator's recognizable drawing becomes playable. | Real source and real gameplay; no substituted scene or invented instant generation. |
| 10–25s | A clear reason to exist. | People who can imagine/draw a game can create and alter play without programming it. No unsupported audience/retention claims. |
| 25–65s | An actual creation journey. | Upload/draw → Meta interpretation → review → play; generation edits/time cuts identified. |
| 65–95s | Authorship continues after generation. | One meaningful change to a platform, interaction or rule causes an observable change in the same world. |
| 95–115s | Input variety and different interactions. | Illustrated adventure, crayon drawing and photo exploration/discovery; labelled examples, not promises about all inputs. |
| 115–140s | Meta is essential, engineering is real. | Name actual models and their jobs; show interpretation, original-art extraction, validated scene and runtime. |
| 140–163s | The work belongs to the creator. | Save, leave, reopen; progress/edit preservation and recoverable mistakes. |
| 163–178s | Memorable invitation. | Recognizable final gameplay, product name, working creation action/live destination. |

## Rules and research

- [x] Authenticated participant guide read and captured in `outputs/submission/official-guide.txt`.
- [x] Rubric verified: impact 30%, Meta tooling 25%, technical depth/execution 20%, demo 25%.
- [x] Public-repository, working-video and event-created-work requirements identified.
- [x] Nineteen named current-event projects and five recent CV comparisons documented in `SUBMISSION-RESEARCH-2026-11-02.md`; author claims distinguished from tested results.
- [x] Authenticated Discord build posts and a current X project thread inspected; coverage is a sample, not the entire competition.
- [x] Consolidate Discord/X findings and exact video observations into research ledger.
- [ ] Audit event contribution dates and asset rights for the final submission. Commit dates alone do not establish when code was written.
- [ ] Prepare public repository release; current private visibility must not be silently changed.

## First page

- [x] Implemented concise proposition, one primary creation action, drawing alternative and studio access.
- [x] Implemented three real recorded example worlds with distinct source types; playable on the homepage, explicitly labelled examples.
- [x] Verify first-view composition at 1440×900, 1280×720 and 1024×600; no clipped/overlapping text or misleading controls.
- [x] Verify all three examples open, pause/resume and switch without state leakage; the drawing example completes through keyboard play.
- [ ] Verify the homepage Play again control after completion on the final build.
- [x] Verify upload/draw actions, browser Back and return-to-studio preserve the current session.
- [x] Inspect lower page and keyboard access; remove unnecessary content.

## Creation, editing and play

- [x] Verify one fresh real Meta request through the current UI; retain provider/model and actual outcome.
- [x] Verify a fresh world’s source-art move/resize, Apply, Save, reopen and Undo in the live browser; source pixels and collision coordinates share the same transform.
- [ ] Verify keyboard landing on that edited ledge after the Mac is unlocked; the visual edit proof is not substituted for this play check.
- [x] Verify Save and open / Discard and open / Stay in the browser, including same-entry reopen.
- [ ] Fault-test failed/stale saves; guards are source-reviewed, not browser fault-tested.
- [x] Verify existing-object Delete preserves edits; explicit Reset and Undo work.
- [x] Verify selection stays visible on collected objects and contrasting artwork.
- [x] Verify library metadata and mixed-title action rows.
- [x] Verify contextual gameplay guidance and final-clue progress.
- [ ] Verify completion names the real world/result and remains readable with long names.
- [ ] Fix any defects exposed by these checks before marking the journey complete.

## Film and submission package

- [x] Reverse storyboard tied to the actual weighted rubric above.
- [ ] Capture actual interaction footage and proof screenshots only after verifying the journey.
- [ ] Produce an exact 178-second edit, readable without sound; separate accelerated generation from realtime play.
- [ ] Check exported duration, picture, captions, audio and opening/closing frames.
- [x] Add verified model-use explanation, partner feedback, README quickstart, event-contribution statement and demonstration instructions.
- [ ] Provide an accessible live product and video link; check from a signed-out browser.
- [ ] Prepare optional short social cut and X post draft; posting is not authorized by this checklist.
- [ ] Submit final project only on explicit instruction; preserve a submission receipt.

## Current status

Homepage, editor and persistence checks have browser evidence in `outputs/submission/qa-homepage`, `qa-editor` and `qa-persistence`. A new real request produced Dino's Star Hop, then reached its destination using ordinary keyboard input (`qa-creation`). The edit-to-play check exposed a source-art layer defect. Its repair now passes fresh-request, editor, runtime-artwork, save/reopen and undo checks in the browser (`qa-creation/results.json`). Actual keyboard landing on the changed ledge is pending because the Mac locked during verification. Raw homepage/example footage and narration files are captured locally; no final film, public deployment or completed submission is claimed.

Newly discovered gates: source-object visual bounds must remain aligned with edited collision geometry; fresh game input now works immediately without pause/resume, with browser proof in `qa-homepage/review.json`. These are functional requirements for the film, not issues to hide during editing. Restart and map focus restoration now pass browser DOM-focus checks on the final build. Mute/fullscreen use the same helper; held-key gameplay after restart still awaits unlock. Source provenance is documented in `SUBMISSION-PACKAGE.md`; final release commit and owner declarations remain pending.
