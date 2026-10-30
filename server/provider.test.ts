import test from "node:test";
import assert from "node:assert/strict";
import { drawingRequest, modelConnection } from "./provider.js";

test("provider selection keeps credentials and endpoints separate and only allows supported Meta model names", () => {
  const selected = modelConnection({
    MODEL_PROVIDER: "baseten",
    MODEL_API_KEY: "test-meta",
    BASETEN_API_KEY: "test-baseten",
  });
  assert.equal(selected.apiKey, "test-baseten");
  assert.equal(
    selected.endpoint,
    "https://inference.baseten.co/v1/chat/completions",
  );
  assert.equal(
    modelConnection({ MODEL_PROVIDER: "meta", BASETEN_API_KEY: "test-baseten" })
      .apiKey,
    "",
  );
  assert.throws(() =>
    modelConnection({
      MODEL_PROVIDER: "baseten",
      BASETEN_MODEL: "another-vendor/model",
    }),
  );
});

test("Baseten gets a JSON instruction without unsupported schema mode; direct Meta gets constrained output", () => {
  const schema = { type: "object", properties: { name: { type: "string" } } };
  const baseten = drawingRequest(
    modelConnection({ MODEL_PROVIDER: "baseten" }),
    "data:image/png;base64,dGVzdA==",
    "Collect stars",
    "Interpret this page.",
    schema,
  );
  assert.equal("response_format" in baseten, false);
  assert.ok("reasoning_effort" in baseten);
  assert.equal(baseten.reasoning_effort, "low");
  assert.match(baseten.messages[0].content as string, /JSON Schema/);
  assert.equal(baseten.model, "meta-models/muse-spark-open");
  const meta = drawingRequest(
    modelConnection({ MODEL_PROVIDER: "meta" }),
    "data:image/png;base64,dGVzdA==",
    "Collect stars",
    "Interpret this page.",
    schema,
  );
  assert.ok("response_format" in meta);
  assert.equal(meta.response_format.json_schema.strict, true);
  assert.equal(meta.response_format.json_schema.schema, schema);
});
