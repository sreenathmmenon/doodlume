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
- [x] Verify homepage Play again: completed, replayed and completed again using ordinary keys; evidence `qa-homepage/24-play-again-completed.png`.
- [x] Verify upload/draw actions, browser Back and return-to-studio preserve the current session.
- [x] Inspect lower page and keyboard access; remove unnecessary content.

## Creation, editing and play

- [x] Verify one fresh real Meta request through the current UI; retain provider/model and actual outcome.
- [x] Verify a fresh world’s source-art move/resize, Apply, Save, reopen and Undo in the live browser; source pixels and collision coordinates share the same transform.
- [x] Verify keyboard landing on the edited ledge and completing the route in a clean recording after unlock; restart/replay work without refocusing.
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
- [x] Capture a continuous fresh request→review→play→edit→play→save→reopen take; interrupted recording explicitly excluded.
- [x] Produce a 178-second local edit with readable scene captions, synthetic narration and a labelled generation time cut; gameplay stays real time.
- [x] Check export streams: 178 seconds each, 1920×1080, 30 fps, 5,340 frames, no decode errors; inspect scene/closing frames and captions; technical audio peak −1.5 dB. This is frame and technical audio review, not a claimed human full-motion listening review.
- [x] Add verified model-use explanation, partner feedback, README quickstart, event-contribution statement and demonstration instructions.
- [ ] Provide an accessible live product and video link; check from a signed-out browser.
- [ ] Prepare optional short social cut and X post draft; posting is not authorized by this checklist.
- [ ] Submit final project only on explicit instruction; preserve a submission receipt.

## Current status

Product implementation `5fbd5b8` and documentation `7d474dc` are pushed to the private repository. Homepage, editor and persistence checks have browser evidence in `outputs/submission/qa-homepage`, `qa-editor` and `qa-persistence`.

The Mac is unlocked and the previously blocked play checks now pass. A clean continuous recording shows a fresh Meta request creating **Dino's Purple Leap**, completion, a widened/raised source platform, replay through the changed route, Save and open, and reopening with the edit and completion preserved. Homepage Play again also completes a second time. The interrupted take is excluded. Evidence and precise recording events are in `outputs/submission/qa-creation/results.json` and `footage/continuous-events.json`.

The local film is `outputs/submission/video/Doodlume-2m58s-demo.mp4`; export checks are in `video/export-verification.json`. Recorder controls were cropped outside the game, and clip color formats were normalized to preserve picture/narration timing. Captioned scene boundaries, raw clips, narration text/audio and a reproducible local edit script are retained in that folder. The room example is explicitly identified as AI generated. No public deployment, public video link or completed submission is claimed.

Still open: public release and signed-out access, owner contribution/asset declarations, optional social cut, fault-injected save checks and final submission. A successful known-input journey does not establish universal image support or a quality score.
