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

test("a provider billing error is not retried or replaced by scheduling",async()=>{
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

test('model telemetry is numeric-only, bounded and cannot break successful creation',async()=>{
  const timings:unknown[]=[];
  const selected=connection({provider:'fireworks',onTiming:timing=>{timings.push(timing);throw Error('Broken logger');}});
  const transport=(async()=>new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:'{"ok":true}'}}]}),{headers:{
    'fireworks-server-time-to-first-token':'1.25','fireworks-server-processing-time':'2.5',
    'fireworks-prompt-tokens':'500','fireworks-cached-prompt-tokens':'NaN',
    'x-untrusted-provider-message':'sensitive content must not be exported',
  }})) as typeof fetch;
  assert.deepEqual(await modelJSON(selected,{},new AbortController().signal,transport),{ok:true});
  assert.equal(timings.length,1);
  const timing=timings[0] as Record<string,unknown>;
  assert.equal(timing.outcome,'completed');assert.equal(timing.firstTokenMs,1250);assert.equal(timing.processingMs,2500);
  assert.equal(timing.promptTokens,500);assert.equal(timing.cachedPromptTokens,undefined);
  assert.ok(!JSON.stringify(timing).includes('sensitive'));assert.ok(Number(timing.durationMs)>=0);
});

test('one explicit busy rejection retries the same request within budget, never a timeout or long retry-after',async()=>{
  let requests=0,reservations=0;const payload={scene:'synthetic protocol fixture'};
  const selected=connection({executionBudget:createPlanningBudget(),reserveRequest:()=>{reservations++;}});
  const seen:string[]=[];
  const transport=(async(_url,init)=>{seen.push(String(init?.body));return ++requests===1?new Response(null,{status:503,headers:{'Retry-After':'0'}}):completed();}) as typeof fetch;
  assert.deepEqual(await modelJSON(selected,payload,new AbortController().signal,transport),{ok:true});
  assert.equal(requests,2);assert.equal(reservations,2);assert.equal(seen[0],seen[1]);
  for(const after of ['0','120','Wed, 21 Oct 2026 07:28:00 GMT']){
    let calls=0;
    await assert.rejects(modelJSON(selected,payload,new AbortController().signal,(async()=>{calls++;return new Response(null,{status:503,headers:{'Retry-After':after}});}) as typeof fetch),/busy right now/);
    assert.equal(calls,after==='0'?2:1);
  }
});

test('cancellation during busy backoff stops before another paid request',async()=>{
  let calls=0;const controller=new AbortController(),reason=new Error('Closed creation');
  const pending=modelJSON(connection({executionBudget:createPlanningBudget()}),{},controller.signal,(async()=>{calls++;setTimeout(()=>controller.abort(reason),5);return new Response(null,{status:503,headers:{'Retry-After':'1'}});}) as typeof fetch);
  await assert.rejects(pending,error=>error===reason);assert.equal(calls,1);
});
