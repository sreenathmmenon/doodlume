import type { InteractionAction } from "../../shared/interactions";
import { reduceInteraction, selectInteractionSourceCommand } from "../../shared/interactions";
import { previewInteraction } from "../../shared/interaction-preview";
import { emptyPlayState, type WorldDefinition } from "../../shared/world";

/** Name the affected subject for controllers, whose runtime target is themselves. */
export function abilityTargetName(world: WorldDefinition, action: InteractionAction): string {
  const effect = action.effects?.find(effect => "entityId" in effect);
  const id = action.kind === "operate" && effect && "entityId" in effect ? effect.entityId : action.targetId;
  if (action.kind === "operate" && action.effects?.some(effect => effect.kind === "jumpBoost" || effect.kind === "moveSpeedBoost"))
    return world.entities.find(entity => entity.kind === "player")?.label?.trim() || "Character";
  return world.entities.find(entity => entity.id === id)?.label?.trim() || "Object";
}

export function abilityRuleLabel(world: WorldDefinition, action: InteractionAction): string {
  const source = world.entities.find(entity => entity.id === action.toolId)?.label?.trim() || "Object";
  return `${source} → ${action.label} → ${abilityTargetName(world, action)}`;
}

/** A fresh local run through the real reducer. Never completes prerequisites or changes the editor world. */
export function previewAuthoredAbility(world: WorldDefinition, action: InteractionAction) {
  let state = emptyPlayState();
  if (action.kind !== "operate") {
    const selected = reduceInteraction(world, state, selectInteractionSourceCommand(world, action.toolId));
    if (selected.ok) state = selected.state;
  }
  const preview = previewInteraction(world, state, action);
  return { available: preview.available, text: preview.available ? preview.consequence : preview.reason || "This ability is not ready at the start of a run." };
}
