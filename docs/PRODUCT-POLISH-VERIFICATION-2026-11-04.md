# Product polish — November 4

Recovery tag `pre-product-polish-2026-11-04` was pushed before implementation, on `94d668c`. This is a functional release with evidence and known limits, not a perfect-score certification.

## Experience changes

- Home keeps the artwork-led design and adds four selectable examples: resource allocation and rover movement, a real photograph with an actual Meta-generated watering activity, a rough drawing care activity, and the existing keyboard adventure. Credits and synthetic/authored provenance are explicit. Original imagery is preserved. The new photo uses the same generic world runtime.
- A played example can become a personal studio copy with its artwork and earned progress retained. Existing unsaved work uses the normal Stay/Discard/Save guard.
- Creation asks Drawing or Photo explicitly instead of silently calling every upload a drawing. JPEG drawings remain supported. The waiting illustration animates without invented percentage milestones; reduced motion is static. The visible elapsed timer is actual time. Stop retains source and intent.
- Review says Automatic cutout rather than Precise cutout. The preview's collapsed canvas was caused by an unportaled controls flex basis; direct-shell controls now take their natural height.
- Ability authoring presents source, target and outcome, offers a local fresh-run effect preview through the actual reducer, and retains quantities, costs, prerequisites and alternatives behind disclosures. This preview predicts rules; it is not physical animation or a completed prerequisite sequence.
- Object controls open beside the artwork. Simple transfers show the material gain and before/after amount; action relationships, actual delta receipts and selected/recent resource feedback clarify consequences. Duplicate release controls are hidden while the side pane is open. Keyboard controls remain available.

## Automatic-design correctness

Photograph planning now separates visible relationships from proposed gameplay, binds investigation targets to the selected relationship, and rejects the narrow compiled no-op placement case. General self-review asks for earned consequences and actual material identity instead of arbitrary chores or disguised resources. This is guidance plus typed constraints; it does not prove that every activity is compelling.

New gameplay transport specifies the exact source or landmark finish. An unordered final waypoint can no longer silently substitute for the specified destination. Explicit requirements-only completion supports finishing upon the last selected requirement without a hidden extra destination. Deliberate open-ended play is separate. Old omitted finish transports preserve legacy behavior; existing persisted worlds remain readable. Unsupported free movement of a pictured actor now returns a truthful limitation instead of silently driving an unrelated guide.

## Verification performed

- 300 regression checks passed, including new finish binding, old transport compatibility, saved-world requirements completion, preview and handoff checks; final build/typecheck passed. Credential scan passed before staging; repeat scan required after staging.
- Local browser sessions: newly uploaded neutral real watering photo generated an activity, completed through normal object selection/action, saved and reloaded. A second fresh watering generation also completed, saved and reloaded. No game state or generated result was injected.
- Local browser editing: selected actual source, authored a new can-to-pot water action, previewed it, added it, applied it, used the real action, undid it, selected again, repeated it, saved and reloaded. Source amount restored on Undo and reflected the action after reload.
- Homepage normal controls: photo watering, rough cat feeding and rover allocation/antenna motion completed. Personal-copy handoff preserved completion. Unsaved-copy replacement opened the save guard; Save and open saved the previous copy and opened the new one.
- Cancellation retained the exact idea and uploaded photo. Source type was unselected before deliberate choice; Make game was disabled until choice.
- Raster checks at 1280×720, 1440×900 and 1920×1080 covered homepage/photo, controls, editor, busy, review and completion across these sizes, not every possible state at every size. Fixed review screenshot shows full photo rather than a thin strip.

Evidence is local under ignored `outputs/verification/product-polish-2026-11-04/`, `outputs/verification/activity-design-2026-11-04/` and `/private/tmp/codex-playwright-mcp/polish-*`. Raw model runs and failures are retained privately. No raw request, user image or model response was added to the repository.

## Remaining limits

Automatic selection of rich activities on unfamiliar images remains inconsistent. The agent's 14 runs / 30 actual model calls included compiled worlds, focused correction/clarification and failures; compilation alone was not scored as quality. After the finish fix, an abstract drawing bound its center goal correctly but still described modest collection with more ambitious wording. An explicit rocket movement request returned a truthful clarification because source-actor free roaming is unsupported. A neutral café drawing exhausted its bounded generation after invalid/weak plans, including unsuitable resource identity. These are retained failures/limitations, not solved gates.

Some model wording can still overstate the resulting mechanic. Provider stalls remain possible. Moving actor extraction/background repair is distinct from fixed photo resource play. Watering changes authored game quantities, not photographed water, plant growth or fluid physics. The four examples demonstrate different authored/source-supported interactions; they do not establish universal automatic input quality.

Local browser modal-background raster sometimes omits the paused WebGL artwork while a native dialog is open. Canvas size/readiness remain correct and the artwork returns on closing without Play. Disabling backdrop blur did not change this. No speculative renderer restart was added; the review preview collapse is a separate verified fix.

## Hosted and final checks

Deployment `7cea4658-54ca-4d42-89d2-260691523f03` reached SUCCESS with source `119f8d8`. Hosted health/readiness/homepage/photo example passed; credential/source URLs remain inaccessible and unrelated-origin API access was rejected. The existing completed watering game reopened on the new release.

A fresh hosted upload of a different bathroom photo produced a faucet→basin water-quantity game in46.910s without review, completed through normal controls, saved and fully reloaded with completion intact. This verifies a second source-supported material relationship; it does not establish richer automatic gameplay. Locally, the post-contract abstract drawing was also imported normally with empty progress, completed by its actual three clues and source-bound final center, saved and reloaded. Its ambitious “calm the vortex” wording remains an identified mismatch with its modest pointing mechanics.

A final homepage switching check caught an old preview image remaining visible briefly under the newly selected scene's caption while the new image loaded. The image element is now keyed by scene/source view, preventing that stale image identity. This is a presentation fix; example mechanics and source files are unchanged.
