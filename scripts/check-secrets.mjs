import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import dotenv from "dotenv";

const root = path.resolve(import.meta.dirname, "..");
const git = (...args) =>
  execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 24_000_000,
  });
const known = [];
for (const file of [
  path.join(os.homedir(), ".env"),
  path.join(root, ".env.local"),
  path.join(root, ".env"),
]) {
  if (!fs.existsSync(file)) continue;
  const values = dotenv.parse(fs.readFileSync(file));
  for (const name of [
    "MODEL_API_KEY",
    "BASETEN_API_KEY",
    "FIREWORKS_API_KEY",
    "MODAL_TOKEN_ID",
    "MODAL_TOKEN_SECRET",
  ]) {
    if (values[name]?.trim().length > 12) known.push(values[name].trim());
  }
  const modalFile = values.MODAL_API_KEY_FILE;
  if (modalFile && fs.existsSync(modalFile)) {
    const config = fs.readFileSync(modalFile, "utf8");
    for (const match of config.matchAll(/^\s*token_(?:id|secret)\s*=\s*["']([^"']+)["']/gm)) {
      if (match[1].length > 12) known.push(match[1]);
    }
  }
}
const files = git("ls-files", "-z").split("\0").filter(Boolean);
const sensitiveName = (file) =>
  (/(^|\/)\.env(?:\..+)?$/.test(file) && !file.endsWith(".example")) ||
  /(^|\/)(?:\.modal\.toml|modal-key[^/]*|modal-credentials[^/]*|[^/]*credentials[^/]*\.json)$|\.(?:pem|key|p12|pfx|jks)$/.test(
    file,
  ) ||
  /(^|\/)(?:secrets|credentials|private-keys)\//.test(file);
let failed = false;
for (const file of files) {
  if (sensitiveName(file)) {
    console.error(`Credential file is tracked: ${file}`);
    failed = true;
    continue;
  }
  // Check the staged/committed blob as well as the worktree, without putting a secret in argv.
  const blobs = [];
  try {
    blobs.push(
      execFileSync("git", ["show", `:${file}`], {
        cwd: root,
        maxBuffer: 24_000_000,
      }),
    );
  } catch {
    failed = true;
  }
  if (fs.existsSync(path.join(root, file)))
    blobs.push(fs.readFileSync(path.join(root, file)));
  if (
    known.some((secret) =>
      blobs.some((blob) => blob.includes(Buffer.from(secret))),
    )
  ) {
    console.error(`A configured credential occurs in a tracked file: ${file}`);
    failed = true;
  }
}
for (const file of [
  ".env",
  ".env.local",
  ".env.production",
  ".modal.toml",
  "credentials/provider.json",
  "private-keys/service.key",
  "modal-key.toml",
]) {
  try {
    git("check-ignore", "--no-index", "-q", file);
  } catch {
    console.error(`Credential ignore rule missing: ${file}`);
    failed = true;
  }
}
const dist = path.join(root, "dist");
if (fs.existsSync(dist)) {
  for (const file of fs.readdirSync(dist, { recursive: true, withFileTypes: true })) {
    if (!file.isFile()) continue;
    const blob = fs.readFileSync(path.join(file.parentPath, file.name));
    if (known.some(secret => blob.includes(Buffer.from(secret)))) {
      console.error("A configured credential occurs in the generated browser build.");
      failed = true;
      break;
    }
  }
}
if (failed) process.exitCode = 1;
else
  console.log(
    "Credential scan passed: provider credentials absent from tracked files, staged blobs and browser build; credential filenames are ignored.",
  );
