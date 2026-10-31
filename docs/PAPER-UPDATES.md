# Paper-update increment — October 31, 2026

This extends the same-world editing milestone. The manual page-to-play route is working. Automatic Meta comparison is implemented and contract-tested, but live recognition and a complete first-drawing → model → play → revised-photo loop still require a working provider key.

## Product behavior

**Update page** preserves the running adventure while showing the current and revised page side by side. A person can upload a revised PNG/JPG/WebP or draw over the current page. The sketchpad keeps existing artwork on a protected base layer: undo, clear, and erasing affect only new strokes. It rasterizes vector pages at a useful drawing resolution instead of using a tiny intrinsic SVG bitmap.

New strokes are isolated from that base as transparent original artwork, with their actual page bounds. Choose a role and review the new object in the existing world. All new strokes in one update form one object; draw one object per update. The role is explicitly selected by the person, not inferred or claimed as AI. Authored examples have stylized page/world layouts, so adjust their transferred placement in review.

The review supports page/world views, new-object role/name/geometry corrections, explicit lever connections, removal, and extra additions. Existing objects remain protected. Applying requires a checked review confirmation and valid placement. The accepted source page becomes the current world page; undo restores its earlier page and objects while preserving later progress on surviving entities. Saves retain both pages through their revision checkpoints.

## Automatic comparison adapter

`POST /api/amend` receives the current world metadata, its source drawing, and the revised drawing. Frontend requests omit existing object artwork because comparison only needs the two pages and stable identities/geometry. Both calls and initial interpretation share the same single-flight limit, request budget, provider boundary, timeout, and cancellation behavior. No request switches billing providers automatically.

The selected Meta model receives both images in a single multimodal request and an additions-only schema. Existing IDs cannot be reused. New IDs are remapped locally and lever targets preserve existing gate IDs or map to their corresponding new gate IDs. Unknown gate targets, unsupported roles, out-of-page boxes, duplicate geometry, empty artwork, and invalid worlds fail before acceptance. An unresolved lever is left unresolved for human selection; no gate is picked on the person's behalf.

Model-provided evidence and review flags appear with the proposal. These are qualitative model judgments, not measured confidence probabilities. The review remains mandatory even for a proposal labeled high confidence.

Automatic comparison starts only from a world created from an original Meta interpretation. Authored examples support the complete manual path, without pretending that their stylized sample drawing is registered to world coordinates.

## Verification

- Twelve focused checks pass. Four new server checks use an injected test-only transport to verify two-image payloads, real source-ink crops, preserved/remapped gate identities, unresolved connections, and safe failures. They do not demonstrate live model accuracy.
- TypeScript and the production build pass.
- Browser: collected a sunseed, drew a new bridge on the protected original page, transferred its actual ink, corrected placement in review, accepted it, and walked onto it in the same world. The sunseed remained collected.
- Browser: saved and reloaded the revised page and adventure. Undo restored the original source SVG and preserved the collected sunseed.

- Browser: after fixing vector-page resolution, verified a 1440 × 935 sketch layer and repeated bridge transfer/play with clearly preserved bridge rungs.
- Browser: drew a lever on the revised page, selected its role, corrected placement, and selected the original gate. Applying was blocked while the connection was unresolved. The accepted drawn lever opened that existing gate; the bridge and two collected sunseeds remained.
- Browser: returning from review to the page retained the pending ink and selected lever role.
- Browser: uploaded the revised PNG through the real file chooser. The page pair and review fit a 390 × 844 viewport without horizontal overflow. Cancelling the pending update preserved the current world and activated lever.
- Browser: no console errors in the final production build. Model endpoints returned clear HTTP 503 setup errors without a key; the session request allowance stayed at 20. No provider inference was attempted.

## Practical limits and next dependency

There is no calibrated geometric registration, camera pairing, SAM segmentation, arbitrary photo extraction, or support for replacing/removing old scene objects. The adapter checks aspect ratio and asks the model to reject materially shifted, cropped, or perspective-changed photos. This is a rejection/review policy, not a verified registration algorithm. Manual placement remains available.

No working Meta or Baseten key is configured, and no paid inference was made during this increment. With access restored, the next gate is 5–20 materially different original/revised drawing pairs through the real provider: quantify missed additions, duplicate detections, mapping errors, gate identity, latency, and visual fidelity. Fix those observed failures before expanding mechanics or filming a final demo.

Primary integration references: [Meta image understanding](https://dev.meta.ai/docs/image-understanding), [Meta's Baseten deployment guide](https://dev.meta.ai/docs/muse-spark-open/deploy), and [Meta's hosted Baseten cookbook](https://github.com/meta-models/meta-oss-cookbook/blob/main/muse-spark/hosted/baseten.md).
