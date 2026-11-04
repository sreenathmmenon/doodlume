import { interactionEffects, interactionState, reduceInteraction, type InteractionAction } from "./interactions.js";
import type { PlayState, WorldDefinition } from "./world.js";

export interface ActionPreview {
  id: string;
  label: string;
  available: boolean;
  reason?: string;
  consequence: string;
}
const number = new Intl.NumberFormat("en", { maximumSignificantDigits: 6 });
const label = (world: WorldDefinition, id: string) => world.entities.find(entity => entity.id === id)?.label?.trim() || "object";

/** Predict only the selected action, using the same reducer as execution.
 * No invented outcome, future solution, mutation, or model call. Call on an
 * inspection/state change, not on each animation frame. */
export function previewInteraction(world: WorldDefinition, state: PlayState, action: InteractionAction): ActionPreview {
  const result = reduceInteraction(world, state, {type: "perform", actionId: action.id});
  const progress = interactionState(world, state);
  const beforeEffects = interactionEffects(world, state);
  const afterEffects = interactionEffects(world, result.ok ? result.state : state);
  const capability = (name: string, before: number, after: number) => before === after
    ? `${name} stays ×${number.format(after)}.`
    : `${name} ×${number.format(before)} → ×${number.format(after)}.`;
  let consequence: string;
  if (action.kind === "transfer") {
    const resource = world.interactions?.objects.find(object => object.entityId === action.targetId)?.resource;
    const before = progress.quantities[action.targetId] ?? 0;
    const after = result.ok ? result.state.interactions!.quantities[action.targetId] : before + action.amount;
    consequence = `${label(world, action.targetId)}: ${number.format(before)} → ${number.format(after)}${resource ? ` / ${number.format(resource.capacity)}` : ""} · Uses ${number.format(action.amount)}`;
  } else if (action.kind === "place") {
    consequence = `${label(world, action.toolId)} moves to ${label(world, action.targetId)}.`;
  } else {
    consequence = (action.effects ?? []).map(effect => effect.kind === "openGate"
      ? `Opens ${label(world, effect.entityId)}.`
      : effect.kind === "moveObject" ? `Moves ${label(world, effect.entityId)} to its marked destination.`
      : effect.kind === "jumpBoost" ? capability("Jump strength", beforeEffects.jumpMultiplier, afterEffects.jumpMultiplier)
      : capability("Movement speed", beforeEffects.moveSpeedMultiplier, afterEffects.moveSpeedMultiplier)).join(" ");
    if (action.kind === "attach") consequence = `Fits ${label(world, action.toolId)} to ${label(world, action.targetId)}. ${consequence}`;
  }
  const prerequisite = action.requires?.find(id => !progress.completed.includes(id));
  const preceding = world.interactions?.actions.find(candidate => candidate.id === prerequisite);
  return {id: action.id, label: action.label, available: result.ok,
    ...(!result.ok ? {reason: preceding ? `First: ${preceding.label}` : result.reason} : {}), consequence};
}

/** Inspect only this target with the currently held tool. No tool is silently
 * equipped and no route is chosen for the player. */
export function inspectInteractionTarget(world: WorldDefinition, state: PlayState, targetId: string): ActionPreview[] {
  const progress = interactionState(world, state);
  const held = progress.heldEntityId;
  return (world.interactions?.actions ?? []).filter(action => action.toolId === held && action.targetId === targetId && !progress.completed.includes(action.id))
    .map(action => previewInteraction(world, state, action));
}

export function incompatibleTargetReason(world: WorldDefinition, state: PlayState, targetId: string): string | undefined {
  const progress = interactionState(world, state), held = progress.heldEntityId;
  const object = world.interactions?.objects.find(object => object.entityId === targetId);
  if (!held || !object || held === targetId || (object.carryable && !progress.attachments[targetId])) return;
  if (world.interactions?.actions.some(action => action.toolId === held && action.targetId === targetId)) return;
  return `${label(world, held)} has no action with ${label(world, targetId)}.`;
}
