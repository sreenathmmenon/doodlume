import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { accessSync, constants, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import sharp from "sharp";

export interface LocalSegmentationConfig {
  python: string;
  checkpoint: string;
  worker: string;
  configured: boolean;
}
export interface LocalMaskBox { id: string; left: number; top: number; right: number; bottom: number }
interface MaskRecord { id: string; png: string; score: number; visible: number; pixels: number }
interface MaskReply { id: string; records: MaskRecord[]; ms: number; model: string; device: string }
const MODEL = "Meta SAM 2.1 tiny";
const MAX_INPUT = 8_000_000;
const MAX_OUTPUT = 32_000_000;
const MAX_CROP_PIXELS = 8_000_000;

function coherentMask(rgba: Buffer, width: number, height: number, visible: number) {
  const seen = new Uint8Array(width * height), queue = new Int32Array(width * height);
  // A high-confidence model score alone can still produce a shredded photo
  // subject. Reject that mask instead of erasing source parts or filling them
  // speculatively. The caller retains its honest original crop for this object.
  for (let index = 0; index < seen.length; index++) {
    if (seen[index] || rgba[index * 4 + 3] <= 20) continue;
    let head = 0, tail = 1;
    queue[0] = index; seen[index] = 1;
    while (head < tail) {
      const at = queue[head++], x = at % width, y = Math.floor(at / width);
      for (const next of [x ? at - 1 : -1, x + 1 < width ? at + 1 : -1,
        y ? at - width : -1, y + 1 < height ? at + width : -1])
        if (next >= 0 && !seen[next] && rgba[next * 4 + 3] > 20) { seen[next] = 1; queue[tail++] = next; }
    }
    if (tail / visible >= .97) return true;
  }
  return false;
}

export function localSegmentationConfig(env: Record<string, string | undefined>): LocalSegmentationConfig {
  const runtime = join(homedir(), ".cache", "doodlume-sam-runtime");
  const python = env.LOCAL_SAM_PYTHON?.trim() || join(runtime, "bin", "python");
  const checkpoint = env.LOCAL_SAM_CHECKPOINT?.trim() || join(runtime, "models", "sam2.1_hiera_tiny.pt");
  const worker = env.LOCAL_SAM_WORKER?.trim() || fileURLToPath(new URL("../scripts/local-sam-worker.py", import.meta.url));
  let configured = false;
  try { accessSync(python, constants.X_OK); configured = existsSync(checkpoint) && existsSync(worker); } catch { /* Private paths never enter browser errors. */ }
  return { python, checkpoint, worker, configured };
}

const runners = new Map<string, LocalSamRunner>();
let cleanupInstalled = false;
export function closeLocalSegmentationWorkers() {
  for (const runner of runners.values()) runner.close();
  runners.clear();
}

class LocalSamRunner {
  private child: ChildProcessWithoutNullStreams | null = null;
  private ready = false;
  private closed = false;
  private buffer = "";
  private stderrBytes = 0;
  private stdoutBytes = 0;
  private tail: Promise<void> = Promise.resolve();
  private queued = 0;
  private idle: ReturnType<typeof setTimeout> | undefined;
  private waiter: { kind: "ready" | "reply"; id?: string; resolve: (value: unknown) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> } | undefined;
  constructor(private config: LocalSegmentationConfig) {}

  close() { this.closed = true; this.stop(new Error("Local cutout worker stopped.")); }
  invalidate() { this.stop(new Error("Local cutout response was invalid.")); }
  private stop(error: Error) {
    clearTimeout(this.idle); this.idle = undefined;
    const child = this.child;
    this.child = null; this.ready = false; this.buffer = "";
    const waiter = this.waiter; this.waiter = undefined;
    if (waiter) { clearTimeout(waiter.timer); waiter.reject(error); }
    if (child) {
      child.stdin.destroy(); child.stdout.destroy(); child.stderr.destroy();
      // No unrelated process discovery or process-group termination.
      child.kill("SIGKILL");
    }
  }
  private wait(kind: "ready" | "reply", id?: string): Promise<unknown> {
    this.stdoutBytes = 0;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => this.stop(new Error("Local cutout worker timed out.")), kind === "ready" ? 40_000 : 30_000);
      this.waiter = { kind, id, resolve, reject, timer };
    });
  }
  private receive(chunk: Buffer) {
    this.stdoutBytes += chunk.length;
    this.buffer += chunk.toString("utf8");
    if (this.stdoutBytes > MAX_OUTPUT || this.buffer.length > MAX_OUTPUT) { this.stop(new Error("Local cutout response exceeded its bounds.")); return; }
    let end: number;
    while ((end = this.buffer.indexOf("\n")) !== -1) {
      const line = this.buffer.slice(0, end); this.buffer = this.buffer.slice(end + 1);
      if (!line.trim()) continue;
      try {
        const value = JSON.parse(line);
        const waiter = this.waiter;
        if (!waiter || !value || typeof value !== "object") throw new Error();
        if (waiter.kind === "ready") {
          if (value.ready !== true || value.model !== MODEL || !["mps", "cpu"].includes(value.device)) throw new Error();
          this.ready = true;
        } else if (value.id !== waiter.id || value.error || value.model !== MODEL || !["mps", "cpu"].includes(value.device) ||
                   !Number.isFinite(value.ms) || value.ms < 0 || value.ms > 120_000 || !Array.isArray(value.records)) throw new Error();
        this.waiter = undefined; clearTimeout(waiter.timer); waiter.resolve(value);
      } catch { this.stop(new Error("Local cutout worker returned an unreadable response.")); return; }
    }
  }
  private async ensureReady() {
    if (this.child && this.ready) return;
    this.buffer = ""; this.stderrBytes = 0;
    const ready = this.wait("ready");
    try {
      const child = spawn(this.config.python, ["-u", this.config.worker, this.config.checkpoint], {
        stdio: ["pipe", "pipe", "pipe"], windowsHide: true,
        // The worker needs model/runtime configuration, never inference keys.
        env: { PATH: process.env.PATH, HOME: homedir(), PYTHONUNBUFFERED: "1", PYTHONDONTWRITEBYTECODE: "1", PYTORCH_ENABLE_MPS_FALLBACK: "1" },
      });
      this.child = child; child.unref();
      for (const stream of [child.stdin, child.stdout, child.stderr])
        (stream as typeof stream & { unref?: () => void }).unref?.();
      child.stdout.on("data", (chunk: Buffer) => { if (this.child === child) this.receive(chunk); });
      child.stderr.on("data", (chunk: Buffer) => {
        if (this.child !== child) return;
        this.stderrBytes += chunk.length;
        if (this.stderrBytes > 512_000) this.stop(new Error("Local cutout worker exceeded its diagnostic bounds."));
      });
      child.on("error", () => { if (this.child === child) this.stop(new Error("Local cutout worker could not start.")); });
      child.on("exit", () => { if (this.child === child) this.stop(new Error("Local cutout worker exited.")); });
      child.stdin.on("error", () => { if (this.child === child) this.stop(new Error("Local cutout input could not be read.")); });
    } catch { this.stop(new Error("Local cutout worker could not start.")); }
    await ready;
  }
  request(image: string, boxes: LocalMaskBox[], signal: AbortSignal): Promise<MaskReply> {
    signal.throwIfAborted();
    if (this.closed) return Promise.reject(new Error("Local cutout worker is closed."));
    if (this.queued >= 4) return Promise.reject(new Error("Local cutout queue is full."));
    this.queued++;
    clearTimeout(this.idle); this.idle = undefined;
    return new Promise((resolve, reject) => {
      let settled = false, started = false;
      const fail = (error: unknown) => {
        if (settled) return;
        settled = true; signal.removeEventListener("abort", abort);
        reject(error instanceof Error ? error : new Error("Local cutout was stopped."));
      };
      const abort = () => {
        if (started) this.stop(new Error("Local cutout was cancelled."));
        fail(signal.reason);
      };
      signal.addEventListener("abort", abort, { once: true });
      if (signal.aborted) abort();
      this.tail = this.tail.catch(() => {}).then(async () => {
        this.queued--;
        if (settled) {
          if (this.child && !this.queued) { this.idle = setTimeout(() => this.stop(new Error("Local cutout worker was idle.")), 90_000); this.idle.unref(); }
          return;
        }
        started = true;
        try {
          if (this.closed) throw new Error("Local cutout worker is closed.");
          await this.ensureReady();
          signal.throwIfAborted();
          const id = randomUUID(), reply = this.wait("reply", id);
          this.child!.stdin.write(JSON.stringify({ id, image, objects: boxes }) + "\n", error => {
            if (error) this.stop(new Error("Local cutout input could not be written."));
          });
          const value = await reply as MaskReply;
          if (!settled) { settled = true; signal.removeEventListener("abort", abort); resolve(value); }
        } catch (error) { fail(error); }
        finally {
          if (this.child && !this.queued) {
            this.idle = setTimeout(() => this.stop(new Error("Local cutout worker was idle.")), 90_000);
            this.idle.unref();
          }
        }
      });
    });
  }
}

/** Local inference only. Neither this process nor its child has an HTTP client,
 * inference credentials, provider fallbacks or automatic model downloads.
 */
export async function localSegmentationArtwork(source: Buffer, boxes: LocalMaskBox[], config: LocalSegmentationConfig, signal: AbortSignal): Promise<Map<string, string>> {
  signal.throwIfAborted();
  if (!config.configured || !boxes.length || boxes.length > 24 || source.length * 4 / 3 > MAX_INPUT)
    throw new Error("Local cutout input is unavailable or exceeds its bounds.");
  const size = await sharp(source).metadata();
  if (!size.width || !size.height || size.width * size.height > 2_000_000) throw new Error("Local cutout image exceeds its bounds.");
  const ids = new Set<string>(); let pixels = 0;
  for (const box of boxes) {
    if (!/^[\w-]{1,60}$/.test(box.id) || ids.has(box.id) || ![box.left, box.top, box.right, box.bottom].every(Number.isSafeInteger) ||
        box.left < 0 || box.top < 0 || box.right > size.width || box.bottom > size.height || box.right <= box.left || box.bottom <= box.top)
      throw new Error("Local cutout selections are invalid.");
    ids.add(box.id); pixels += (box.right - box.left) * (box.bottom - box.top);
  }
  if (pixels > MAX_CROP_PIXELS) throw new Error("Local cutout selections exceed their combined bounds.");
  const key = [config.python, config.checkpoint, config.worker].join("\0");
  let runner = runners.get(key);
  if (!runner) { runner = new LocalSamRunner(config); runners.set(key, runner); }
  if (!cleanupInstalled) { cleanupInstalled = true; process.once("exit", closeLocalSegmentationWorkers); }
  const reply = await runner.request(source.toString("base64"), boxes, signal);
  try {
    signal.throwIfAborted();
    if (reply.records.length > boxes.length) throw new Error("Local cutout records exceed the requested count.");
    const result = new Map<string, string>();
    for (const record of reply.records) {
      signal.throwIfAborted();
      const box = boxes.find(candidate => candidate.id === record.id);
      if (!box || result.has(record.id) || typeof record.png !== "string" || record.png.length > 12_000_000 ||
          !/^[A-Za-z0-9+/]+={0,2}$/.test(record.png) || record.png.length % 4 ||
          !Number.isFinite(record.score) || record.score < .5 || record.score > 1 ||
          !Number.isSafeInteger(record.visible) || !Number.isSafeInteger(record.pixels)) throw new Error("Local cutout record is invalid.");
      const width = box.right - box.left, height = box.bottom - box.top;
      if (record.pixels !== width * height || record.visible < 3 || record.visible > record.pixels || record.visible / record.pixels < .005)
        continue;
      const png = Buffer.from(record.png, "base64");
      const metadata = await sharp(png, { limitInputPixels: 2_000_000 }).metadata();
      if (metadata.format !== "png" || metadata.width !== width || metadata.height !== height || metadata.channels !== 4 || !metadata.hasAlpha)
        throw new Error("Local cutout dimensions do not match their source.");
      const actual = await sharp(png).raw().toBuffer();
      const original = await sharp(source).extract({ left: box.left, top: box.top, width, height }).removeAlpha().toColourspace("srgb").raw().toBuffer();
      let visible = 0;
      for (let at = 0; at < record.pixels; at++) {
        if (actual[at * 4] !== original[at * 3] || actual[at * 4 + 1] !== original[at * 3 + 1] || actual[at * 4 + 2] !== original[at * 3 + 2])
          throw new Error("Local cutout changed original source pixels.");
        if (actual[at * 4 + 3] > 20) visible++;
      }
    if (visible !== record.visible) throw new Error("Local cutout visibility metadata did not match its pixels.");
    if (!coherentMask(actual, width, height, visible)) continue;
      result.set(record.id, `data:image/png;base64,${record.png}`);
    }
    return result;
  } catch (error) { runner.invalidate(); throw error; }
}
