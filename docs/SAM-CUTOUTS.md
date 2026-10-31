# SAM 3.1 artwork cutouts

Implemented October 31, 2026. This is a coded integration with local protocol verification, **not a live drawing-recognition result**.

## Product behavior

Muse Wonder/Spark or Baseten-hosted Muse Spark Open interprets the page into supported game roles and bounding boxes. The studio then sends those boxes and the normalized original page to SAM 3.1 for masks. Original image colors, including white-filled character interiors, are retained inside accepted masks. The image canvas stays the size of the interpretation's original box: tighter SAM bounds do not stretch the artwork or move game geometry.

Both first-drawing interpretation and revised-page additions use this path. Revisions keep existing object identities and progress. SAM does not invent game rules, animate characters, rebuild hidden scenery, or turn arbitrary photos into verified games.

The first-world preview and update editor show original-art thumbnails on a transparency checker, with a precise/paper cutout label and an explanation per object. Inspect these before accepting. Manually redrawing an object's artwork clears its previous extraction label.

## Configuration and calls

- Direct Meta interpretation enables SAM by default, using the same server-side `MODEL_API_KEY`.
- With Baseten interpretation, SAM is off by default. Explicit `SAM_ENABLED=true` plus `MODEL_API_KEY` enables the separate direct-Meta call; it does not use the Baseten key or credits.
- `SAM_ENABLED=false` selects the existing white-paper removal method only.
- SAM model ID is `sam-3.1`, sent to `https://api.meta.ai/v1/responses` with streaming, box prompts, compact masks and confidence values.
- One batch holds at most sixteen objects. Initial interpretation permits twenty-four objects, so it can need two SAM calls; revised-page comparison permits twelve, so it needs at most one. Every attempted call reserves from the same `MAX_MODEL_REQUESTS` budget as interpretation. No automatic retries or account switching.
- Each SAM batch has an eighteen-second timeout within the overall sixty-second action timeout. User cancellation aborts the action, rather than silently accepting a fallback world.
- `/api/status` reports enabled/configured state without exposing the key. Configured does not establish working access.

The official `@meta-sam/parser` dependency is pinned to `0.1.0`, installed from npm. Its parser and decoder handle the documented custom mask encoding; no OpenAI inference is used.

## Explicit fallback

A missing/duplicate mask, low confidence (below 0.5), implausibly displaced box (IoU below 0.3), empty artwork, malformed payload, incomplete response, access error or time limit can select paper-background removal. The review labels that object as a paper cutout, never as SAM output. These confidence/overlap thresholds are initial engineering guards, not calibrated quality claims. Background removal remains limited to suitable drawings on light paper.

Requests are not retried after a failed batch. Output bytes, event counts, record counts, image dimensions and mask allocations are bounded before official parsing. Provider error bodies, keys and image content are not logged. The app does not fetch image or mask URLs supplied by a model.

## Verification

Nineteen focused tests include three new pipeline checks covering:

1. First drawing → Muse-shaped response → real official mask parser → actual RGBA pixels, including retained white interiors and unchanged placement.
2. Failure, incomplete/empty/malformed/oversized/displaced/low-confidence results, cancellation, budget refusal and explicit cross-provider configuration.
3. Revised-page mask application with unchanged original objects, retained collected items, and sixteen-object batching.

These use a test-only transport and Meta's published mask sample as a synthetic wire fixture. No mocked model mode or fake successful inference is exposed by the product. Real SAM latency, cost, recognition and edge quality require live access and trials on 5–20 materially different drawings. Physical photographs and magazine images are future scope; this increment does not establish their reliability.

The actual cutout review component was rendered in a separate, explicitly labeled synthetic QA page and inspected in Chrome at desktop size and 390×844. Both methods and transparency were legible; document width stayed 390 pixels with no horizontal overflow, and the disclosure closed correctly. The running studio's settings also show SAM configuration separately from interpretation access. This UI inspection does not establish live model accuracy.

## Primary references

- [SAM segmentation requests and limits](https://dev.meta.ai/docs/sam/segmenting)
- [SAM output grammar](https://dev.meta.ai/docs/sam/reading-segmentation)
- [Official parser and decoding API](https://dev.meta.ai/docs/sam/client-libraries)
