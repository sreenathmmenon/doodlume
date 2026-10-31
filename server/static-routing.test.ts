import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import { installStudioFallback } from "./static-routing.ts";

test("missing artwork and chunks return404 while known studio and capture documents retain SPA routing", async () => {
  const root = await mkdtemp(join(tmpdir(), "doodlume-routing-"));
  const app = Fastify();
  try {
    await writeFile(
      join(root, "index.html"),
      "<!doctype html><title>Studio shell</title>",
    );
    await app.register(fastifyStatic, { root });
    installStudioFallback(app);
    for (const path of [
      "/art/missing.svg",
      "/art/missing.svg?cache=1",
      "/assets/missing.js",
      "/fonts/missing.ttf",
      "/missing-page",
      "/capture/missing.svg",
    ]) {
      const response = await app.inject({
        url: path,
        headers: { accept: "text/html" },
      });
      assert.equal(response.statusCode, 404, path);
      assert.doesNotMatch(response.headers["content-type"] || "", /text\/html/);
      assert.doesNotMatch(response.body, /Studio shell/);
    }
    for (const path of ["/", "/?diagnostics=1", `/capture/${"a".repeat(32)}`]) {
      const response = await app.inject({ url: path });
      assert.equal(response.statusCode, 200);
      assert.match(response.body, /Studio shell/);
    }
    const unknownApi = await app.inject({ url: "/api/unknown" });
    assert.equal(unknownApi.statusCode, 404);
    assert.equal(unknownApi.json().error, "Unknown studio action.");
  } finally {
    await app.close();
    await rm(root, { recursive: true, force: true });
  }
});
