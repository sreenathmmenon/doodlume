# Meta drawing evaluation inputs

Run from the repository root:

```sh
node scripts/datasets/meta-drawings.mjs --count 12
node scripts/datasets/meta-drawings.mjs --verify # offline file-integrity check
```

This imports actual public drawings and annotations into **ignored** `data/public-evaluation/meta-amateur/`. It never modifies product behavior, adds a sample lookup, calls a paid model, or copies images into `public/`. The importer refuses to run if Git would track its destination. The manifest, license notice, original annotation records, input PNGs and derived foreground masks remain together locally.

## What is downloaded

- The first 8 MiB of Meta's official compressed image archive. The upstream file is named `.tar` but is gzip-compressed; the complete archive is 48,208,397,683 bytes. The importer stops at 12 complete PNG members by default (maximum 24), failing rather than downloading the entire archive if the bounded prefix is insufficient.
- The official 288,409,774-byte annotation index, streamed using bounded 4 MiB range requests with at most three attempts per request. Only matching image/annotation records are retained; the full JSON is not written to disk.
- The MIT license from the pinned official repository revision `b859684857519c7424da51a0b0862fbd1fd258f4`.

Upstream archive and annotation ETags are pinned; changed data requires an explicit importer update. Each stored image and mask has a SHA-256 in the manifest. Sampling takes the archive prefix, **not** a representative random sample. A stable SHA-256 partition reserves roughly one third as holdout. Do not tune against that holdout and subsequently report it as unseen.

## Annotation coordinate trap

Actual inspection found that `images[].width/height` describe the original upload, while archive PNGs are resized and bounding boxes/polygons refer to those resized pixels. For example, the first metadata record says 3000×4000, while its actual PNG is 384×512 and its polygon fits that 384×512 frame. This importer reads actual PNG dimensions, checks polygon coordinates against them, and normalizes `expectedBox` to 0–1000 from the actual pixel frame. Original metadata dimensions remain in provenance. Boxes are explicitly intersected with actual PNG bounds before normalization: one inspected box exceeds a resized image by 0.4 pixels because of rounding. The unchanged original box remains in `annotation.json`.

`mask.png` rasterizes the official polygon foreground over a black background using Sharp. The manifest specifies luminance foreground above 127. The original polygon annotation is retained for alternate rasterization. This is derived reference data, not a new human segmentation label.

## What the data can establish

The Amateur Drawings Dataset contains 178,166 contributed amateur figures. Bounding boxes, segmentation and joints are **user-accepted**, not guaranteed correct or independently adjudicated. Artists' ages were not recorded; these must not be described as known child drawings. A paper image may contain shadows, creases or other marks. The release excludes some content, including non-English text, and is not a test of every age, language or drawing style.

Supplying the manifest's `expectedBox` to extraction is an **oracle-box segmentation evaluation**. It measures foreground extraction with a supplied object location. It does not measure automatic detection, scene understanding, creator intent, game design, or end-to-end conversion. Keep those claims and evaluations separate. Some official masks group multiple adjacent figures; one such case occurs in this imported development set. Inspect failed masks before treating a disagreement as a product defect, because reference annotations can also be imperfect.

## ChildlikeSHAPES research and download scope

ChildlikeSHAPES adds manually annotated semantic parts for 16,075 single full-bodied biped figures, with 25 categories. It is useful for future face/body-part evaluation, but it is not a general scene/object/game dataset. The paper excludes dark, blurry or low-contrast examples, so its distribution differs from arbitrary user inputs.

The official release currently provides three `datachunk_*` files totaling 2,304,183,058 bytes, combined into a password-protected 7z archive. No small independently downloadable annotated subset was found in the official repository. This importer therefore **does not download or claim to evaluate ChildlikeSHAPES**. Its license is CC-BY 4.0, distinct from Amateur Drawings' MIT license.

## Primary sources

- [Official repository, pinned dataset/download/license instructions](https://github.com/facebookresearch/AnimatedDrawings/blob/b859684857519c7424da51a0b0862fbd1fd258f4/README.md)
- [MIT license](https://github.com/facebookresearch/AnimatedDrawings/blob/b859684857519c7424da51a0b0862fbd1fd258f4/LICENSE)
- [Amateur Drawings paper](https://arxiv.org/abs/2303.12741)
- [Meta dataset collection account](https://ai.meta.com/blog/ai-dataset-animation-drawings/)
- [ChildlikeSHAPES paper](https://arxiv.org/html/2504.08022v1)
- [Official release assets](https://github.com/facebookresearch/AnimatedDrawings/releases/tag/v0.0.1)
