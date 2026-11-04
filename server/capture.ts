import Fastify, { type FastifyInstance } from "fastify";
import fastifyStatic from "@fastify/static";
import { randomBytes, createHash, timingSafeEqual } from "node:crypto";
import { networkInterfaces } from "node:os";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import QRCode from "qrcode";
import type { CaptureContext } from "../shared/capture.js";
import { InterpretationError } from "./model.js";
import { normalizeDrawing, imageData } from "./images.js";
export class CaptureError extends Error {
  constructor(
    message: string,
    public status = 404,
  ) {
    super(message);
  }
}
const hash = (value: string) => createHash("sha256").update(value).digest();
const valid = (value: unknown, expected: Buffer) =>
  typeof value === "string" &&
  value.length === 64 &&
  timingSafeEqual(hash(value), expected);
interface Session {
  context: CaptureContext;
  expiresAt: number;
  owner: Buffer;
  phone: Buffer;
  image?: string;
  uploadId?: string;
  uploading: boolean;
  network: boolean;
}
export class CaptureBroker {
  private sessions = new Map<string, Session>();
  constructor(private now: () => number = Date.now) {}
  prune() {
    for (const [id, s] of this.sessions)
      if (s.expiresAt <= this.now()) this.sessions.delete(id);
  }
  hasNetwork() {
    this.prune();
    return [...this.sessions.values()].some((s) => s.network);
  }
  create(input: unknown, network = false) {
    this.prune();
    if (this.sessions.size >= 8)
      throw new CaptureError(
        "Close an older phone connection before opening another.",
        429,
      );
    const c = input as CaptureContext;
    if (
      !c ||
      !["create", "update"].includes(c.purpose) ||
      typeof c.name !== "string" ||
      !c.name.trim() ||
      c.name.length > 80 ||
      (c.purpose === "update" &&
        (typeof c.worldId !== "string" ||
          !/^[\w-]{1,80}$/.test(c.worldId) ||
          !Number.isInteger(c.revision) ||
          c.revision! < 1))
    )
      throw new CaptureError("Choose a valid world for this capture.", 400);
    const id = randomBytes(16).toString("hex"),
      ownerToken = randomBytes(32).toString("hex"),
      phoneToken = randomBytes(32).toString("hex"),
      expiresAt = this.now() + 10 * 60_000;
    const context: CaptureContext = {
      purpose: c.purpose,
      name: c.name,
      ...(c.purpose === "update"
        ? { worldId: c.worldId, revision: c.revision }
        : {}),
    };
    this.sessions.set(id, {
      context,
      expiresAt,
      owner: hash(ownerToken),
      phone: hash(phoneToken),
      uploading: false,
      network,
    });
    return { id, ownerToken, phoneToken, expiresAt, context };
  }
  private get(id: string, token: unknown, role: "owner" | "phone") {
    this.prune();
    const s = this.sessions.get(id);
    if (!s || !valid(token, s[role]))
      throw new CaptureError(
        "This connection is closed or expired. Open a new link from your studio.",
      );
    return s;
  }
  owner(id: string, token: unknown) {
    const s = this.get(id, token, "owner");
    return {
      state: s.image ? "ready" : "waiting",
      image: s.image,
      context: s.context,
      expiresAt: s.expiresAt,
    };
  }
  phone(id: string, token: unknown) {
    const s = this.get(id, token, "phone");
    return {
      state: s.image ? "sent" : "waiting",
      context: s.context,
      expiresAt: s.expiresAt,
    };
  }
  close(id: string, token: unknown) {
    this.get(id, token, "owner");
    this.sessions.delete(id);
  }
  async upload(
    id: string,
    token: unknown,
    image: unknown,
    uploadId: unknown,
    normalize: (image: unknown) => Promise<string> = async (image) =>
      imageData(await normalizeDrawing(image)),
  ) {
    const s = this.get(id, token, "phone");
    if (typeof uploadId !== "string" || !/^[\w-]{16,80}$/.test(uploadId))
      throw new CaptureError("This photo needs a fresh send attempt.", 400);
    if (s.image) {
      if (s.uploadId === uploadId) return { sent: true };
      throw new CaptureError(
        "This connection has already sent its drawing. Start a new capture for another page.",
        409,
      );
    }
    if (
      s.uploading ||
      [...this.sessions.values()].filter((s) => s.uploading).length >= 2
    )
      throw new CaptureError(
        "A photo is still arriving. Please wait a moment.",
        429,
      );
    s.uploading = true;
    try {
      const normalized = await normalize(image);
      if (this.sessions.get(id) !== s || s.expiresAt <= this.now())
        throw new CaptureError(
          "The studio closed this connection. Open a new link.",
          410,
        );
      if (
        normalized.length > 8_000_000 ||
        [...this.sessions.values()].reduce(
          (n, s) => n + (s.image?.length ?? 0),
          0,
        ) +
          normalized.length >
          24_000_000
      )
        throw new CaptureError(
          "This photo is too large. Choose a smaller image or close older captures.",
          413,
        );
      s.image = normalized;
      s.uploadId = uploadId;
      return { sent: true };
    } finally {
      s.uploading = false;
    }
  }
}
const token = (authorization: string | undefined) =>
  authorization?.startsWith("Bearer ") ? authorization.slice(7) : undefined;
export function phoneRoutes(app: FastifyInstance, broker: CaptureBroker) {
  app.get<{ Params: { id: string } }>(
    "/api/capture/:id",
    async (req, reply) => {
      reply.header("Cache-Control", "no-store");
      return broker.phone(req.params.id, token(req.headers.authorization));
    },
  );
  app.post<{
    Params: { id: string };
    Body: { image?: unknown; uploadId?: unknown };
  }>("/api/capture/:id", async (req, reply) => {
    reply.header("Cache-Control", "no-store");
    try {
      return await broker.upload(
        req.params.id,
        token(req.headers.authorization),
        req.body?.image,
        req.body?.uploadId,
      );
    } catch (error) {
      if (error instanceof InterpretationError)
        throw new CaptureError(error.message, error.status);
      throw error;
    }
  });
}
export function captureGateway(
  dist: string,
  hosts: Set<string>,
  broker: CaptureBroker,
) {
  const gateway = Fastify({
    bodyLimit: 8_100_000,
    logger: false,
    forceCloseConnections: true,
  });
  gateway.addHook("onRequest", async (req, reply) => {
    reply
      .header("Referrer-Policy", "no-referrer")
      .header("X-Content-Type-Options", "nosniff");
    const host = req.headers.host;
    if (
      !host ||
      !hosts.has(host) ||
      (req.headers.origin && req.headers.origin !== `http://${host}`)
    )
      return reply
        .code(403)
        .send({ error: "Use the phone link from your studio." });
  });
  phoneRoutes(gateway, broker);
  if (existsSync(resolve(dist, "assets")))
    gateway.register(fastifyStatic, {
      root: resolve(dist, "assets"),
      prefix: "/assets/",
    });
  gateway.get<{ Params: { id: string } }>(
    "/capture/:id",
    async (req, reply) => {
      if (
        !/^[a-f0-9]{32}$/.test(req.params.id) ||
        !existsSync(resolve(dist, "index.html"))
      )
        return reply
          .code(404)
          .send({ error: "Open the phone link from your studio." });
      reply.header("Cache-Control", "no-store").type("text/html");
      const { readFile } = await import("node:fs/promises");
      return readFile(resolve(dist, "index.html"));
    },
  );
  gateway.setErrorHandler((error, _req, reply) =>
    reply
      .code(
        error instanceof CaptureError
          ? error.status
          : (error as { statusCode?: number }).statusCode === 413
            ? 413
            : 400,
      )
      .send({
        error:
          error instanceof CaptureError
            ? error.message
            : "This photo could not be received. Try a smaller, clear image.",
      }),
  );
  gateway.setNotFoundHandler((_req, reply) =>
    reply
      .code(404)
      .send({ error: "This connection only accepts paired drawing captures." }),
  );
  return gateway;
}
export function installCapture(
  app: FastifyInstance,
  dist: string,
  port: number,
  publicOrigin?: string,
) {
  const broker = new CaptureBroker();
  phoneRoutes(app, broker);
  let gateway: FastifyInstance | null = null,
    start: Promise<void> | null = null;
  const gatewayPort = port + 1;
  const addresses = () =>
    Object.values(networkInterfaces())
      .flatMap((list) =>
        (list ?? [])
          .filter(
            (a) =>
              !a.internal &&
              a.family === "IPv4" &&
              /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(a.address),
          )
          .map((a) => a.address),
      )
      .slice(0, 4);
  async function stopIfIdle() {
    if (gateway && !broker.hasNetwork()) {
      const closing = gateway;
      gateway = null;
      await closing.close();
    }
  }
  async function network() {
    if (!existsSync(resolve(dist, "index.html"))) throw new CaptureError("Start the built studio to pair a physical phone. You can still upload a photo here.",503);
    if (gateway) return addresses();
    if (start) {
      await start;
      return addresses();
    }
    const ips = addresses();
    if (!ips.length)
      throw new CaptureError(
        "Connect the laptop and phone to the same Wi-Fi, then try again.",
        503,
      );
    const next = captureGateway(
      dist,
      new Set(
        [...ips, "127.0.0.1", "localhost"].map((ip) => `${ip}:${gatewayPort}`),
      ),
      broker,
    );
    start = (async () => {
      try {
        await next.listen({ host: "0.0.0.0", port: gatewayPort });
        gateway = next;
      } catch {
        await next.close();
        throw new CaptureError(
          "The local phone connection could not start. Try a different network or upload from this computer.",
          503,
        );
      } finally {
        start = null;
      }
    })();
    await start;
    return ips;
  }
  const cleanup = setInterval(() => {
    broker.prune();
    void stopIfIdle();
  }, 30_000);
  cleanup.unref();
  app.addHook("onClose", async () => {
    clearInterval(cleanup);
    await gateway?.close();
  });
  app.post<{ Body: { context?: unknown; network?: unknown } }>(
    "/api/pairings",
    async (req, reply) => {
      if (typeof req.body?.network !== "boolean")
        throw new CaptureError("Choose how to connect your phone.", 400);
      // Wi-Fi listener starts only when the creator explicitly chooses it in the studio.
      const ips = req.body.network && !publicOrigin ? await network() : [];
      let pair;
      try {
        pair = broker.create(req.body.context, req.body.network && !publicOrigin);
      } catch (e) {
        await stopIfIdle();
        throw e;
      }
      const bases = publicOrigin ? [publicOrigin] : req.body.network
        ? ips.map((ip) => `http://${ip}:${gatewayPort}`)
        : [req.headers.origin ?? `http://127.0.0.1:${port}`];
      const links = await Promise.all(
        bases.map(async (base) => {
          const url = `${base}/capture/${pair.id}#${pair.phoneToken}`;
          return {
            url,
            qr: await QRCode.toDataURL(url, {
              width: 280,
              margin: 4,
              errorCorrectionLevel: "M",
              color: { dark: "#3f5034", light: "#fffdf8" },
            }),
            label: base,
          };
        }),
      );
      reply.header("Cache-Control", "no-store");
      return {
        id: pair.id,
        ownerToken: pair.ownerToken,
        expiresAt: pair.expiresAt,
        context: pair.context,
        network: req.body.network && !publicOrigin,
        links,
      };
    },
  );
  app.get<{ Params: { id: string } }>(
    "/api/pairings/:id",
    async (req, reply) => {
      reply.header("Cache-Control", "no-store");
      return broker.owner(req.params.id, token(req.headers.authorization));
    },
  );
  app.delete<{ Params: { id: string } }>(
    "/api/pairings/:id",
    async (req, reply) => {
      broker.close(req.params.id, token(req.headers.authorization));
      void stopIfIdle();
      return reply.code(204).send();
    },
  );
  return broker;
}
