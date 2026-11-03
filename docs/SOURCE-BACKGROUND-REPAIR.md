# Local source-background reconstruction

The source artwork is preserved as the original input. Meta SAM supplies object silhouettes in the extraction pipeline. **LaMa is a separate, non-Meta model** that predicts the background exposed by moving those objects; it is not part of the Meta model contribution.

`server/source-background.ts` uses LaMa only when the existing local SAM Python environment and a preinstalled checkpoint are available. Default checkpoint: `~/.cache/doodlume-sam-runtime/models/big-lama.pt`. `LOCAL_LAMA_CHECKPOINT` can point to an installation elsewhere. `LOCAL_BACKGROUND_REPAIR=classical` disables LaMa explicitly. There is no request-time download, dependency installation, credential use or remote inference.

The checkpoint used in verification is IOPaint's TorchScript export: https://github.com/Sanster/models/releases/download/add_big_lama/big-lama.pt . The published integrity checksum, verified before loading, is MD5 `e3aa4aaa15225a33ec84f9f4bc47e500` (205,669,692 bytes). IOPaint's adapter documents that source and checksum: https://github.com/Sanster/IOPaint/blob/main/iopaint/model/lama.py . Original research/code: https://github.com/advimman/lama . The original repository labels its code Apache-2.0; the separate pretrained-weight commercial license remains unclear upstream. Do not redistribute or describe the weights as cleared for commercial distribution without resolving that question.

The repair mask expands each selected object's silhouette by 1% of image long edge, bounded to 8–20 pixels. This is an explicit object-edge/halo repair region, not a claim that only exact foreground pixels change. LaMa receives local image context around connected regions; output is composited only within the expanded region. Every pixel outside it, including alpha, remains identical to the supplied source. At most 16 separate regions are processed; a larger fragmented mask uses one bounded whole-image pass. Inference input is limited to four million pixels, each inference context to 1024 pixels per long edge, one active repair and a 60-second process timeout. Original source files are never overwritten.

When weights are absent, the detailed result identifies `classical` neighboring-pixel repair. If the local runtime is absent, the caller identifies interpolation fallback. A configured learned-model failure returns an actionable error rather than silently claiming learned reconstruction. Backdrop `artNote` diagnostics record the actual method through compiler integration.

## Inspected evidence

`outputs/verification/object-gameplay/rover-lama-expanded.png` uses the actual rover source and corrected source-object masks. The 16-pixel expanded region contains 42,560 pixels. The measured count of changes outside that region is **zero**. The local trial took approximately 8.6 seconds; no paid inference was used. Compared with the original classical result, orange terrain and platform outlines continue through the removed rover and crystal regions rather than leaving horizontal smears or pale object silhouettes.

This is evidence for the inspected illustrated source, not universal reconstruction quality. The rover's long headlight beam lies beyond the selected repair regions and remains in the source background; it is not arbitrarily erased. Long shadows, illumination and missed parts need a correct explicit removal region. Mask quality and repair quality remain separate acceptance checks.

One authorized Fireworks FLUX Kontext Pro workflow request returned HTTP 404, so no generated image was evaluated. Read-only model metadata subsequently returned READY: the failed route is not evidence that the image model itself is unavailable or low quality. No cloud image endpoint is integrated.
