import {
  retainPlayState,
  validateWorld,
  type WorldDefinition,
  type PlayState,
  type WorldEntity,
} from "../../shared/world";
import type { RevisionCheckpoint } from "../../shared/revisions";

export interface SavedWorld {
  world: WorldDefinition;
  state: PlayState;
  savedAt: string;
  history?: RevisionCheckpoint[];
}
export const MAX_BACKUP_BYTES = 64 * 1024 * 1024;
export const MAX_EXPANDED_BACKUP_BYTES = 512 * 1024 * 1024;
export class BackupSizeError extends Error {}
const pngAsset = /^data:image\/png;base64,[A-Za-z0-9+/=]+$/;
const publicArtwork =
  /^\/art\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+\.(?:svg|png|jpe?g|webp)$/i;
type AssetReference = { $asset: number };
type BackupImage = string | AssetReference;
type BackupWorld = Omit<WorldDefinition, "sourceImage" | "entities"> & {
  sourceImage: BackupImage;
  entities: (Omit<WorldEntity, "art"> & { art?: BackupImage })[];
};
function safeBackupKeys(
  value: unknown,
  depth = 0,
  allowAssetReferences = true,
) {
  if (depth > 24) throw new Error("Invalid backup nesting.");
  if (!value || typeof value !== "object") return;
  for (const key of Object.keys(value)) {
    if (
      ["__proto__", "constructor", "prototype"].includes(key) ||
      (!allowAssetReferences && key === "$asset")
    )
      throw new Error("Unsafe backup field.");
    safeBackupKeys(
      (value as Record<string, unknown>)[key],
      depth + 1,
      allowAssetReferences,
    );
  }
}
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
      // A deliberate import-copy changes identity, not the plan or revision.
      // The source checkpoint was validated by savedWorld above.
      if (item.state.retryCheckpoint) item.state.retryCheckpoint.worldId = id;
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
export function serializeBackup(
  entries: SavedWorld[],
  options: { currentVersionOnly?: boolean } = {},
): string {
  if (!entries.length || entries.length > 1000)
    throw new Error("Back up between one and 1,000 saved worlds at a time.");
  const prepared = entries.map(savedWorld);
  safeBackupKeys(prepared, 0, false);
  if (new Set(prepared.map((entry) => entry.world.id)).size !== prepared.length)
    throw new Error("A backup cannot contain repeated world identities.");
  const assets: string[] = [],
    assetIds = new Map<string, number>();
  let expandedBytes = 0;
  function image(value: string): BackupImage {
    if (publicArtwork.test(value)) return value;
    if (!pngAsset.test(value))
      throw new Error(
        "This world has unsupported artwork. Saved data has not been changed.",
      );
    expandedBytes += value.length;
    if (expandedBytes > MAX_EXPANDED_BACKUP_BYTES)
      throw new BackupSizeError(
        "This backup would restore more than 512 MB of artwork references. Back up individual worlds or their current versions. Saved data is unchanged.",
      );
    let index = assetIds.get(value);
    if (index === undefined) {
      if (assets.length >= 100000)
        throw new BackupSizeError(
          "This backup exceeds 100,000 distinct artwork assets. Back up individual worlds or their current versions. Saved data is unchanged.",
        );
      index = assets.length;
      assets.push(value);
      assetIds.set(value, index);
    }
    return { $asset: index };
  }
  function world(value: WorldDefinition): BackupWorld {
    return {
      ...value,
      sourceImage: image(value.sourceImage),
      entities: value.entities.map((entity) => ({
        ...entity,
        ...(entity.art !== undefined ? { art: image(entity.art) } : {}),
      })),
    };
  }
  const worlds = prepared.map((entry) => ({
    ...entry,
    world: world(entry.world),
    history: options.currentVersionOnly
      ? []
      : entry.history?.map((checkpoint) => ({
          ...checkpoint,
          before: world(checkpoint.before),
        })),
  }));
  const envelope = {
    format: "doodlume-library",
    version: 2,
    exportedAt: new Date().toISOString(),
    historyMode: options.currentVersionOnly
      ? "current-version-only"
      : "included",
    assets,
    worlds,
  };
  safeBackupKeys(envelope);
  const text = JSON.stringify(envelope, null, 2);
  if (new Blob([text]).size > MAX_BACKUP_BYTES)
    throw new BackupSizeError(
      entries.length > 1
        ? "This library exceeds the 64 MB backup limit. Back up individual worlds instead. Saved data is unchanged."
        : options.currentVersionOnly
          ? "This world's current version exceeds the 64 MB backup limit. Saved data is unchanged."
          : "This world and its undo history exceed the 64 MB backup limit. Saved data is unchanged.",
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
    ![1, 2].includes(data.version) ||
    !Array.isArray(data.worlds) ||
    !data.worlds.length ||
    data.worlds.length > 1000
  )
    throw new Error(
      "Choose a supported Doodlume backup containing saved worlds.",
    );
  try {
    const entries =
      data.version === 1
        ? (data.worlds.map(savedWorld) as SavedWorld[])
        : decodeBackup(data);
    if (new Set(entries.map((e) => e.world.id)).size !== entries.length)
      throw new Error();
    return entries;
  } catch (error) {
    if (error instanceof BackupSizeError) throw error;
    throw new Error(
      "This backup has invalid world data. Nothing was imported.",
    );
  }
}

function decodeBackup(data: Record<string, unknown>): SavedWorld[] {
  const keys = Object.keys(data);
  if (
    keys.some(
      (key) =>
        ![
          "format",
          "version",
          "exportedAt",
          "historyMode",
          "assets",
          "worlds",
        ].includes(key),
    ) ||
    typeof data.exportedAt !== "string" ||
    !Number.isFinite(Date.parse(data.exportedAt)) ||
    !["included", "current-version-only"].includes(
      data.historyMode as string,
    ) ||
    !Array.isArray(data.assets) ||
    data.assets.length > 100000 ||
    data.assets.some(
      (asset) => typeof asset !== "string" || !pngAsset.test(asset),
    ) ||
    new Set(data.assets).size !== data.assets.length
  )
    throw new Error("Invalid backup manifest.");
  const assets = data.assets as string[],
    used = new Set<number>();
  let expandedBytes = 0;
  const record = (value: unknown): Record<string, unknown> => {
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw new Error("Invalid backup structure.");
    return value as Record<string, unknown>;
  };
  safeBackupKeys(data);
  function image(value: unknown): string {
    if (typeof value === "string") {
      if (!publicArtwork.test(value)) throw new Error("Invalid artwork URL.");
      return value;
    }
    const ref = record(value),
      index = ref.$asset;
    if (
      Object.keys(ref).length !== 1 ||
      !Object.hasOwn(ref, "$asset") ||
      !Number.isInteger(index) ||
      (index as number) < 0 ||
      (index as number) >= assets.length
    )
      throw new Error("Invalid artwork reference.");
    const asset = assets[index as number];
    expandedBytes += asset.length;
    if (expandedBytes > MAX_EXPANDED_BACKUP_BYTES)
      throw new BackupSizeError(
        "This backup would restore more than 512 MB of artwork references. Choose individual-world backups. Nothing was imported.",
      );
    used.add(index as number);
    return asset;
  }
  function world(value: unknown) {
    const raw = record(value);
    if (!Array.isArray(raw.entities) || raw.entities.length > 160)
      throw new Error("Invalid backup objects.");
    return {
      ...raw,
      sourceImage: image(raw.sourceImage),
      entities: raw.entities.map((entity) => {
        const e = record(entity);
        return { ...e, ...(e.art !== undefined ? { art: image(e.art) } : {}) };
      }),
    };
  }
  const entries = (data.worlds as unknown[]).map((value) => {
    const entry = record(value);
    if (
      entry.history !== undefined &&
      (!Array.isArray(entry.history) || entry.history.length > 12)
    )
      throw new Error("Invalid backup history.");
    const history = ((entry.history ?? []) as unknown[]).map((checkpoint) => {
      const h = record(checkpoint);
      return { ...h, before: world(h.before) };
    });
    if (data.historyMode === "current-version-only" && history.length)
      throw new Error("Unexpected backup history.");
    return savedWorld({ ...entry, world: world(entry.world), history });
  });
  if (used.size !== assets.length) throw new Error("Unused backup assets.");
  safeBackupKeys(entries, 0, false);
  return entries;
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
