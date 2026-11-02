import { setupFeedback } from "./setup.js";
import {
  retainPlayState,
  movementMode,
  validateWorld,
  type PlayState,
  type GoalRules,
  type WorldDefinition,
  type WorldEntity,
  type WorldGameplay,
} from "./world.js";

/** Manual changes retain identity, roles and original artwork. */
export interface WorldEntityUpdate {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  label?: string;
  targetId?: string | null;
}

export interface WorldPatch {
  id: string;
  worldId: string;
  baseRevision: number;
  origin: "manual" | "meta";
  additions: WorldEntity[];
  updates?: WorldEntityUpdate[];
  sourceImage?: string;
  bounds?: { width: number; height: number };
  goalRules?: GoalRules;
  gameplay?: WorldGameplay;
}
export interface RevisionCheckpoint {
  before: WorldDefinition;
  appliedRevision: number;
}

function safePlayerPosition(world: WorldDefinition, state: PlayState) {
  if (!state.player || movementMode(world) === "discover") return;
  if (state.player.x > world.width || state.player.y > world.height)
    throw new Error(
      "Move back inside the original world before undoing this expansion.",
    );
  const hero = world.entities.find((e) => e.kind === "player")!;
  const p = {
    x: state.player.x - hero.width * 0.33,
    y: state.player.y - hero.height * 0.26,
    width: hero.width * 0.66,
    height: hero.height * 0.69,
  };
  const openGates = new Set(
    world.entities
      .filter((e) => e.kind === "lever" && state.activated.includes(e.id))
      .map((e) => e.targetId),
  );
  for (const e of world.entities) {
    if (!["terrain", "bridge", "gate"].includes(e.kind) || openGates.has(e.id))
      continue;
    const overlapX =
      Math.min(p.x + p.width, e.x + e.width) - Math.max(p.x, e.x);
    const overlapY =
      Math.min(p.y + p.height, e.y + e.height) - Math.max(p.y, e.y);
    if (overlapX > 3 && overlapY > 3)
      throw new Error(
        "This change would cover your character. Move the new object, or move your character to a clear spot first.",
      );
  }
}

export function applyWorldPatch(
  world: WorldDefinition,
  state: PlayState,
  patch: WorldPatch,
) {
  if (patch.worldId !== world.id || patch.baseRevision !== world.revision)
    throw new Error(
      "This preview belongs to an older world. Open the editor again to make a fresh change.",
    );
  if (
    !patch.id ||
    !["manual", "meta"].includes(patch.origin) ||
    !Array.isArray(patch.additions) ||
    (!patch.additions.length && !patch.updates?.length && !patch.bounds && patch.goalRules === undefined && patch.gameplay === undefined)
  )
    throw new Error("Add something to your world before applying this change.");
  const changes = new Map<string, WorldEntityUpdate>();
  if (patch.updates !== undefined) {
    if (patch.origin !== "manual" || !Array.isArray(patch.updates) || patch.updates.length > world.entities.length)
      throw new Error("Existing objects can only be changed in the world editor.");
    const allowed = new Set(["id", "x", "y", "width", "height", "label", "targetId"]);
    for (const update of patch.updates) {
      if (!update || typeof update !== "object" || Object.keys(update).some(key => !allowed.has(key)) ||
          typeof update.id !== "string" || changes.has(update.id))
        throw new Error("Each object needs one valid change. Reopen the editor.");
      const original = world.entities.find(entity => entity.id === update.id);
      if (!original || original.artNote === "Full original image used as the world backdrop; generated gameplay is separate.")
        throw new Error("The original image and object identities stay with this world.");
      if (["x", "y", "width", "height"].some(key => !Number.isFinite(update[key as keyof WorldEntityUpdate])))
        throw new Error("Use valid object dimensions and placement.");
      if (update.targetId !== undefined && update.targetId !== null && typeof update.targetId !== "string")
        throw new Error("Choose a valid gate connection.");
      changes.set(update.id, update);
    }
  }
  if (patch.additions.some((e) => e.kind === "player"))
    throw new Error(
      "Your character stays with this world. Add a path or another possibility instead.",
    );
  if (
    patch.bounds &&
    (patch.bounds.width < world.width || patch.bounds.height < world.height)
  )
    throw new Error("New space must extend the existing world.");
  if (patch.gameplay && patch.gameplay.movement !== movementMode(world))
    throw new Error("Keep this world's movement style while editing its clues.");
  const next = validateWorld({
    ...structuredClone(world),
    revision: world.revision + 1,
    ...(patch.bounds ?? {}),
    ...(patch.sourceImage ? { sourceImage: patch.sourceImage } : {}),
    ...(patch.goalRules !== undefined
      ? { goalRules: structuredClone(patch.goalRules) }
      : {}),
    ...(patch.gameplay !== undefined ? {gameplay: structuredClone(patch.gameplay)} : {}),
    entities: [
      ...structuredClone(world.entities).map(entity => {
        const update = changes.get(entity.id);
        const changed = update ? { ...entity, ...structuredClone(update),
          ...(Object.hasOwn(update, "targetId") ? { targetId: update.targetId || undefined } : {}) } : entity;
        return patch.sourceImage && entity.artNote === "Full original image used as the world backdrop; generated gameplay is separate."
          ? { ...changed, art: patch.sourceImage } : changed;
      }),
      ...structuredClone(patch.additions),
    ],
  });
  if (changes.size) {
    const issue = setupFeedback(next).errors[0];
    if (issue) throw new Error(issue);
  }
  const progress = retainPlayState(next, structuredClone(state));
  safePlayerPosition(next, progress);
  return {
    world: next,
    state: progress,
    checkpoint: {
      before: structuredClone(world),
      appliedRevision: next.revision,
    } satisfies RevisionCheckpoint,
  };
}

export function undoWorldPatch(
  world: WorldDefinition,
  state: PlayState,
  checkpoint: RevisionCheckpoint,
) {
  if (
    world.id !== checkpoint.before.id ||
    world.revision !== checkpoint.appliedRevision
  )
    throw new Error("This undo belongs to an earlier version of your world.");
  const previous = validateWorld({
    ...structuredClone(checkpoint.before),
    revision: world.revision + 1,
  });
  const progress = retainPlayState(previous, structuredClone(state));
  safePlayerPosition(previous, progress);
  return { world: previous, state: progress };
}
