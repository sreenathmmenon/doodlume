import {
  cpSync,
  existsSync,
  mkdirSync,
  realpathSync,
  rmSync,
  symlinkSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { gzipSync, brotliCompressSync, constants } from "node:zlib";
import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = resolve(import.meta.dirname, "..");
// A small source-only snapshot avoids repeated iCloud eviction during compilation.
// No .env or credential files are copied into the build context.
const snapshot = resolve(
  homedir(),
  ".cache",
  `doodlume-build-${createHash("sha256").update(root).digest("hex").slice(0, 10)}`,
);
mkdirSync(snapshot, { recursive: true, mode: 0o700 });
for (const name of ["src", "server", "shared", "public"])
  cpSync(resolve(root, name), resolve(snapshot, name), { recursive: true });
for (const name of [
  "package.json",
  "tsconfig.json",
  "vite.config.ts",
  "index.html",
])
  cpSync(resolve(root, name), resolve(snapshot, name));
if (!existsSync(resolve(snapshot, "node_modules")))
  symlinkSync(
    realpathSync(resolve(root, "node_modules")),
    resolve(snapshot, "node_modules"),
    "dir",
  );
const env = { ...process.env };
for (const name of [
  "MODEL_API_KEY",
  "BASETEN_API_KEY",
  "FIREWORKS_API_KEY",
  "MODAL_TOKEN_ID",
  "MODAL_TOKEN_SECRET",
])
  delete env[name];
for (const script of ["typescript/bin/tsc", "vite/bin/vite.js"]) {
  const result = spawnSync(
    process.execPath,
    [
      resolve(snapshot, "node_modules", script),
      ...(script.startsWith("typescript") ? ["--noEmit"] : ["build"]),
    ],
    { cwd: snapshot, env, stdio: "inherit" },
  );
  if (result.status !== 0) process.exit(result.status ?? 1);
}
// Negotiate compressed representations on the local production server too.
const built = resolve(snapshot, "dist");
for (const entry of readdirSync(built, {
  recursive: true,
  withFileTypes: true,
})) {
  if (!entry.isFile() || !/\.(?:js|css|html|svg|ttf|json)$/.test(entry.name))
    continue;
  const path = resolve(entry.parentPath, entry.name),
    bytes = readFileSync(path);
  if (bytes.length < 128) continue;
  writeFileSync(`${path}.gz`, gzipSync(bytes, { level: 9 }));
  writeFileSync(
    `${path}.br`,
    brotliCompressSync(bytes, {
      params: { [constants.BROTLI_PARAM_QUALITY]: 5 },
    }),
  );
}
rmSync(resolve(root, "dist"), { recursive: true, force: true });
cpSync(resolve(snapshot, "dist"), resolve(root, "dist"), { recursive: true });
