import type { ModelConnection } from "./provider.js";
export class InterpretationError extends Error {
  constructor(
    message: string,
    public status = 422,
  ) {
    super(message);
  }
}
export async function modelJSON(
  connection: ModelConnection,
  payload: unknown,
  signal: AbortSignal,
  transport: typeof fetch = fetch,
): Promise<unknown> {
  const response = await transport(connection.endpoint, {
    method: "POST",
    signal,
    headers: {
      Authorization: `Bearer ${connection.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
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
      choices?: { message?: { content?: string } }[];
    };
    const content = result.choices?.[0]?.message?.content;
    if (typeof content !== "string" || content.length > 150_000)
      throw new Error();
    return JSON.parse(
      content.trim().replace(/^```(?:json)?\s*([\s\S]*?)\s*```$/, "$1"),
    );
  } catch {
    throw new InterpretationError(
      "Meta returned an incomplete interpretation. Your drawing is still here.",
    );
  }
}
