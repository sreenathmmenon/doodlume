import type { ModelConnection } from "./provider.js";
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

export async function modelJSON(
  connection: ModelConnection,
  payload: unknown,
  signal: AbortSignal,
  transport: typeof fetch = fetch,
): Promise<unknown> {
  signal.throwIfAborted();
  connection.reserveRequest?.();
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
  if (!response.ok) {
    await response.body?.cancel();
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
