import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { CaptureBroker, captureGateway } from "./capture.js";
const image = `data:image/png;base64,${(
  await sharp({
    create: { width: 8, height: 8, channels: 4, background: "#fffdf8" },
  })
    .png()
    .toBuffer()
).toString("base64")}`;
test("capture links separate reader and sender authority, preserve session binding, expire, and reject late or duplicate replacement uploads", async () => {
  let now = 1000;
  const broker = new CaptureBroker(() => now);
  const a = broker.create({
    purpose: "update",
    name: "First world",
    worldId: "world-a",
    revision: 3,
  });
  const b = broker.create({ purpose: "create", name: "Second world" });
  assert.throws(() => broker.owner(a.id, a.phoneToken));
  assert.throws(() => broker.owner(a.id, b.ownerToken));
  assert.throws(() => broker.phone(a.id, a.ownerToken));
  await broker.upload(
    a.id,
    a.phoneToken,
    "ink",
    "upload-identifier-1",
    async () => image,
  );
  assert.equal(broker.owner(a.id, a.ownerToken).context.worldId, "world-a");
  assert.equal(broker.owner(b.id, b.ownerToken).state, "waiting");
  await broker.upload(
    a.id,
    a.phoneToken,
    "retry",
    "upload-identifier-1",
    async () => {
      throw new Error("should not reprocess");
    },
  );
  await assert.rejects(
    () =>
      broker.upload(
        a.id,
        a.phoneToken,
        "replacement",
        "different-upload-id",
        async () => image,
      ),
    /already sent/,
  );
  let finish!: (value: string) => void;
  const pending = broker.upload(
    b.id,
    b.phoneToken,
    "ink",
    "upload-identifier-2",
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  broker.close(b.id, b.ownerToken);
  finish(image);
  await assert.rejects(() => pending, /closed/);
  now += 600_001;
  assert.throws(() => broker.owner(a.id, a.ownerToken), /expired/);
});
test("the drawing gateway normalizes real images and cannot expose model, owner, or arbitrary-host routes", async () => {
  const broker = new CaptureBroker(),
    pair = broker.create({ purpose: "create", name: "A drawing" });
  const gateway = captureGateway(
    "/missing-test-build",
    new Set(["127.0.0.1:5174"]),
    broker,
  );
  const headers = {
    host: "127.0.0.1:5174",
    authorization: `Bearer ${pair.phoneToken}`,
  };
  try {
    assert.equal(
      (
        await gateway.inject({
          url: `/api/capture/${pair.id}`,
          headers: { ...headers, host: "untrusted.example:5174" },
        })
      ).statusCode,
      403,
    );
    assert.equal(
      (
        await gateway.inject({
          url: `/api/capture/${pair.id}`,
          headers: { ...headers, origin: "https://untrusted.example" },
        })
      ).statusCode,
      403,
    );
    assert.equal(
      (
        await gateway.inject({
          url: `/api/capture/${pair.id}`,
          headers: { host: headers.host },
        })
      ).statusCode,
      404,
    );
    assert.equal(
      (await gateway.inject({ url: "/api/status", headers })).statusCode,
      404,
    );
    assert.equal(
      (
        await gateway.inject({
          method: "POST",
          url: "/api/interpret",
          payload: { image },
          headers,
        })
      ).statusCode,
      404,
    );
    assert.equal(
      (await gateway.inject({ url: `/api/pairings/${pair.id}`, headers }))
        .statusCode,
      404,
    );
    const sent = await gateway.inject({
      method: "POST",
      url: `/api/capture/${pair.id}`,
      headers,
      payload: { image, uploadId: "real-image-upload-1" },
    });
    assert.equal(sent.statusCode, 200, sent.body);
    assert.ok(
      broker
        .owner(pair.id, pair.ownerToken)
        .image?.startsWith("data:image/png;base64,"),
    );
    broker.close(pair.id, pair.ownerToken);
    assert.equal(
      (await gateway.inject({ url: `/api/capture/${pair.id}`, headers }))
        .statusCode,
      404,
    );
  } finally {
    await gateway.close();
  }
});
