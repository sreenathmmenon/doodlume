# Doodlume — Ink & Play

The product is a creative game studio. Its visual identity comes from the relationship between personal artwork, playable worlds and useful controls. Source art owns the stage. The surrounding interface should feel calm, precise and recognizable.

## References and direction

[Playdate](https://play.date/) informs the idea of a memorable, welcoming gaming identity. [Lusion](https://lusion.co/) informs interactive product storytelling. [Figma](https://www.figma.com/) and [Spline](https://spline.design/) inform direct creation and tool clarity. These are design references, not copied layouts, commissioned teams or endorsements. No site is objectively the world's best.

The selected direction uses cool white, dark ink and a restrained vermilion action. The homepage pairs editorial Fraunces with practical Manrope. It leads with actual playable artwork, image-led example choices and two concrete creation paths. Studio uses the same brand and controls with denser task-oriented layout. All-black surfaces, sage/cream themes, purple gradients, animated decorative backgrounds and repeated aspirational copy are outside this direction.

## Canonical roles

`src/design-system.css` owns fonts and semantic tokens. New components use those roles; do not introduce another palette or append a competing theme.

| Role | Token / value | Rule |
| --- | --- | --- |
| Workspace | `--workspace` / #f6f7f9 | Cool quiet canvas |
| Control surface | `--paper` / #fff | Buttons, dialogs, toolbars |
| Main text | `--ink` / #20252f | Titles and useful labels |
| Supporting text | `--muted` / #5e6673 | Secondary information, not disabled state |
| Primary action | `--primary` / #b93724 | Start or advance creation |
| Decorative brand | `--brand` / #e4543b | Never assume sufficient text contrast |
| Keyboard focus | `--focus` / #264eb4 | Separate from selection and error |
| Selection | `--selection` + border/check/label | Never color alone |
| Error | `--danger` / #9d1845 | Pair with an explanatory message |
| UI face | Manrope | Labels, body, controls and studio titles |
| Editorial face | Fraunces | Selected display headings only |

Spacing steps are 4, 8, 12, 16, 24, 32, 48 and 64px. Standard control radius is 8px; panels 16px; hero frame 20px. Play is intentionally a white pill over artwork, visually distinct from the filled creation action. Composite frame corners and tiny icon details can differ for their geometry. Desktop action targets are at least 36px; primary actions 44–48px. Normal interface body text is 13–16px. Smaller text is restricted to supporting provenance and ordinal labels.

## Interaction and content rules

- Keep a single obvious primary action per task surface. Home: Make your game. Creation: Make game after source selection. Play: visible Play/Resume.
- Expose Draw as a direct alternative. Explain why a disabled creation action cannot proceed.
- Navigation arrows mean navigation. In-place example selection uses `aria-pressed`, a border, a check and Selected text.
- Authored examples and AI-generated source artwork must be identified truthfully. No synthetic drawing may be described as a real child's work.
- Main source art uses contain; thumbnail crops must never replace the source during play or inspection.
- Preserve studio state when navigating home. Saved personal worlds take precedence over a fresh sample. The fresh sample is the same rescue world introduced on home; it is marked Example and copied before personal editing.
- Native dialogs retain close controls, Escape, focus containment and opener restoration. Focus indicators must remain visible inside clipped canvases.
- Fullscreen is a display mode. A rejected fullscreen request must not become a game error or reset earned progress. Its label follows actual `fullscreenchange`, including browser exits. Leave fullscreen before opening a drawing dialog outside that element.
- Keep helpful object controls and original-art inspection. No decorative dashboard metrics, duplicate marketing sections, autoplay audio or forced animation.
- Respect reduced motion. Hover movement is 1–2px and short; essential state must not rely on animation.

## Loading and assets

The homepage must not request Phaser before deliberate Play or studio entry. Vite keeps shared CommonJS interop separate from the engine to preserve that boundary. Thumbnails and initial previews are lightweight derivatives; full original assets load when needed. The same runtime drives examples and user worlds; no filename dispatches game mechanics.

## Verification and limits

Review the actual home, studio, create dialog and playing states at 1280×720, 1440×900 and 1920×1080. Check keyboard-only paths, original/source toggling, fullscreen failure, draft return, saved-world return, loading/error recovery, reduced motion and basic narrow-width overflow. Screenshot inspection is not evidence of game quality, retention, model generalization or complete accessibility compliance. See `DESIGN-RESET-VERIFICATION.md` for this pass's measured outcomes and outstanding checks.
