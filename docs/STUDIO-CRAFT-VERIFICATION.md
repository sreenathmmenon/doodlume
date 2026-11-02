# Desktop studio craft — November 2, 2026

## Delivered

- Full-width game workspace; the permanent source sidebar is replaced by an Original thumbnail that opens the existing source inspector.
- Manrope world titles, quieter navigation, consistent contextual edit/update/rules/save commands, and a single strong Play/Resume action.
- Sharp paused artwork rather than a blurred scene, with pause overlays contained inside the game canvas so discovery controls remain usable.
- Clickable upload tile, shorter creation labels and an image-led saved-world gallery with import/backup controls under a disclosure.
- Readable keyboard discovery controls, corrected focused-play Save width, accurate completed-world labels and truthful feedback for optional discoveries after completion.

## Observed verification

- Production build and TypeScript check passed.
- Eight focused discovery-progress, revision and library tests passed.
- Credential scan and whitespace/diff checks passed.
- Inspected desktop studio at 973×724 and QA surfaces at 1280×720. No 200% zoom, 1440px or mobile certification is claimed.
- Original inspector opens and restores focus; editor opens and cancels; the new toolbar preserves existing handlers.
- Long-title layout inspected; full editable title retained. Final ellipsis/title attributes are present; a separate final long-title screenshot was not taken.
- Saved photo world loaded with 5/5 required. Actual keyboard selection changed optional progress from 0/2 to 1/2 while keeping required completion. Feedback read “Detail found.” Pausing preserved that state. Test progress was not saved.
- Final expanded keyboard layout showed the selector and Inspect object button together with no pause overlay over the footer. Gallery showed eight stored worlds and correct completed labels.
- No new paid generation or new full game completion is claimed for this UI pass.

## Review record

Local artifacts: `outputs/studio-craft-council/`. Four rounds, ten simulated expert-inspired seats, forty contributions; structural validator passed. These are independent simulated reviews, not actual public-figure participation or approval. The report preserves dissent and limitations. Output screenshots and transcripts remain local, outside Git.

## Material unresolved game-art defect

The detailed Clockwork Vine Ruins source was displayed as fragmented illustration crops and generic terrain strips. This redesign does not fix that.

Code inspection found three contributing risks:

1. Platform rendering replaces the full original backdrop with mean-color atmosphere; original detail is deliberately discarded there, unlike discovery/roam mode.
2. Creative adaptation can fall back from unsuccessful source-aligned assembly to a reconstructed route with artless floor/connector geometry. The exact branch used by the stored Clockwork world was not established.
3. Crop/mask validation does not establish complete object extraction for textured or connected artwork. Creative compilation precedes a drawing-box refinement step intentionally designed for a different input class.

Proper follow-up requires explicit source-assembly failure reasons and a source-aligned art policy, with original scene geometry and moving-actor removal handled together. Simply enabling the full image backdrop can introduce duplicated actors and misleading collision geometry. Recoloring the strips or forcing another game mode would conceal the issue rather than correct it.

The UI pass is verified within the stated scope. Whole-product production quality and 10/10 scores are not established.

## Subsequent simplicity pass

- Kept Original, Edit and Save visible; moved image update, rules, undo and version/adaptation details into More world options. Removed duplicate navigation/help and repeated status captions.
- Focused play hides the studio heading and authoring controls. Objective, progress, play controls and Back to studio remain accessible.
- Creation puts the image and optional idea first. Gameplay choices use a native disclosure whose closed label retains the selected mode.
- Editor position/size fields use a native disclosure. Existing field handlers and object identities are unchanged.
- Library width adapts for one or two entries; larger collections retain the gallery layout.
- Verified at 973×724: More → Rules, More → Update image, library and Escape dismissal, creation mode selection and summary (restored to Auto), editor object selection and precision disclosure, play/pause and studio return. Saved world remained available after reload. Inspected screenshots are in `outputs/simplicity-pass/`.
- TypeScript and production build passed. No new generation or broad game-quality claim is made by this UI-only change. The game-art defect above remains open.

## Full desktop UI audit and correction — November 2

This pass inspected the reachable studio, focused play, native fullscreen, creation,
sketch, source inspector, editor and precision fields, world options/rules,
library (including lower content), help and settings. It used live UI interactions,
DOM bounds, screenshots and ten independent simulated review seats across four rounds.
The full local record is `outputs/desktop-ux-audit/`; it is not an endorsement by
real designers and does not certify every product state.

### Defects corrected

- Returning from play centered only the canvas and clipped the top navigation.
  Both studio and focused layouts now return to the page top.
- Native fullscreen included only the stage, removing its transport, zoom,
  keyboard, help and exit controls. The full world panel is now the fullscreen
  surface, with explicit Exit full screen and Back to studio behavior.
- Discovery controls occupied competing dark bands. A stable portal places
  contextual controls in the existing light control area; measured canvas bounds
  exclude controls and the scene lifecycle dependencies are unchanged.
- Expanded keyboard play could push controls out of the first desktop viewport
  and orphan help/fullscreen buttons. View actions stay grouped; contextual
  controls wrap and the game area yields space to the toolbar.
- Title rename affordance floated away from short names and was hidden by legacy
  CSS at smaller desktop widths. Its position now follows measured title text,
  with ellipsis for long titles and the full editable value retained.
- Create repeated a heading and misaligned the image/idea columns. The redundant
  heading is removed and both labels share a baseline region.
- Sketch framed non-drawable margins as paper. Only the real drawable canvas now
  has a boundary; swatches have larger hit regions and named colors; redundant
  instructions are removed. Pointer coordinate calculations are unchanged.
- Modal dismissal could lose keyboard focus. Related dialogs retain the original
  workspace opener, while a replacement dialog or explicit caller focus wins.
- Canvas keyboard focus now has a white/dark inner border visible over artwork.
  Tooltips and selected states clarify existing icon and drawing controls.

### Evidence from this build

- TypeScript, production build, diff checks and credential scan passed.
- Eight targeted tests passed for revision identity/progress/undo, discovery
  progression and library preservation. No broad new unit-test suite was added.
- Inspected desktop viewports 973×724, 1024×768 and 1280×720; native fullscreen
  used 1512×949. At 1024×768 the expanded toolbar ended at y=740 with scrollY=0,
  and no horizontal overflow. At 973×724 the platform toolbar ended at y=696.
- Fullscreen keyboard discovery inspection increased optional progress from 0/2
  to 1/2 while retaining required 5/5. Exit returned to focused play; Back to
  studio returned navigation. Test progress was not saved.
- Fullscreen help opened; Escape restored focus to Controls and help. More →
  Escape and More → Rules → Escape restored More. Create → Sketch → Create →
  Close restored New world. Editor selection/precision inspection → Close
  restored Edit world without applying changes.
- A real pointer stroke enabled Use this drawing. Closing and reopening visibly
  restored that stroke. The temporary audit stroke was then cleared. Restored
  drafts are raster images; undo of strokes made before reopening is unavailable.
- Keyboard traversal from requirements into the game visibly showed the two-tone
  focus border. Static token contrast calculations were recorded; they are not
  a WCAG compliance audit or a substitute for every rendered state.
- Long-name layout retained the full value without overlapping title actions.
  Screenshots include before/after creation, sketch, fullscreen, controls and studio.

### Still outside the evidence

No new provider generation, real-user desirability study, measured frame-rate or
latency benchmark, 200% text-zoom pass, cross-browser certification, fresh complete
adventure playthrough or edit/apply/undo focus chain is claimed in this pass.
Mobile remains paused by owner instruction. The game-art defect described above
remains unresolved; interface polish does not repair source-to-game fidelity.
