import {
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

export function validSavedWorlds(data: unknown): SavedWorld[] {
  if (!Array.isArray(data)) return [];
  return data.flatMap((item: SavedWorld) => {
    try {
      validateWorld(item.world);
      if (
        !item.state ||
        !Array.isArray(item.state.collected) ||
        !Array.isArray(item.state.activated) ||
        typeof item.savedAt !== "string" ||
        !Number.isFinite(Date.parse(item.savedAt))
      )
        return [];
      const history = Array.isArray(item.history)
        ? item.history.slice(-12).filter((entry) => {
            try {
              return (
                entry.before.id === item.world.id &&
                Number.isInteger(entry.appliedRevision) &&
                Boolean(validateWorld(entry.before))
              );
            } catch {
              return false;
            }
          })
        : [];
      return [{ ...item, history }];
    } catch {
      return [];
    }
  });
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

// Keep image-rich worlds out of the small string-only localStorage quota.
// Legacy data stays untouched as a migration backup. Updates and pruning are atomic.
export async function updateLibrary(
  legacy: SavedWorld[],
  entry?: SavedWorld,
): Promise<SavedWorld[]> {
  const db = await openLibrary();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("worlds", "readwrite"),
      store = tx.objectStore("worlds");
    const read = store.getAll();
    let next: SavedWorld[] = [];
    read.onsuccess = () => {
      const previous = validSavedWorlds(read.result),
        byId = new Map<string, SavedWorld>();
      for (const item of [...legacy, ...previous, ...(entry ? [entry] : [])]) {
        const existing = byId.get(item.world.id);
        if (
          !existing ||
          Date.parse(item.savedAt) >= Date.parse(existing.savedAt)
        )
          byId.set(item.world.id, item);
      }
      next = [...byId.values()]
        .sort((a, b) => Date.parse(b.savedAt) - Date.parse(a.savedAt))
        .slice(0, 8);
      const keep = new Set(next.map((item) => item.world.id));
      for (const item of previous)
        if (!keep.has(item.world.id)) store.delete(item.world.id);
      for (const item of next) {
        const old = previous.find((saved) => saved.world.id === item.world.id);
        if (
          !old ||
          item === entry ||
          Date.parse(item.savedAt) > Date.parse(old.savedAt)
        )
          store.put(item);
      }
    };
    tx.oncomplete = () => resolve(next);
    tx.onabort = tx.onerror = () =>
      reject(
        new Error(
          "This browser could not save the world. Your open world and earlier saves are unchanged.",
        ),
      );
  });
}
