import { interactionChoiceBlockedReason, interactionEffects, interactionState, reduceInteraction, playerAvailableInteractions, type InteractionAction } from "./interactions.js";
import type { PlayState, WorldDefinition } from "./world.js";

export interface ActionPreview {
  id: string;
  label: string;
  available: boolean;
  reason?: string;
  consequence: string;
}
const number = new Intl.NumberFormat("en", { maximumSignificantDigits: 6 });
const compact = (text: string, limit: number) => text.length > limit ? `${text.slice(0, limit - 1).trimEnd()}…` : text;
const label = (world: WorldDefinition, id: string) => compact(world.entities.find(entity => entity.id === id)?.label?.trim() || "object", 40);

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
    consequence = `One use · ${label(world, action.targetId)}: ${number.format(before)} → ${number.format(after)}${resource ? ` / ${number.format(resource.capacity)}` : ""} · Uses ${number.format(action.amount)}`;
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
  const choice = world.interactions?.choiceGroups?.find(group => group.actionIds.includes(action.id));
  if (choice) {
    const alternatives = choice.actionIds.filter(id => id !== action.id)
      .map(id => world.interactions!.actions.find(candidate => candidate.id === id)!)
      .filter(candidate => !interactionChoiceBlockedReason(world, progress, candidate));
    const tradeoff = alternatives.length ? `Closes ${alternatives.slice(0, 2).map(candidate => `“${compact(candidate.label, 32)}”`).join(" and ")}${alternatives.length > 2 ? ` and ${alternatives.length - 2} more` : ""}.` : "";
    // Canvas menus show 160 characters. Keep the effect first when both fit;
    // otherwise lead with the commitment so that clipping cannot conceal it.
    if (tradeoff) consequence = consequence.length + tradeoff.length + 1 <= 160
      ? `${consequence} ${tradeoff}` : `${tradeoff} ${consequence}`;
  }
  const prerequisite = action.requires?.find(id => !progress.completed.includes(id));
  const preceding = world.interactions?.actions.find(candidate => candidate.id === prerequisite);
  return {id: action.id, label: action.label, available: result.ok,
    ...(!result.ok ? {reason: preceding && result.reason === "Complete the earlier step first." ? `First: ${preceding.label}` : result.reason} : {}), consequence};
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
  const pair = world.interactions?.actions.filter(action => action.toolId === held && action.targetId === targetId) ?? [];
  if (pair.length) {
    if (pair.every(action => progress.completed.includes(action.id)))
      return `${pair.length === 1 ? "This action has" : "These actions have"} already been used. Choose another target.`;
    return;
  }
  return `${label(world, held)} has no action with ${label(world, targetId)}.`;
}


/** Explain a real newly available next action, never a predicted story outcome.
 * Ignore possession while comparing capabilities: a new step can use another
 * tool. This runs once after a successful action, not in the render loop. */
export function interactionOutcomeMessage(world: WorldDefinition, before: PlayState, after: PlayState, action: InteractionAction): string {
  const beforeProgress = interactionState(world, before), afterProgress = interactionState(world, after);
  const candidates = (world.interactions?.actions ?? []).filter(candidate => candidate.id !== action.id && !afterProgress.completed.includes(candidate.id) &&
    ((candidate.requires ?? []).includes(action.id) || (candidate.requiresResourceIds ?? []).some(id => beforeProgress.quantities[id] !== afterProgress.quantities[id]) ||
      (candidate.kind === "transfer" && [candidate.toolId, candidate.targetId].some(id => beforeProgress.quantities[id] !== afterProgress.quantities[id]))));
  const toolIds = [...new Set(candidates.map(candidate => candidate.toolId))];
  const enabled = new Set<string>(), previouslyEnabled = new Set<string>();
  for (const toolId of toolIds) {
    for (const available of playerAvailableInteractions(world, {...before, interactions: {...beforeProgress, heldEntityId: toolId}})) previouslyEnabled.add(available.id);
    for (const available of playerAvailableInteractions(world, {...after, interactions: {...afterProgress, heldEntityId: toolId}})) enabled.add(available.id);
  }
  const unlocked = candidates.filter(candidate => enabled.has(candidate.id) && !previouslyEnabled.has(candidate.id));
  if (unlocked.length === 1) return `Unlocked: ${unlocked[0].label}`;
  if (unlocked.length > 1) {
    const alternatives = world.interactions?.choiceGroups?.some(group => unlocked.every(candidate => group.actionIds.includes(candidate.id)));
    return `Unlocked: ${unlocked.slice(0, 2).map(candidate => candidate.label.length > 42 ? `${candidate.label.slice(0, 41)}…` : candidate.label).join(alternatives ? " or " : " and ")}${unlocked.length > 2 ? `, plus ${unlocked.length - 2} more` : ""}`;
  }
  const effectsBefore = interactionEffects(world, before), effectsAfter = interactionEffects(world, after);
  const opened = effectsAfter.openGateIds.filter(id => !effectsBefore.openGateIds.includes(id));
  if (opened.length) return `${action.label} · ${opened.slice(0, 2).map(id => label(world, id)).join(" and ")} open`;
  if (effectsAfter.jumpMultiplier > effectsBefore.jumpMultiplier) return `${action.label} · Jump strength ×${number.format(effectsAfter.jumpMultiplier)}`;
  if (effectsAfter.moveSpeedMultiplier > effectsBefore.moveSpeedMultiplier) return `${action.label} · Movement speed ×${number.format(effectsAfter.moveSpeedMultiplier)}`;
  return `${action.label} — done`;
}
