import type { PlayState, WorldDefinition } from "../../shared/world";
import { interactionState, safeAvailableInteractions } from "../../shared/interactions";
import { objectName } from "./object-name";

export interface InteractionHint {
  entityId: string;
  text: string;
}

/** An optional hint uses the same legal actions as play. It never spends a
 * resource, changes possession, or supplies a model-invented solution. */
export function nextInteractionHint(world: WorldDefinition, state: PlayState): InteractionHint | undefined {
  if (!world.interactions || (state.completed && !state.exploring)) return;
  const progress = interactionState(world, state);
  const actions = world.interactions.actions;
  const needed = new Set<string>();
  const resources = new Set<string>();
  const requireResource = (id: string) => {
    if (resources.has(id)) return;
    resources.add(id);
    const object = world.interactions!.objects.find(object => object.entityId === id);
    if (!object?.resource || (progress.quantities[id] ?? 0) >= object.resource.capacity) return;
    for (const action of actions) if (action.kind === "transfer" && action.targetId === id) requireAction(action.id);
  };
  const requireAction = (id: string) => {
    if (needed.has(id) || progress.completed.includes(id)) return;
    needed.add(id);
    const action = actions.find(action => action.id === id);
    if (!action) return;
    for (const prior of action.requires ?? []) requireAction(prior);
    for (const resource of action.requiresResourceIds ?? []) requireResource(resource);
    // A refill can be the useful next move, even though only the delivery is
    // listed as a goal. Follow compatible incoming transfers, not object names.
    if (action.kind === "transfer" && (progress.quantities[action.toolId] ?? 0) < action.amount) {
      for (const refill of actions) if (refill.kind === "transfer" && refill.targetId === action.toolId) requireAction(refill.id);
    }
    if (action.kind === "transfer") {
      const capacity = world.interactions!.objects.find(object => object.entityId === action.targetId)?.resource?.capacity ?? 0;
      if ((progress.quantities[action.targetId] ?? 0) + action.amount > capacity) {
        for (const drain of actions) if (drain.kind === "transfer" && drain.toolId === action.targetId) requireAction(drain.id);
      }
    }
  };
  for (const id of world.goalRules?.requiredInteractionIds ?? []) requireAction(id);
  for (const id of world.goalRules?.requiredResourceIds ?? []) requireResource(id);
  const hasUnfinishedTasks = needed.size > 0;
  const candidates = world.interactions.objects.flatMap(object => {
    if (!object.carryable || progress.attachments[object.entityId]) return [];
    const preview = { ...state, interactions: { ...progress, heldEntityId: object.entityId } };
    return safeAvailableInteractions(world, preview)
      .filter(action => !hasUnfinishedTasks || needed.has(action.id));
  });
  const distance = (id: string) => {
    const entity = world.entities.find(entity => entity.id === id);
    return entity && state.player ? Math.hypot(entity.x + entity.width / 2 - state.player.x, entity.y + entity.height / 2 - state.player.y) : 0;
  };
  candidates.sort((a, b) => Number(b.toolId === progress.heldEntityId) - Number(a.toolId === progress.heldEntityId)
    || distance(a.toolId === progress.heldEntityId ? a.targetId : a.toolId) - distance(b.toolId === progress.heldEntityId ? b.targetId : b.toolId));
  const next = candidates[0];
  if (next) return next.toolId === progress.heldEntityId
    ? { entityId: next.targetId, text: `${next.label} · ${objectName(world, next.targetId, 48)}` }
    : { entityId: next.toolId, text: `Take ${objectName(world, next.toolId, 48)} to ${next.label.charAt(0).toLowerCase()}${next.label.slice(1)}.` };
  const collectible = world.goalRules?.requiredCollectedIds.find(id => !state.collected.includes(id));
  const switchId = world.goalRules?.requiredActivatedIds.find(id => !state.activated.includes(id));
  const entityId = collectible ?? switchId ?? (!hasUnfinishedTasks ? world.entities.find(entity => entity.kind === "goal")?.id : undefined);
  if (entityId) return { entityId, text: `${collectible ? "Collect" : switchId ? "Activate" : "Reach"} ${objectName(world, entityId, 48)}.` };
}
