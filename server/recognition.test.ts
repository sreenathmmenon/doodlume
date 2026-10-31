import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import {
  interpretDrawing,
  RecognitionReviewError,
  InterpretationError,
} from "./interpret.js";
import { modelConnection } from "./provider.js";
import { imageData } from "./images.js";
import { validateRecognitionReview } from "../shared/recognition-review.js";
import { setupFeedback } from "../shared/setup.js";

const connection = modelConnection({
  MODEL_PROVIDER: "meta",
  MODEL_API_KEY: "synthetic-test-only",
});
const object = (
  id: string,
  kind: string,
  x: number,
  y: number,
  width: number,
  height: number,
  targetId: string | null = null,
) => ({ id, kind, x, y, width, height, targetId, label: id });
const interpretation = (objects: unknown[]) => ({
  name: "Source-preserving repair",
  description: "Synthetic protocol fixture, not a model result.",
  theme: "grove",
  clarification: "",
  objects,
});
async function source() {
  return imageData(
    await sharp(
      Buffer.from(
        '<svg width="1000" height="1000" xmlns="http://www.w3.org/2000/svg"><rect width="1000" height="1000" fill="white"/><rect x="100" y="500" width="60" height="100" fill="black"/><rect x="0" y="800" width="1000" height="100" fill="black"/></svg>',
      ),
    )
      .png()
      .toBuffer(),
  );
}
function response(value: unknown) {
  return new Response(
    JSON.stringify({
      choices: [{ message: { content: JSON.stringify(value) } }],
    }),
  );
}

test("a failed crop keeps valid original artwork in review, makes no segmentation request, and cannot be returned as success", async () => {
  let calls = 0,
    segmentationCalls = 0;
  let recovery: RecognitionReviewError | undefined;
  try {
    await interpretDrawing(
      await source(),
      "Keep my marks",
      connection,
      new AbortController().signal,
      {
        enabled: true,
        apiKey: "synthetic-test-only",
        reserveRequest: () => {
          segmentationCalls++;
        },
      },
      async () => {
        calls++;
        return response(
          interpretation([
            object("hero", "player", 100, 500, 60, 100),
            object("ground", "terrain", 0, 800, 1000, 100),
            object("blank-star", "coin", 600, 300, 40, 40),
          ]),
        );
      },
    );
    assert.fail("A blank proposed crop must not become an accepted world");
  } catch (error) {
    assert.ok(error instanceof RecognitionReviewError);
    recovery = error;
  }
  assert.equal(calls, 1);
  assert.equal(segmentationCalls, 0);
  assert.ok(recovery);
  const review = validateRecognitionReview(recovery.recovery);
  assert.match(
    review.issues.find((i) => i.objectId === "blank-star")!.message,
    /no clear artwork/,
  );
  assert.match(
    review.draft.entities.find((e) => e.id === "hero")!.art!,
    /^data:image\/png;base64,/,
  );
  assert.equal(
    review.draft.entities.find((e) => e.id === "blank-star")!.art,
    undefined,
  );
  assert.deepEqual(
    review.draft.entities.find((e) => e.id === "hero")!.artSource,
    { x: 100, y: 500, width: 60, height: 100 },
  );
  const tampered = structuredClone(review);
  tampered.draft.entities[0].art = "https://untrusted.invalid/substitute.png";
  assert.throws(() => validateRecognitionReview(tampered), /artwork/);
});

test("unreadable geometry and unresolved gate links stay actionable review data; provider failure does not fabricate recovery", async () => {
  const image = await source();
  let review;
  try {
    await interpretDrawing(
      image,
      "",
      connection,
      new AbortController().signal,
      { enabled: false, apiKey: "" },
      async () =>
        response(
          interpretation([
            object("unlocated-player", "player", 980, 500, 60, 100),
            object("ground", "terrain", 0, 800, 1000, 100),
            object("switch", "lever", 100, 500, 60, 100, "missing-gate"),
          ]),
        ),
    );
    assert.fail("Unlocated player must not be invented");
  } catch (error) {
    assert.ok(error instanceof RecognitionReviewError);
    review = validateRecognitionReview(error.recovery);
  }
  assert.equal(
    review.draft.entities.some((e) => e.kind === "player"),
    false,
  );
  assert.equal(
    review.draft.entities.find((e) => e.id === "switch")!.targetId,
    undefined,
  );
  assert.match(review.issues.map((i) => i.message).join(" "), /left out/);
  assert.match(
    setupFeedback(review.draft).errors.join(" "),
    /recognizable character/,
  );
  assert.match(setupFeedback(review.draft).errors.join(" "), /gate opened/);
  await assert.rejects(
    () =>
      interpretDrawing(
        image,
        "",
        connection,
        new AbortController().signal,
        { enabled: false, apiKey: "" },
        async () => new Response("", { status: 429 }),
      ),
    (error: unknown) =>
      error instanceof InterpretationError &&
      !(error instanceof RecognitionReviewError),
  );
});
