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
  const fireworks = modelConnection({
    MODEL_PROVIDER: "fireworks",
    FIREWORKS_API_KEY: "test-fireworks",
    BASETEN_API_KEY: "test-baseten",
    MODEL_API_KEY: "test-meta",
  });
  assert.equal(fireworks.apiKey, "test-fireworks");
  assert.equal(fireworks.credential, "FIREWORKS_API_KEY");
  assert.equal(
    fireworks.endpoint,
    "https://api.fireworks.ai/inference/v1/chat/completions",
  );
  assert.equal(fireworks.model, "accounts/fireworks/models/muse-spark-open");
  assert.equal(
    modelConnection({ MODEL_PROVIDER: "fireworks", MODEL_API_KEY: "test-meta" })
      .apiKey,
    "",
  );
  assert.throws(() =>
    modelConnection({
      MODEL_PROVIDER: "fireworks",
      FIREWORKS_MODEL: "accounts/fireworks/models/something-else",
    }),
  );
  assert.throws(() =>
    modelConnection({
      MODEL_PROVIDER: "baseten",
      BASETEN_MODEL: "another-vendor/model",
    }),
  );
});

test("provider output modes retain local schema instructions and use only documented constraints", () => {
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
  assert.ok(meta.response_format && "json_schema" in meta.response_format);
  const constrained = meta.response_format.json_schema;
  assert.ok(constrained);
  assert.equal(constrained.strict, true);
  assert.equal(constrained.schema, schema);
  const fireworks = drawingRequest(
    modelConnection({MODEL_PROVIDER:"fireworks"}),
    "data:image/png;base64,dGVzdA==", "Collect stars", "Interpret this page.", schema,
  );
  assert.deepEqual(fireworks.response_format, {type:"json_object",schema});
  assert.match(fireworks.messages[0].content as string, /JSON Schema/);
});

test('Fireworks capacity tier is explicit and never leaks into another provider',()=>{
  const request=(env:Record<string,string>)=>drawingRequest(modelConnection(env),'image','intent','instructions',{});
  assert.equal('service_tier' in request({MODEL_PROVIDER:'fireworks'}),false);
  assert.equal(request({MODEL_PROVIDER:'fireworks',FIREWORKS_SERVICE_TIER:'priority'}).service_tier,'priority');
  assert.equal('service_tier' in request({MODEL_PROVIDER:'meta',FIREWORKS_SERVICE_TIER:'priority'}),false);
  assert.throws(()=>modelConnection({MODEL_PROVIDER:'fireworks',FIREWORKS_SERVICE_TIER:'unsupported'}));
});
