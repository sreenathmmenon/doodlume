import { interactionCompletionStatus, interactionEffects, validateInteractionFeasibility, type InteractionPlan } from "./interactions.js";
import { setupFeedback } from "./setup.js";
import { isSourceBackdrop, isSourceAlignedScenery, sourceLayerForEdit } from "./source-scenery.js";
import {
  retainPlayState,
  getRetryCheckpoint,
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
  sourceScenery?: { id: string; art: string; artNote?: string };
  sourceRefinements?: (Required<Pick<WorldEntity, "id" | "art" | "artSource" | "sourceOutline">> & Pick<WorldEntity, "artMethod" | "artNote">)[];
  sourceLayers?: (Required<Pick<WorldEntity, "id" | "art" | "artSource">> & Pick<WorldEntity, "artMethod" | "artNote" | "sourceLayer">)[];
  bounds?: { width: number; height: number };
  goalRules?: GoalRules;
  gameplay?: WorldGameplay;
  interactions?: InteractionPlan | null;
}
export interface RevisionCheckpoint {
  before: WorldDefinition;
  appliedRevision: number;
}

/** Only artwork-only revisions can reuse a validated recovery position. Source
 * selection, placement, rules, quantities and every other world field must match. */
function retainRevisionPlayState(world: WorldDefinition, state: PlayState, before: WorldDefinition): PlayState {
  const mechanics = (value: WorldDefinition) => {
    const { revision: _revision, entities, ...rest } = value;
    return JSON.stringify({ ...rest, entities: entities.map(entity => {
      const { art: _art, artMethod: _method, artNote: _note, sourceOutline: _outline, ...unchanged } = entity;
      return unchanged;
    }) });
  };
  const progress = structuredClone(state);
  if (progress.retryCheckpoint && mechanics(before) === mechanics(world)) {
    const recovery = getRetryCheckpoint(before, state);
    if (recovery) progress.retryCheckpoint = { worldId: world.id, revision: world.revision, state: recovery };
  }
  return retainPlayState(world, progress);
}

function safePlayerPosition(world: WorldDefinition, state: PlayState, before: WorldDefinition, beforeState: PlayState) {
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
  for (const id of interactionEffects(world, state).openGateIds) openGates.add(id);
  const beforeHero = before.entities.find(entity => entity.kind === "player");
  const sameBody = beforeHero?.width === hero.width && beforeHero?.height === hero.height;
  const previouslyOpen = new Set(before.entities.filter(entity => entity.kind === "lever" && beforeState.activated.includes(entity.id)).map(entity => entity.targetId));
  for (const id of interactionEffects(before, beforeState).openGateIds) previouslyOpen.add(id);
  for (const e of world.entities) {
    if (!["terrain", "bridge", "gate"].includes(e.kind) || openGates.has(e.id)) continue;
    const old = before.entities.find(entity => entity.id === e.id);
    // A saved run can touch or overlap an unchanged source ledge. Only this
    // revision's new obstruction may block an edit; undo uses the same rule.
    if (sameBody && old && old.kind === e.kind && old.x === e.x && old.y === e.y && old.width === e.width && old.height === e.height && !previouslyOpen.has(e.id)) continue;
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
  if (world.interactions?.completionPolicy === "retryable" && interactionCompletionStatus(world, state) !== "possible")
    throw new Error("Recover your last solvable position or restart before editing this puzzle. Your draft is kept.");
  if (
    !patch.id ||
    !["manual", "meta"].includes(patch.origin) ||
    !Array.isArray(patch.additions) ||
    (!patch.additions.length && !patch.updates?.length && !patch.sourceRefinements?.length && !patch.bounds && patch.goalRules === undefined && patch.gameplay === undefined && patch.interactions === undefined)
  )
    throw new Error("Add something to your world before applying this change.");
  if (patch.sourceImage && patch.sourceImage !== world.sourceImage && world.entities.some(entity => entity.artMethod === "outline" || entity.sourceOutline))
    throw new Error("This image has creator-confirmed outlines. Confirm them again in a new source review before replacing the original image. Your current world is unchanged.");
  const derivedBackdrops = world.entities.filter(isSourceAlignedScenery);
  if (patch.sourceImage && derivedBackdrops.length && !patch.sourceScenery)
    throw new Error("The revised image needs a refreshed scenery preview. Review the image update again before applying.");
  if (patch.sourceScenery !== undefined && (!patch.sourceScenery || !["meta", "manual"].includes(patch.origin) || (!patch.sourceImage && !patch.updates?.length && !patch.additions.length && !patch.sourceRefinements?.length && patch.interactions === undefined) ||
      derivedBackdrops.length !== 1 || patch.sourceScenery.id !== derivedBackdrops[0].id || typeof patch.sourceScenery.art !== "string"))
    throw new Error("The scenery update does not match this image review. Review the image update again before applying.");
  if (patch.sourceScenery?.artNote !== undefined && (typeof patch.sourceScenery.artNote !== "string" || patch.sourceScenery.artNote.length > 500 || !isSourceAlignedScenery({kind:"decoration",artNote:patch.sourceScenery.artNote})))
    throw new Error("Keep valid source-background preparation details with this artwork.");
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
      if (!original || isSourceBackdrop(original))
        throw new Error("The original image and object identities stay with this world.");
      if (["x", "y", "width", "height"].some(key => !Number.isFinite(update[key as keyof WorldEntityUpdate])))
        throw new Error("Use valid object dimensions and placement.");
      if (update.targetId !== undefined && update.targetId !== null && typeof update.targetId !== "string")
        throw new Error("Choose a valid gate connection.");
      changes.set(update.id, update);
    }
  }
  for (const entity of world.entities) {
    const update = changes.get(entity.id);
    if (update && !entity.sourceLayer && sourceLayerForEdit(world, entity, update)) {
      if (!entity.art) throw new Error("This source object needs its original artwork before it can move. Your draft is kept.");
      if (!patch.sourceScenery) throw new Error("Prepare the edited object's source background before applying. Your draft is kept.");
    }
  }
  const sourceLayers = new Map<string, NonNullable<WorldPatch["sourceLayers"]>[number]>();
  if (patch.sourceLayers !== undefined) {
    if (!Array.isArray(patch.sourceLayers) || patch.origin !== "manual" || !patch.sourceScenery)
      throw new Error("Source artwork needs its matching prepared background.");
    for (const layer of patch.sourceLayers) {
      const entity = world.entities.find(item => item.id === layer?.id), update = entity && changes.get(entity.id);
      if (!entity || !update || entity.sourceLayer || !sourceLayerForEdit(world, entity, update) || sourceLayers.has(entity.id) ||
          Object.keys(layer).some(key => !["id", "art", "artSource", "artMethod", "artNote", "sourceLayer"].includes(key)) ||
          typeof layer.art !== "string" || !layer.artSource)
        throw new Error("A source cutout does not match this object's edit.");
      sourceLayers.set(entity.id, layer);
    }
  }
  const refinements = new Map<string, NonNullable<WorldPatch["sourceRefinements"]>[number]>();
  if (patch.sourceRefinements !== undefined) {
    if (patch.origin !== "manual" || !Array.isArray(patch.sourceRefinements) || !patch.sourceRefinements.length ||
        patch.sourceRefinements.length > 24 || !patch.sourceScenery || patch.sourceImage !== undefined ||
        patch.additions.length || patch.updates?.length || patch.sourceLayers !== undefined || patch.bounds !== undefined ||
        patch.goalRules !== undefined || patch.gameplay !== undefined || patch.interactions !== undefined)
      throw new Error("Apply an outline with its prepared background, separately from other world changes.");
    const sameBox = (a: WorldEntity["artSource"], b: WorldEntity["artSource"]) => Boolean(a && b &&
      Object.keys(a).length === 4 && (["x", "y", "width", "height"] as const).every(key => a[key] === b[key]));
    for (const refinement of patch.sourceRefinements) {
      const original = world.entities.find(entity => entity.id === refinement?.id);
      if (!original?.art || !original.artSource || isSourceBackdrop(original) || refinements.has(original.id) ||
          Object.keys(refinement).some(key => !["id", "art", "artSource", "artMethod", "artNote", "sourceOutline"].includes(key)) ||
          typeof refinement.art !== "string" || refinement.artMethod !== "outline" || !refinement.sourceOutline ||
          !sameBox(refinement.artSource, original.artSource) || !sameBox(refinement.sourceOutline.sourceBox, original.artSource))
        throw new Error("Refine the existing object's outline without changing its source selection or placement.");
      refinements.set(original.id, refinement);
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
    ...(patch.interactions !== undefined ? {interactions: patch.interactions === null ? undefined : structuredClone(patch.interactions)} : {}),
    entities: [
      ...structuredClone(world.entities).map(entity => {
        const update = changes.get(entity.id);
        let changed = update ? { ...entity, ...structuredClone(update),
          ...(sourceLayerForEdit(world, entity, update) ? { sourceLayer: sourceLayerForEdit(world, entity, update) } : {}),
          ...(sourceLayers.get(entity.id) ? structuredClone(sourceLayers.get(entity.id)) : {}),
          ...(Object.hasOwn(update, "targetId") ? { targetId: update.targetId || undefined } : {}) } : entity;
        if (refinements.has(entity.id)) changed = { ...changed, ...structuredClone(refinements.get(entity.id)!) };
        if (patch.sourceScenery?.id === entity.id) return { ...changed, art: patch.sourceScenery.art, ...(patch.sourceScenery.artNote !== undefined ? {artNote:patch.sourceScenery.artNote} : {}) };
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
  const progress = retainRevisionPlayState(next, state, world);
  validateInteractionFeasibility(next, progress);
  safePlayerPosition(next, progress, world, state);
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
  if (world.interactions?.completionPolicy === "retryable" && interactionCompletionStatus(world, state) !== "possible")
    throw new Error("Recover your last solvable position or restart before undoing this world edit.");
  const previous = validateWorld({
    ...structuredClone(checkpoint.before),
    revision: world.revision + 1,
  });
  const progress = retainRevisionPlayState(previous, state, world);
  validateInteractionFeasibility(previous, progress);
  safePlayerPosition(previous, progress, world, state);
  return { world: previous, state: progress };
}
