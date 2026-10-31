import type { FastifyInstance } from "fastify";

/** Only known document routes may receive the SPA shell; assets must fail as assets. */
export function installStudioFallback(app: FastifyInstance) {
  app.setNotFoundHandler((request, reply) => {
    const pathname = request.url.split("?", 1)[0];
    if (pathname.startsWith("/api/"))
      return reply.code(404).send({ error: "Unknown studio action." });
    if (
      (request.method === "GET" || request.method === "HEAD") &&
      (pathname === "/" || /^\/capture\/[a-f0-9]{32}$/.test(pathname))
    )
      return reply.sendFile("index.html");
    return reply
      .code(404)
      .send({ error: "This file or page could not be found." });
  });
}
