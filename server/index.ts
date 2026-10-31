import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import { config } from "dotenv";
import { existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { interpretDrawing, InterpretationError } from "./interpret.js";
import { interpretAmendment } from "./amend.js";
import { installCapture, CaptureError } from "./capture.js";
import { modelConnection } from "./provider.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
config({ path: process.env.DOODLUME_ENV_FILE || resolve(root, ".env.local") });
config({ path: resolve(root, ".env") });
const connection = modelConnection(process.env);
const maxRequests = Math.max(
  0,
  Math.min(200, Math.floor(Number(process.env.MAX_MODEL_REQUESTS ?? 20) || 0)),
);
const port = Number(process.env.API_PORT) || 8787;
let requests = 0,
  inFlight = false;
const app = Fastify({ bodyLimit: 17_000_000, logger: false });
app.addHook("onRequest", async (request, reply) => {
  const origin = request.headers.origin;
  if (
    origin &&
    ![
      `http://127.0.0.1:${port}`,
      `http://localhost:${port}`,
      "http://127.0.0.1:5173",
      "http://localhost:5173",
    ].includes(origin)
  )
    return reply.code(403).send({
      error: "This local studio accepts requests from its own page only.",
    });
  const host = request.headers.host;
  if (!host || !new RegExp(`^(127\\.0\\.0\\.1|localhost):${port}$`).test(host))
    return reply.code(403).send({ error: "Use the local studio address." });
});
app.get("/api/status", async () => ({
  configured: Boolean(connection.apiKey),
  provider: connection.provider,
  label: connection.label,
  model: connection.model,
  credential: connection.credential,
  enforcedSchema: connection.enforcedSchema,
  requestsRemaining: Math.max(0, maxRequests - requests),
}));
for (const action of ["interpret", "amend"] as const)
  app.post<{ Body: { image?: unknown; intent?: unknown; world?: unknown } }>(
    `/api/${action}`,
    async (request, reply) => {
      if (!connection.apiKey)
        return reply.code(503).send({
          error: `Add ${connection.credential} to .env.local and restart the studio to use ${connection.label}.`,
        });
      if (inFlight)
        return reply.code(429).send({
          error:
            "One drawing is already being interpreted. Wait for it to finish.",
        });
      if (requests >= maxRequests)
        return reply.code(429).send({
          error:
            "The local session request limit has been reached. Your current world is safe.",
        });
      const body = request.body;
      if (!body || typeof body !== "object")
        return reply.code(400).send({ error: "Choose a drawing first." });
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 60_000);
      const onClose = () => {
        if (!reply.raw.writableFinished) controller.abort();
      };
      reply.raw.on("close", onClose);
      inFlight = true;
      requests++;
      try {
        if (action === "amend")
          return {
            proposal: await interpretAmendment(
              body.world,
              body.image,
              body.intent ?? "",
              connection,
              controller.signal,
            ),
          };
        return {
          world: await interpretDrawing(
            body.image,
            body.intent ?? "",
            connection,
            controller.signal,
          ),
        };
      } catch (error) {
        if (error instanceof InterpretationError)
          return reply.code(error.status).send({ error: error.message });
        if (controller.signal.aborted)
          return reply.code(504).send({
            error:
              "The interpretation took too long or was stopped. Your drawing and current world are safe.",
          });
        return reply.code(502).send({
          error:
            "The drawing could not become a world this time. Your current world is unchanged.",
        });
      } finally {
        clearTimeout(timeout);
        reply.raw.off("close", onClose);
        inFlight = false;
      }
    },
  );
app.setErrorHandler((error, _request, reply) => {
  if (error instanceof CaptureError)
    return reply.code(error.status).send({ error: error.message });
  const status =
    error &&
    typeof error === "object" &&
    "statusCode" in error &&
    typeof error.statusCode === "number"
      ? error.statusCode
      : 500;
  reply.code(status < 500 ? status : 500).send({
    error:
      status === 413
        ? "The image is too large. Try a smaller photo."
        : "This request could not be read. Your current world is safe.",
  });
});
const dist = resolve(root, "dist");
installCapture(app, dist, port);
if (existsSync(dist)) {
  await app.register(fastifyStatic, { root: dist });
  app.setNotFoundHandler((request, reply) =>
    request.url.startsWith("/api/")
      ? reply.code(404).send({ error: "Unknown studio action." })
      : reply.sendFile("index.html"),
  );
}
await app.listen({ host: "127.0.0.1", port });
console.log(
  `Doodlume API ready at http://127.0.0.1:${port} · ${connection.label} ${connection.apiKey ? "key configured" : "key needed"}`,
);
