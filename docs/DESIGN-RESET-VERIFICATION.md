# Ink & Play verification — 3 November 2026

This is a visual-system and interaction pass. It does not claim new model generalization, universal gameplay generation, external endorsement or a perfect score.

## Implemented

- Shared original wordmark/favicon; cool-white, ink and vermilion semantic roles; Fraunces editorial headings and Manrope UI.
- Art-proportioned homepage stage with adjacent image choices and explicit selection cues. A rough drawing links directly into its real playable example.
- Coherent fresh studio sample, restrained white Play control, compact creation dialog and consistent creation vocabulary. Personal saved worlds still take precedence.
- Fullscreen state follows the browser; rejection leaves gameplay intact; drawing exits fullscreen before opening its dialog.
- Distinct focus role, inset canvas indicator, native dialog plus explicit boundary wrapping that ignores controls inside closed disclosures.
- Lightweight previews/thumbnails, original source assets preserved, and corrected engine code splitting.
- Height-aware studio frame reduces empty mattes while keeping the toolbar visible at the tested desktop sizes.

## Recorded browser evidence

Artifacts are under `output/playwright/` in the active checkout. These checks used the running production build at localhost5192, not a static mockup.

| Check | Observed result |
| --- | --- |
| Home 1280×720, 1440×900, 1920×1080 | No horizontal overflow; Play and primary creation are visible. Main image remains contained. |
| Home 390×844 | Basic no-horizontal-overflow sanity passed; mobile polish is outside this pass. |
| Studio three desktop sizes | No horizontal overflow; toolbar bottom641/821/1001px respectively, within viewport. |
| Create empty/uploaded, 1280/1440 | Disabled prerequisite is explained; selecting image shows its preview and enables Make game. No inference invoked. |
| Play/pause/resume/Original | Passed. Full rescue replay earned2/3, retained2/3 through Pause/Original, attached the antenna to complete, and restarted to0/3. |
| Fullscreen | Enter and reactive Exit label passed; drawing exits fullscreen and cancel resumes play. Injected request rejection leaves Pause available and does not expose game Retry. |
| Source-to-play lower link | Opens actual cat example with correct selected state. |
| Dialog keyboard | Initial native Tab excursion to body was found. After excluding closed-details descendants from the boundary calculation, all40 forward/reverse steps stayed inside. Escape restores the opener. |
| Draft return | Typed idea survives homepage/studio return. |
| Saved-world return | Saved personal rescue copy reopens after reload and remains editable; the fresh sample does not replace it. |
| Example request failure | Error and recovered frame both746.67×420px; recovery succeeds. Caption adds1px vertical position change onready, without frame collapse. |
| Expanded object controls | Replay exposed the panel covering Pause; moved the expanded panel into page flow. Repeated full playthrough passed with Pause reachable. |
| Font fallback | Fonts delayed1600ms. Headline height53.90625px unchanged; width461.125→455.578125px after Fraunces loaded; no overflow. |
| Reduced motion | Homepage CTA transition duration0s under reduced-motion preference. |
| Contrast pairs | Main text14.33:1; secondary5.41:1; white on primary5.78:1; focus on white7.42:1. These are scoped measurements, not complete accessibility certification. |
| Engine loading |0 Phaser requests before Play;1 after. Previously the shared CommonJS helper pulled Phaser into the initial entry. |
| Asset size | Three thumbnails total13,592bytes. Rover/cat/clockwork previews338,156/144,650/242,138bytes. Full originals unchanged. |

The browser fixture uses an isolated automation profile. Its saved copy is verification data, not an edit to the owner's existing worlds. The native file-picker automation initially interrupted a compound script; the completed upload check used the real file input directly. That automation interruption is not represented as a product defect or a passed run.

## Review and code checks

Ten separate simulated reviewer agents contributed four rounds each. The complete original transcript and five decisions are in `docs/reviews/2026-11-03-design-council.md` and `.json`. All ten recommend adoption, with their conditions and dissent preserved. Some final seats wrote before the refreshed studio/persistence evidence; moderator verification is recorded separately rather than rewriting their words.

Production build and TypeScript checks pass. Three targeted example-copy/library regressions pass. Credential scanning checks tracked files, staged blobs and generated browser output without printing secret values. No new broad unit-test suite was added.

## Limits and remaining product work

Real-user comprehension/preference, screen-reader and physical-device checks, Safari/Firefox coverage, sound review, production CWV and broad image-to-game quality are not established by this pass. The general gameplay creation weakness remains separate. Legacy radius declarations are only partially normalized; new UI must follow `DESIGN-SYSTEM.md` and touched legacy components should converge without a blanket rewrite.
