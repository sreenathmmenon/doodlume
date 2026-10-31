import {
  retainPlayState,
  validateWorld,
  type PlayState,
  type GoalRules,
  type WorldDefinition,
  type WorldEntity,
} from "./world.js";

export interface WorldPatch {
  id: string;
  worldId: string;
  baseRevision: number;
  origin: "manual" | "meta";
  additions: WorldEntity[];
  sourceImage?: string;
  bounds?: { width: number; height: number };
  goalRules?: GoalRules;
}
export interface RevisionCheckpoint {
  before: WorldDefinition;
  appliedRevision: number;
}

function safePlayerPosition(world: WorldDefinition, state: PlayState) {
  if (!state.player) return;
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
    (!patch.additions.length && !patch.bounds && patch.goalRules === undefined)
  )
    throw new Error("Add something to your world before applying this change.");
  if (patch.additions.some((e) => e.kind === "player"))
    throw new Error(
      "Your character stays with this world. Add a path or another possibility instead.",
    );
  if (
    patch.bounds &&
    (patch.bounds.width < world.width || patch.bounds.height < world.height)
  )
    throw new Error("New space must extend the existing world.");
  const next = validateWorld({
    ...structuredClone(world),
    revision: world.revision + 1,
    ...(patch.bounds ?? {}),
    ...(patch.sourceImage ? { sourceImage: patch.sourceImage } : {}),
    ...(patch.goalRules !== undefined
      ? { goalRules: structuredClone(patch.goalRules) }
      : {}),
    entities: [
      ...structuredClone(world.entities),
      ...structuredClone(patch.additions),
    ],
  });
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
