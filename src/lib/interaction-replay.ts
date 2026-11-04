import { interactionCompletionStatus, interactionState } from "../../shared/interactions";
import { emptyPlayState, goalProgress, type PlayState, type WorldDefinition } from "../../shared/world";

/** Offer a fresh run only for a different feasible required choice. No route is selected. */
export function hasAlternativeInteractionRoute(world: WorldDefinition, state: PlayState): boolean {
  if (!state.completed || state.exploring || !world.interactions || !goalProgress(world, state).ready) return false;
  const progress = interactionState(world, state);
  let probes = 0;
  for (const id of world.goalRules?.requiredChoiceGroupIds ?? []) {
    const group = world.interactions.choiceGroups?.find(candidate => candidate.id === id);
    if (!group?.actionIds.some(actionId => progress.completed.includes(actionId))) continue;
    for (const actionId of group.actionIds) {
      if (progress.completed.includes(actionId)) continue;
      if (++probes > 8) return false;
      const branch: WorldDefinition = {...world, goalRules: {
        ...world.goalRules!,
        requiredInteractionIds: [...new Set([...(world.goalRules?.requiredInteractionIds ?? []), actionId])],
      }};
      if (interactionCompletionStatus(branch, emptyPlayState()) === "possible") return true;
    }
  }
  return false;
}
