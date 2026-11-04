import type {InteractionAction} from "../../shared/interactions";
import type {WorldDefinition} from "../../shared/world";
import {abilityTargetName} from "../lib/ability-authoring-preview";
import "./ability-rule-name.css";

/** Visual containment leaves the complete relationship in the accessible text. */
export function AbilityRelationship({world, action}: {world: WorldDefinition; action: InteractionAction}) {
  const source = world.entities.find(entity => entity.id === action.toolId)?.label?.trim() || "Object";
  const target = abilityTargetName(world, action);
  return <span className="ability-relationship" title={`${source} → ${target}`}>
    <span>{source}</span><span>→</span><span>{target}</span>
  </span>;
}

export function AbilityRuleName({world, action, prefix = ""}: {world: WorldDefinition; action: InteractionAction; prefix?: string}) {
  return <span className="ability-rule-name"><strong>{prefix}{action.label}</strong><AbilityRelationship world={world} action={action}/></span>;
}
