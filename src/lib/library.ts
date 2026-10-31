import {
  retainPlayState,
  validateWorld,
  type WorldDefinition,
  type PlayState,
} from "../../shared/world";
import type { RevisionCheckpoint } from "../../shared/revisions";

export interface SavedWorld {
  world: WorldDefinition;
  state: PlayState;
  savedAt: string;
  history?: RevisionCheckpoint[];
}
export const MAX_BACKUP_BYTES = 64 * 1024 * 1024;
function savedWorld(value: unknown): SavedWorld {
  if (!value || typeof value !== "object")
    throw new Error("Invalid saved world.");
  const item = value as SavedWorld;
  const world = validateWorld(item.world);
  const s = item.state;
  const finitePoint = (point: unknown, max: number) =>
    Boolean(
      point &&
        typeof point === "object" &&
        ["x", "y"].every(
          (key) =>
            Number.isFinite((point as Record<string, number>)[key]) &&
            Math.abs((point as Record<string, number>)[key]) <= max,
        ),
    );
  if (
    !s ||
    typeof s.completed !== "boolean" ||
    (s.exploring !== undefined && typeof s.exploring !== "boolean") ||
    (s.facingLeft !== undefined && typeof s.facingLeft !== "boolean") ||
    (s.player !== null && !finitePoint(s.player, 20000)) ||
    (s.velocity !== undefined && !finitePoint(s.velocity, 5000)) ||
    !Array.isArray(s.collected) ||
    !Array.isArray(s.activated) ||
    ![...s.collected, ...s.activated].every((id) => typeof id === "string") ||
    new Set(s.collected).size !== s.collected.length ||
    new Set(s.activated).size !== s.activated.length ||
    s.collected.some(
      (id) => !world.entities.some((e) => e.id === id && e.kind === "coin"),
    ) ||
    s.activated.some(
      (id) => !world.entities.some((e) => e.id === id && e.kind === "lever"),
    ) ||
    typeof item.savedAt !== "string" ||
    !Number.isFinite(Date.parse(item.savedAt))
  )
    throw new Error("Invalid saved progress.");
  const history = item.history ?? [];
  if (!Array.isArray(history) || history.length > 12)
    throw new Error("Invalid undo history.");
  for (const entry of history) {
    if (
      !entry ||
      validateWorld(entry.before).id !== world.id ||
      !Number.isInteger(entry.appliedRevision) ||
      entry.appliedRevision <= entry.before.revision ||
      entry.appliedRevision > world.revision
    )
      throw new Error("Invalid undo history.");
  }
  return {
    world,
    state: retainPlayState(world, s),
    savedAt: item.savedAt,
    history,
  };
}
export function validSavedWorlds(data: unknown): SavedWorld[] {
  if (!Array.isArray(data)) return [];
  return data.flatMap((item) => {
    try {
      return [savedWorld(item)];
    } catch {
      return [];
    }
  });
}

// Explicit saves replace that world's prior version; imports never replace an existing ID.
// There is no retention cap and no deletion path in loading, migration or saving.
export function mergeLibraryRecords(
  legacy: SavedWorld[],
  stored: SavedWorld[],
  incoming: SavedWorld[] = [],
  mode: "save" | "import" | "copies" = "save",
) {
  const byId = new Map<string, SavedWorld>();
  for (const item of validSavedWorlds(legacy)) {
    const old = byId.get(item.world.id);
    if (!old || Date.parse(item.savedAt) >= Date.parse(old.savedAt))
      byId.set(item.world.id, item);
  }
  // Legacy localStorage is a migration backup, never authority over an existing IDB save.
  for (const item of validSavedWorlds(stored)) byId.set(item.world.id, item);
  let imported = 0,
    skipped = 0;
  const changed = new Set<string>();
  for (const value of incoming) {
    let item = savedWorld(value);
    if (mode !== "save" && byId.has(item.world.id)) {
      if (mode === "import") {
        skipped++;
        continue;
      }
      const id = crypto.randomUUID();
      item = {
        ...structuredClone(item),
        world: {
          ...structuredClone(item.world),
          id,
          name: `${item.world.name.slice(0, 64)} (imported copy)`,
        },
        savedAt: new Date().toISOString(),
        history: item.history?.map((h) => ({
          ...structuredClone(h),
          before: { ...structuredClone(h.before), id },
        })),
      };
    }
    byId.set(item.world.id, item);
    changed.add(item.world.id);
    imported++;
  }
  return {
    entries: [...byId.values()].sort(
      (a, b) => Date.parse(b.savedAt) - Date.parse(a.savedAt),
    ),
    imported,
    skipped,
    changed,
  };
}
export function serializeBackup(entries: SavedWorld[]): string {
  const worlds = entries.map(savedWorld);
  const text = JSON.stringify(
    {
      format: "doodlume-library",
      version: 1,
      exportedAt: new Date().toISOString(),
      worlds,
    },
    null,
    2,
  );
  if (new Blob([text]).size > MAX_BACKUP_BYTES)
    throw new Error(
      "Back up individual worlds: this library exceeds the 64 MB backup limit.",
    );
  return text;
}
export function parseBackup(text: string): SavedWorld[] {
  if (new Blob([text]).size > MAX_BACKUP_BYTES)
    throw new Error("Choose a backup smaller than 64 MB.");
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("This file is not a readable Doodlume backup.");
  }
  if (
    !data ||
    data.format !== "doodlume-library" ||
    data.version !== 1 ||
    !Array.isArray(data.worlds) ||
    !data.worlds.length ||
    data.worlds.length > 1000
  )
    throw new Error(
      "Choose a supported Doodlume backup containing saved worlds.",
    );
  try {
    const entries = data.worlds.map(savedWorld) as SavedWorld[];
    if (new Set(entries.map((e) => e.world.id)).size !== entries.length)
      throw new Error();
    return entries;
  } catch {
    throw new Error(
      "This backup has invalid world data. Nothing was imported.",
    );
  }
}

let database: Promise<IDBDatabase> | undefined;
function openLibrary() {
  if (database) return database;
  database = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("doodlume.library.v1", 1);
    let expired = false;
    const timeout = setTimeout(() => {
      expired = true;
      database = undefined;
      reject(new Error("World storage did not open in time."));
    }, 5000);
    const fail = () => {
      expired = true;
      clearTimeout(timeout);
      database = undefined;
      reject(new Error("World storage could not be opened."));
    };
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains("worlds"))
        request.result.createObjectStore("worlds", { keyPath: "world.id" });
    };
    request.onerror = fail;
    request.onblocked = fail;
    request.onsuccess = () => {
      clearTimeout(timeout);
      if (expired) {
        request.result.close();
        return;
      }
      request.result.onversionchange = () => {
        request.result.close();
        database = undefined;
      };
      resolve(request.result);
    };
  });
  return database;
}
async function writeLibrary(
  legacy: SavedWorld[],
  incoming: SavedWorld[],
  mode: "save" | "import" | "copies",
) {
  // Reject malformed input before starting a write transaction.
  incoming.forEach(savedWorld);
  const db = await openLibrary();
  return new Promise<ReturnType<typeof mergeLibraryRecords>>(
    (resolve, reject) => {
      const tx = db.transaction("worlds", "readwrite"),
        store = tx.objectStore("worlds");
      const read = store.getAll();
      let result: ReturnType<typeof mergeLibraryRecords>;
      read.onsuccess = () => {
        try {
          const previous = validSavedWorlds(read.result);
          result = mergeLibraryRecords(legacy, previous, incoming, mode);
          for (const item of result.entries) {
            const old = previous.find((e) => e.world.id === item.world.id);
            if (
              !old ||
              result.changed.has(item.world.id) ||
              Date.parse(item.savedAt) > Date.parse(old.savedAt)
            )
              store.put(item);
          }
        } catch {
          tx.abort();
        }
      };
      tx.oncomplete = () => resolve(result);
      tx.onabort = tx.onerror = () =>
        reject(
          new Error(
            "Storage could not finish. Earlier saves are unchanged. Back up your open world and free some browser storage before retrying.",
          ),
        );
    },
  );
}
export async function updateLibrary(legacy: SavedWorld[], entry?: SavedWorld) {
  return (await writeLibrary(legacy, entry ? [entry] : [], "save")).entries;
}
export async function importWorlds(
  legacy: SavedWorld[],
  entries: SavedWorld[],
  copies: boolean,
) {
  return writeLibrary(legacy, entries, copies ? "copies" : "import");
}
