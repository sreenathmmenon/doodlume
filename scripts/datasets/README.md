# Public-input evaluation and extraction repair

## Decision

Use licensed public inputs to expose and repair general failures before considering fine-tuning. The existing Meta vision and segmentation models already provide recognition and extraction. A larger dataset does not itself teach the product game design, infer creator intent, or remove the need for a validated gameplay engine.

**No weights were trained or fine-tuned. No dataset IDs, filenames, category lists, annotations or stored model responses are used by production code.** All imported images and raw evaluation outputs live in Git-ignored directories. They are not homepage assets or submission footage.

## Imported inputs

| Source | Actual local inputs | Split | Intended evidence |
|---|---:|---|---|
| [Google Quick, Draw!](https://github.com/googlecreativelab/quickdraw-dataset) | 32 human sketches, eight prompted categories | 16 development / 16 holdout | Imperfect strokes, ambiguous drawings; no semantic object masks |
| [Meta Amateur Drawings](https://github.com/facebookresearch/AnimatedDrawings) | 12 annotated amateur figures | 10 development / 2 holdout | Thin limbs, disconnected details, source foreground boundaries |
| [Oxford-IIIT Pet](https://www.robots.ox.ac.uk/~vgg/data/pets/), [Turing mirror](https://zenodo.org/records/7116591) | 8 photographs with derived binary masks | 4 development / 4 holdout | Fur, dark/light subjects, photographed backgrounds |

Total: **52 actual inputs downloaded**, not 52 completed game sessions. Convenience subsets are deliberately small and reproducible; they do not estimate population accuracy. Public examples may have appeared in pretrained models' training data. Here, “holdout” means withheld from this repair's development, not guaranteed unseen by Meta.

Quick, Draw! is CC BY 4.0: attribution to Google and contributors accompanies each record. The sketches are uniformly rendered recorded simplified strokes, not generated “childlike” illustrations. Prompted category and historical recognition flags are sampling metadata, not infallible labels. Artists' ages are unknown.

Meta's dataset is released under MIT; source/license revision and original annotations are preserved. User-accepted annotations can be imperfect and sometimes group multiple figures. See [coordinate and annotation details](META-DRAWINGS.md).

Oxford's official page states CC BY-SA 4.0. The Turing mirror provides **colorized binary masks**, not original three-class trimaps. Derived masks and provenance remain together locally. One photo contains a watermark and is private evaluation material; it is not approved for public marketing use.

No full multi-gigabyte image archive was downloaded. Quick, Draw! uses bounded prefixes; Meta's image archive uses an 8 MiB prefix and streams its annotation index without retaining the full index; photos use individual ZIP ranges (~2.05 MiB transferred). Importers refuse non-ignored destinations.

## What changed in the product

`server/actor-grounding.ts` now tries two additional tight context boxes around any recognized subject. Previously the first box was already large enough for SAM to pick surrounding paper or nearby background on some inputs.

Sparse silhouettes no longer fail solely for occupying less than a fixed percentage of their rectangle. They must instead pass all existing size, overlap, growth and context-edge checks **and** agree on at least 90% mask IoU across distinct context boxes, measured in original-image pixel coordinates. This preserves thin figures without blanket acceptance of sparse noise. Stable masks can still be semantically wrong, so agreement is not treated as recognition proof.

The context calls are batched to respect the existing worker pixel/count budgets. Accepted artwork preserves original RGB values; the change only selects alpha and crop extent. No silhouettes are drawn or filled from a dataset label. The existing white-paper ranking penalty is unchanged: diagnostics did not establish it as the cause of the investigated failures.

## Matched development comparison

These are **oracle-box segmentation tests**: reference locations are supplied to isolate extraction. They do not measure automatic object discovery or full game conversion. Mean IoU includes rejected masks as zero; execution errors are listed separately.

| Same development inputs | Previous whole-subject accepted | Revised accepted | Previous mean IoU | Revised mean IoU |
|---|---:|---:|---:|---:|
| 4 pet photographs | 3/4 | 4/4 | 0.5444 | 0.7676 |
| 3 amateur drawings | 2/3 | 3/3 | 0.5572 | 0.8281 |
| 2 Quick, Draw! sketches | 0/2 | 0/2 | Not available | Not available |

The recovered photo is a complete Bengal cat (IoU 0.8928); the recovered thin stick figure has IoU 0.8128. Other accepted subjects in those matched runs retained their results. All accepted cutouts passed exact source-RGB checks. Visual inspection still found background flecks, interior holes or a bedding fragment in some other accepted cutouts. Acceptance is not a quality score.

Both rejected Quick, Draw! masks selected surrounding paper. Retaining rejection was preferable to reporting a white rectangle as the character. These examples remain extraction failures; they have no semantic reference mask from which to invent an accuracy percentage.

## Frozen holdout results

The extraction implementation was frozen before these checks (SHA-256 `802d3dee1abe835e4567b3b9b63c0a13547b6be980e8b8d69ba9bf4ff773b1d1`). No extraction thresholds were changed after viewing holdout results.

| Reserved inputs | Accepted | Rejected | Errors | Mean reference-mask IoU including rejects |
|---|---:|---:|---:|---:|
| 2 Meta amateur drawings | 1 | 1 | 0 | 0.4137 |
| 4 pet photographs, canonical PNG input | 1 | 3 | 0 | 0.2112 |
| 4 Quick, Draw! sketches | 3 | 1 | 0 | Unavailable: no semantic masks |

The accepted St Bernard photo has IoU 0.8450, but visual inspection found missing fur/interior pixels. The admitted smiling figure also has visible interior holes. Admitted Quick, Draw! masks preserve rough strokes without establishing their intended meaning. None of those admission counts is a showcase-quality score. These holdout results **do not support a general high extraction-success claim**, despite the matched development improvement. Rejections require review; they are not silently counted as successful conversion.

The first photo holdout run supplied raw JPEGs directly to SAM and produced one acceptance, one rejection and two source-RGB guard errors. PIL and Sharp can decode JPEG pixels differently. Production `interpretDrawing` first normalizes uploads to PNG; a separately retained `--canonical-png` run decoded once to sRGB PNG without changing dimensions or annotation positions. It removed those protocol errors, but both formerly errored inputs were rejected. This repeated the **same four photographs**, not four additional unseen examples. A canonical PNG repeat of the four development photographs exactly matched the earlier revised scores. Raw and corrected-protocol reports are retained; the former's two errors must not disappear from the audit.

## Existing-source regression check

The three reviewed rover crystals and cat-care fish were extracted with both the previous implementation (isolated from Git HEAD) and the frozen revised implementation, using identical source bytes and boxes. **All four returned identical PNG bytes, source placement and pixels.** The fish remains clean; crystal base strips, a terrain speck and a pale halo are pre-existing defects on those boxes, not introduced by this change. Existing showcase assets were not regenerated or replaced. This is a matched extraction regression check, not another gameplay playthrough.

Earlier evaluator reports incorrectly recorded `settings.principalComponentOverride: false` for whole-subject mode, which internally enables it. The evaluator now records the actual setting per mode. The correction is recorded alongside the frozen results; it changes no masks or scores.

## Separate production interpretation evidence

Four independent inputs (two Quick, Draw!, one Meta drawing, one photograph) went through the actual `interpretDrawing` path using Meta Muse Spark Open via Fireworks. The same neutral creator intent was used, without dataset categories, reference boxes or masks. Four remote model requests produced four compiled worlds.

All four selected discovery movement and zero object-action definitions. **This proves pipeline execution, not compelling gameplay, automatic recognition accuracy, or four successful playthroughs.** It does not satisfy the product's varied gameplay gate. Raw responses and generated worlds are preserved locally for inspection, never substituted for live inference.

## Reproduce

Run importers from the repository root (requires the project's existing Sharp dependency):

```sh
node scripts/datasets/quickdraw.mjs
node scripts/datasets/meta-drawings.mjs --count 12
node scripts/datasets/meta-drawings.mjs --verify
node scripts/datasets/photo-samples.mjs
```

Local extraction evaluation requires the existing local SAM installation. It makes no paid provider requests:

```sh
node --import tsx scripts/datasets/evaluate-cutouts.ts \
  data/public-evaluation/meta-amateur/manifest.json \
  outputs/verification/dataset-evaluation/my-meta-run \
  --split development --limit 3 --mode whole-subject
```

`--canonical-png` decodes JPEGs once to sRGB PNG for production input parity, retaining both original and evaluated hashes without resizing or changing reference coordinates. Use it for photo evaluation.

`--mode sam` measures direct annotation-box SAM extraction; `--mode whole-subject` exercises production context selection and validation. Reports include exact input/implementation hashes, mask scores, rejects/errors and original-pixel checks. Do not compare unmatched sample counts as an improvement claim.

Production interpretation is dry-run by default. Add `--execute` only to make fresh provider requests; `--limit` is capped at six images and the request budget at twice that number. The script uses existing local credentials without printing them. Use `--input-kind picture` for photographs.

```sh
node --import tsx scripts/datasets/evaluate-interpretation.ts \
  data/public-evaluation/quickdraw/manifest.json \
  outputs/verification/dataset-evaluation/my-interpretation-run --limit 2
```

## Remaining product work

- Rough sketches that SAM interprets as paper still need a reliable extraction or explicit review path; this patch does not claim arbitrary drawings work.
- Character figures and pet close-ups do not cover rooms, kitchens, multiple interacting objects, diagrams or every drawing style. Expand with appropriately licensed varied scenes and fresh holdouts for subsequent changes.
- Evaluate semantic recognition against human-inspected annotations separately from oracle-box extraction.
- Complete actual play sessions with roles, meaningful decisions, consequences, source revisions and preserved progress. Compilation alone must not close that checklist item.
- Consider fine-tuning only after repeated, categorized failures show that model adaptation would help, with a separate licensed training set and untouched evaluation set.

## Validation

Project type checks, standalone evaluation-script type checks, the production build and eight focused pipeline/segmentation tests passed. The exact-color classical inpainting fixture now explicitly selects classical repair and restores its environment afterward; installed learned LaMa weights are not judged by that deterministic 10×10-pixel fixture. The extraction change itself does not alter background repair. Secret scanning and Git-ignore checks keep credentials, datasets and raw provider outputs out of commits.
