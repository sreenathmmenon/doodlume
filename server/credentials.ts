import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { parse } from "dotenv";

// Import only Doodlume's server credentials from the owner's shared local file.
// Never source the file as shell code or load unrelated service secrets.
const providerKeys = [
  "MODEL_API_KEY",
  "BASETEN_API_KEY",
  "FIREWORKS_API_KEY",
] as const;
export function loadLocalProviderKeys(env: NodeJS.ProcessEnv = process.env) {
  const file = join(homedir(), ".env");
  if (!existsSync(file)) return;
  try {
    const stateless = parse(readFileSync(file));
    for (const key of providerKeys) {
      if (!env[key]?.trim() && stateless[key]?.trim())
        env[key] = stateless[key].trim();
    }
  } catch {
    // No raw parse/filesystem error reaches logs or the browser.
    console.warn("Shared local provider credentials could not be read.");
  }
}
