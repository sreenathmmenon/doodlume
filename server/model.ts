import type { ModelConnection, ModelCallTiming } from "./provider.js";
export class InterpretationError extends Error {
  constructor(
    message: string,
    public status = 422,
  ) {
    super(message);
  }
}
/** A decoded model plan failed a deterministic schema or behavior check.
 * Provider, artwork review and human-clarification failures never use this type. */
export const MODEL_PLAN_DIAGNOSTIC_LIMIT = 1_500;
export class ModelPlanError extends InterpretationError {
  constructor(message: string, status = 422) {
    super(message.slice(0, MODEL_PLAN_DIAGNOSTIC_LIMIT), status);
  }
}

/** A completed provider response contained malformed JSON. Raw content is bounded
 * diagnostic data for one correction sequence, never a public error message. */
export class MalformedModelJSONError extends ModelPlanError {
  constructor(public readonly rawContent: string) {
    super("The completed response is not valid JSON. Return one complete JSON object with balanced syntax and the requested schema; preserve the original image and creator intent.");
  }
}

/** A completed HTTP busy rejection, never an ambiguous network timeout or
 * partial model result. Only this response can receive one budgeted retry. */
class ProviderBusyError extends InterpretationError {
  constructor(label:string,readonly retryAfterMs:number|undefined){
    super(`${label} is busy right now. Your image and current world are unchanged. Try again shortly.`,503);
  }
}

export async function modelJSON(
  connection: ModelConnection,payload:unknown,signal:AbortSignal,transport:typeof fetch=fetch,
):Promise<unknown>{
  try{return await executeModelCall(connection,payload,signal,transport);}
  catch(error){
    signal.throwIfAborted();
    // A busy HTTP rejection has no usable interpretation. Keep the same model,
    // account and exact request; do not retry timeouts, malformed outputs or
    // billing/auth failures. Existing unbudgeted callers keep their behavior.
    if(!(error instanceof ProviderBusyError)||error.retryAfterMs===undefined||!connection.executionBudget?.canStartCall())throw error;
    await pauseBeforeBusyRetry(error.retryAfterMs,signal);
    if(!connection.executionBudget.canStartCall())throw error;
    return executeModelCall(connection,payload,signal,transport);
  }
}

function pauseBeforeBusyRetry(ms:number,signal:AbortSignal):Promise<void>{
  signal.throwIfAborted();
  return new Promise((resolve,reject)=>{
    const onAbort=()=>{clearTimeout(timer);signal.removeEventListener('abort',onAbort);reject(signal.reason);};
    const timer=setTimeout(()=>{signal.removeEventListener('abort',onAbort);resolve();},ms);
    signal.addEventListener('abort',onAbort,{once:true});
    if(signal.aborted)onAbort();
  });
}

async function executeModelCall(
  connection: ModelConnection,
  payload: unknown,
  signal: AbortSignal,
  transport: typeof fetch = fetch,
): Promise<unknown> {
  signal.throwIfAborted();
  const lease = connection.executionBudget?.acquireCall(signal);
  const callSignal = lease?.signal ?? signal;
  const started=performance.now();
  let requested=false;
  const timing:ModelCallTiming={provider:connection.provider,durationMs:0,outcome:'failed',
    ...(connection.provider==='fireworks'?{serviceTier:connection.serviceTier??'default'}:{})};
  try {
    // The scheduler rejects unaffordable repairs before consuming paid quota.
    connection.reserveRequest?.();
    requested=true;
    const value=await abortableModelResponse(
      readModelResponse(connection, payload, callSignal, transport,(response)=>{
        timing.status=response.status;
        if(connection.provider!=='fireworks')return;
        for(const [header,field,multiplier,maximum] of [
          ['fireworks-server-time-to-first-token','firstTokenMs',1000,3_600_000],
          ['fireworks-server-processing-time','processingMs',1000,3_600_000],
          ['fireworks-prompt-tokens','promptTokens',1,100_000_000],
          ['fireworks-cached-prompt-tokens','cachedPromptTokens',1,100_000_000],
        ] as const){
          const raw=response.headers?.get(header);if(!raw?.trim())continue;
          const n=Number(raw)*multiplier;
          if(Number.isFinite(n)&&n>=0&&n<=maximum)timing[field]=Math.round(n);
        }
      }), callSignal,
    );
    timing.outcome='completed';return value;
  } catch (error) {
    timing.outcome=signal.aborted?'cancelled':callSignal.aborted?'deadline':'failed';
    // A disconnected client or whole-request cancellation retains its identity.
    signal.throwIfAborted();
    throw error;
  } finally {
    lease?.dispose();
    timing.durationMs=Math.round(performance.now()-started);
    if(requested)try{connection.onTiming?.({...timing});}catch{/* Diagnostics cannot change creation results. */}
  }
}

/** Also bounds response-body decoding: some transports resolve the headers but
 * never finish their body. Abort must stop waiting for both phases. */
function abortableModelResponse<T>(pending: Promise<T>, signal: AbortSignal): Promise<T> {
  let onAbort: (() => void) | undefined;
  return new Promise<T>((resolve, reject) => {
    onAbort = () => reject(signal.reason);
    signal.addEventListener("abort", onAbort, {once:true});
    if (signal.aborted) onAbort();
    // Attaching both handlers also observes a transport that rejects after abort.
    pending.then(resolve,reject);
  }).finally(() => {
    if (onAbort) signal.removeEventListener("abort", onAbort);
  });
}

async function readModelResponse(
  connection: ModelConnection,
  payload: unknown,
  signal: AbortSignal,
  transport: typeof fetch,
  observe:(response:Response)=>void,
): Promise<unknown> {
  signal.throwIfAborted();
  let response: Response;
  try {
  response = await transport(connection.endpoint, {
      method: "POST",
      signal,
      headers: {
        Authorization: `Bearer ${connection.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
  } catch {
    signal.throwIfAborted();
    throw new InterpretationError(`${connection.label} could not be reached. Check the connection and try again; your image is unchanged.`, 502);
  }
  observe(response);
  if (!response.ok) {
    await response.body?.cancel();
    if(response.status===503){
      const raw=response.headers?.get('retry-after');
      const seconds=raw?.trim()?Number(raw):.5;
      // Long or date-form retry instructions are returned to the caller rather
      // than consuming the request's compilation reserve by waiting.
      const retryAfterMs=Number.isFinite(seconds)&&seconds>=0&&seconds<=2?Math.ceil(seconds*1000):undefined;
      throw new ProviderBusyError(connection.label,retryAfterMs);
    }
    if ([401, 403].includes(response.status))
      throw new InterpretationError(
        `${connection.label} could not authorize this request. Check the selected provider's key and model access.`,
        502,
      );
    if (response.status === 402)
      throw new InterpretationError(
        `${connection.label} reports a billing restriction or unavailable credit. Your current world is unchanged.`,
        402,
      );
    if (response.status === 404)
      throw new InterpretationError(
        `The selected Meta model is not available through ${connection.provider}. Check its exact name in your provider account.`,
        502,
      );
    if (response.status === 429)
      throw new InterpretationError(
        `${connection.label} is currently rate-limited. Wait a little before trying again.`,
        429,
      );
    throw new InterpretationError(
      `${connection.label} could not complete this interpretation. Your current world is unchanged.`,
      502,
    );
  }
  try {
    const result = (await response.json()) as {
      error?: unknown;
      choices?: { finish_reason?: string; message?: { content?: string; refusal?: unknown } }[];
    };
    if (!result || typeof result !== "object" || Array.isArray(result) || result.error ||
        !Array.isArray(result.choices) || !result.choices[0] || typeof result.choices[0] !== "object") throw new Error();
    const choice = result.choices[0];
    if (choice.finish_reason === "length")
      throw new InterpretationError("Meta stopped before completing the game plan. Try again; your image and idea are unchanged.", 502);
    if (!choice.message || typeof choice.message !== "object" || Array.isArray(choice.message) ||
        choice.message.refusal != null || choice.finish_reason === "content_filter" || choice.finish_reason === "tool_calls") throw new Error();
    const content = choice.message.content;
    if (typeof content !== "string" || !content.trim() || content.length > 150_000) throw new Error();
    const json = content.trim().replace(/^```(?:json)?\s*([\s\S]*?)\s*```$/, "$1");
    try { return JSON.parse(json); }
    catch {
      // Only an explicitly completed, bounded model message enters correction.
      // Invalid envelopes, refusals, truncation and transport failures do not.
      if (choice.finish_reason === "stop" && content.length <= 60_000)
        throw new MalformedModelJSONError(content);
      throw new Error();
    }
  } catch (error) {
    signal.throwIfAborted();
    if (error instanceof InterpretationError) throw error;
    throw new InterpretationError(
      "Meta returned an incomplete interpretation. Your drawing is still here.",
    );
  }
}
