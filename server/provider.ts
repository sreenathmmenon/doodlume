export type Provider = "meta" | "baseten" | "fireworks";

export interface ModelConnection {
  provider: Provider;
  label: string;
  model: string;
  apiKey: string;
  credential: "MODEL_API_KEY" | "BASETEN_API_KEY" | "FIREWORKS_API_KEY";
  endpoint: string;
  enforcedSchema: boolean;
  reserveRequest?: () => void;
}

export function modelConnection(
  env: Record<string, string | undefined>,
): ModelConnection {
  // An explicit choice is never silently switched to another billing account.
  const provider =
    env.MODEL_PROVIDER?.trim() ||
    (env.MODEL_API_KEY?.trim() ? "meta" : "baseten");
  if (provider === "fireworks") {
    const model =
      env.FIREWORKS_MODEL?.trim() ||
      "accounts/fireworks/models/muse-spark-open";
    if (
      !/^accounts\/fireworks\/models\/muse-spark-open(?:-[\w.-]+)?$/.test(model)
    )
      throw new Error(
        "The Fireworks drawing adapter requires a Meta Muse Spark Open model.",
      );
    return {
      provider,
      label: "Meta via Fireworks",
      model,
      apiKey: env.FIREWORKS_API_KEY?.trim() || "",
      credential: "FIREWORKS_API_KEY",
      endpoint: "https://api.fireworks.ai/inference/v1/chat/completions",
      // Use the same prompt schema and local checks as the hosted Baseten path.
      enforcedSchema: false,
    };
  }
  if (provider === "baseten") {
    const model = env.BASETEN_MODEL?.trim() || "meta-models/muse-spark-open";
    if (!/^meta-models\/muse-spark-open(?:-[\w.-]+)?$/.test(model))
      throw new Error(
        "The Baseten drawing adapter requires a Meta Muse Spark Open model.",
      );
    return {
      provider,
      label: "Meta via Baseten",
      model,
      apiKey: env.BASETEN_API_KEY?.trim() || "",
      credential: "BASETEN_API_KEY",
      endpoint: "https://inference.baseten.co/v1/chat/completions",
      enforcedSchema: false,
    };
  }
  if (provider === "meta") {
    const model = env.META_MODEL?.trim() || "muse-wonder-1.0";
    if (!/^muse-(wonder|spark)(?:-[\w.-]+)?$/.test(model))
      throw new Error(
        "The direct Meta drawing adapter requires a Muse Wonder or Muse Spark model.",
      );
    return {
      provider,
      label: "Meta directly",
      model,
      apiKey: env.MODEL_API_KEY?.trim() || "",
      credential: "MODEL_API_KEY",
      endpoint: "https://api.meta.ai/v1/chat/completions",
      enforcedSchema: true,
    };
  }
  throw new Error("MODEL_PROVIDER must be meta, baseten or fireworks.");
}

export function drawingRequest(
  connection: ModelConnection,
  image: string,
  intent: string,
  instructions: string,
  schema: unknown,
) {
  return {
    model: connection.model,
    messages: [
      {
        role: "system",
        content: connection.enforcedSchema
          ? instructions
          : `${instructions}\nReturn exactly one JSON object matching this schema. Do not include commentary or Markdown fences. JSON Schema:\n${JSON.stringify(schema)}`,
      },
      {
        role: "user",
        content: [
          { type: "text", text: `Adventure intent: ${intent}` },
          { type: "image_url", image_url: { url: image } },
        ],
      },
    ],
    ...(connection.enforcedSchema
      ? {
          response_format: {
            type: "json_schema",
            json_schema: { name: "drawing_world", strict: true, schema },
          },
        }
      : { reasoning_effort: "low", ...(connection.provider === "fireworks" ? {
          // Fireworks accepts its JSON-mode schema field for Muse Spark Open.
          // Local schema and gameplay validation remain authoritative.
          response_format: { type: "json_object" as const, schema },
        } : {}) }),
    max_tokens: 5000,
  };
}
