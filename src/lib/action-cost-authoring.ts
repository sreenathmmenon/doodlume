import {validateInteractions, type InteractionAction, type InteractionPlan} from "../../shared/interactions";
import type {WorldDefinition} from "../../shared/world";

export type ActionCosts = NonNullable<InteractionAction["costs"]>;

/** Cost edits are atomic; unrelated fields and the committed plan survive a
 * rejected candidate, including choices and existing fixed requirements. */
export function withActionCosts(world: WorldDefinition, plan: InteractionPlan, actionId: string, costs: ActionCosts): InteractionPlan {
  const next = structuredClone(plan);
  const action = next.actions.find(candidate => candidate.id === actionId);
  if (!action || action.kind === "transfer") throw new Error("Choose an ability that does not transfer a resource.");
  if (costs.length) action.costs = structuredClone(costs);
  else delete action.costs;
  validateInteractions({...world, interactions: next});
  return next;
}
