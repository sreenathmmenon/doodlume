import test from "node:test";
import assert from "node:assert/strict";
import { createPlanningBudget, ModelCallDeadlineError, PlanningBudgetExhaustedError } from "./planning-budget.js";
import { modelJSON } from "./model.js";
import type { ModelConnection } from "./provider.js";

function connection(overrides: Partial<ModelConnection> = {}): ModelConnection {
  return {provider:"fireworks",label:"Test provider",model:"meta-model",apiKey:"fixture",credential:"FIREWORKS_API_KEY",endpoint:"https://example.invalid",enforcedSchema:false,...overrides};
}
const completed = () => Response.json({choices:[{finish_reason:"stop",message:{content:'{"ok":true}'}}]});

test("extraction time consumes shared budget and refuses a late repair before reserving paid quota",async()=>{
  let now = 0, reservations = 0, calls = 0;
  const executionBudget = createPlanningBudget({now:()=>now});
  const selected = connection({executionBudget,reserveRequest:()=>{reservations++;}});
  const transport = (async()=>{calls++; now+=40_000; return completed();}) as typeof fetch;
  assert.deepEqual(await modelJSON(selected,{},new AbortController().signal,transport),{ok:true});
  now += 44_000; // Actual local extraction/validation time, not another inference.
  assert.equal(executionBudget.remainingMs(),36_000);
  assert.equal(executionBudget.canStartCall(),false);
  await assert.rejects(modelJSON(selected,{},new AbortController().signal,transport),PlanningBudgetExhaustedError);
  assert.equal(calls,1);
  assert.equal(reservations,1);
});

test("model deadline cancels a stuck response body and preserves typed failure",async()=>{
  const executionBudget = createPlanningBudget({totalMs:200,reserveForCompilationMs:100,maxCallMs:20,minCallMs:5});
  let transportSignal:AbortSignal|undefined;
  const transport = (async(_url,init)=>{
    transportSignal=init?.signal as AbortSignal;
    return {ok:true,json:()=>new Promise(()=>{})} as Response;
  }) as typeof fetch;
  const start = performance.now();
  await assert.rejects(modelJSON(connection({executionBudget}),{},new AbortController().signal,transport),(error:unknown)=>{
    assert.ok(error instanceof ModelCallDeadlineError);
    assert.equal(error.status,504);
    return true;
  });
  assert.ok(performance.now()-start<500,"Headers must not bypass the model-call deadline");
  assert.equal(transportSignal?.aborted,true);
});

test("parent cancellation wins over model deadline and is never called a provider failure",async()=>{
  const executionBudget = createPlanningBudget({totalMs:500,reserveForCompilationMs:100,maxCallMs:200,minCallMs:5});
  const controller = new AbortController(), reason = new Error("Disconnected client");
  const transport = (async()=>{controller.abort(reason); return new Promise(()=>{});}) as typeof fetch;
  await assert.rejects(modelJSON(connection({executionBudget}),{},controller.signal,transport),(error:unknown)=>error===reason);
});

test("successful calls dispose their deadline and do not abort completed transport",async()=>{
  const executionBudget = createPlanningBudget({totalMs:200,reserveForCompilationMs:100,maxCallMs:20,minCallMs:5});
  let transportSignal:AbortSignal|undefined;
  const transport = (async(_url,init)=>{transportSignal=init?.signal as AbortSignal;return completed();}) as typeof fetch;
  assert.deepEqual(await modelJSON(connection({executionBudget}),{},new AbortController().signal,transport),{ok:true});
  await new Promise(resolve=>setTimeout(resolve,35));
  assert.equal(transportSignal?.aborted,false);
});

test("a provider error is not retried or replaced by scheduling",async()=>{
  let calls=0;
  const transport=(async()=>{calls++;return new Response(null,{status:402});}) as typeof fetch;
  await assert.rejects(modelJSON(connection({executionBudget:createPlanningBudget()}),{},new AbortController().signal,transport),/billing restriction/);
  assert.equal(calls,1);
});

test("reserve and call ceilings must leave usable compilation time",()=>{
  assert.throws(()=>createPlanningBudget({totalMs:100,reserveForCompilationMs:100}),RangeError);
  assert.throws(()=>createPlanningBudget({maxCallMs:100,minCallMs:101}),RangeError);
  assert.throws(()=>createPlanningBudget({totalMs:NaN}),RangeError);
});
