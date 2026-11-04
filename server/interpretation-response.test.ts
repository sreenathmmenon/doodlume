import test from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import { InterpretationError, ModelPlanError, MalformedModelJSONError } from "./model.js";
import { RecognitionReviewError } from "./recognition-error.js";
import { interpretationErrorResponse } from "./interpretation-response.js";

test("HTTP errors hide final plan diagnostics while retaining correction detail and editable recognition recovery",async()=>{
  const diagnostic="gameplay.instructions exceeds 180; source-private-id cannot supply requiredResourceIds";
  const planError=new ModelPlanError(diagnostic);
  const review=new RecognitionReviewError({kind:"recognition-review",version:1,
    draft:{id:"draft",name:"Draft",description:"Synthetic review fixture",source:"manual",sourceImage:"",theme:"grove",width:800,height:600,revision:1,entities:[]},
    issues:[{id:"outline",objectId:"source-object",label:"Check outline",message:"Include the complete visible object."}]});
  const errors={plan:planError,review,provider:new InterpretationError("The provider could not be reached. Try again.",502)};
  const app=Fastify();
  app.get<{Params:{kind:keyof typeof errors}}>("/:kind",async request=>{throw errors[request.params.kind];});
  app.setErrorHandler((error,_request,reply)=>{
    const response=interpretationErrorResponse(error);
    return reply.code(response?.status??500).send(response?.body??{error:"Unexpected failure"});
  });
  try{
    const plan=await app.inject("/plan");
    assert.equal(plan.statusCode,422);
    assert.match(plan.json().error,/game rules could not be completed/);
    assert.match(plan.json().error,/image and current world are unchanged/);
    assert.doesNotMatch(plan.body,/gameplay|source-private-id|requiredResourceIds/);
    assert.equal(planError.message,diagnostic,"Correction feedback retains its full bounded diagnostic");
    const recovery=await app.inject("/review");
    assert.equal(recovery.statusCode,422);
    assert.deepEqual(recovery.json(),{error:review.message,recovery:review.recovery});
    const provider=await app.inject("/provider");
    assert.equal(provider.statusCode,502);
    assert.equal(provider.json().error,errors.provider.message);
  }finally{await app.close();}
});


test("malformed model text stays private at the public error boundary",()=>{
  const raw='{"private-source-id":"untrusted text';
  const error=new MalformedModelJSONError(raw);
  assert.equal(error.rawContent,raw);
  const response=interpretationErrorResponse(error)!;
  assert.equal(response.status,422);
  assert.match(response.body.error,/game rules could not be completed/);
  assert.doesNotMatch(JSON.stringify(response.body),/private-source-id|untrusted text|rawContent/);
});
