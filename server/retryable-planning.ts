import { emptyPlayState, type PlayState, type WorldDefinition } from "../shared/world.js";
import { reduceInteraction, selectInteractionSourceCommand, type InteractionAction } from "../shared/interactions.js";
import { ModelPlanError } from "./model.js";

/** Generation admission, not a runtime restriction. Explore actual legal receipts
 * and prove a consequential allocation fork without changing supplies or goals.
 * Pointer play needs no physical-route assumptions; other movement modes wait for
 * a route proof that distinguishes a recoverable mistake from broken geometry. */
export function validateGeneratedRetryablePlan(world: WorldDefinition): void {
  const plan = world.interactions;
  if (plan?.completionPolicy !== "retryable") return;
  if (world.gameplay?.movement !== "discover")
    throw new ModelPlanError('Generated retryable allocation puzzles currently require movement:"discover". Keep traversal plans protected.');
  const rules = world.goalRules;
  const required = rules?.requiredInteractionIds ?? [];
  const resources = (rules?.requiredResourceIds ?? []).map(id => plan.objects.find(object => object.entityId === id)!);
  const groups = (rules?.requiredChoiceGroupIds ?? []).map(id => plan.choiceGroups!.find(group => group.id === id)!);
  const complete = (state: PlayState) => {
    const progress = state.interactions;
    const completed = progress?.completed ?? [];
    return required.every(id => completed.includes(id)) &&
      resources.every(object => (progress?.quantities[object.entityId] ?? object.resource!.initial) >= object.resource!.capacity) &&
      groups.every(group => group.actionIds.some(id => completed.includes(id)));
  };
  type Edge = { to: number; action: InteractionAction };
  const states = [emptyPlayState()], edges: Edge[][] = [[]], predecessors: number[][] = [[]];
  const seen = new Map([["", 0]]);
  for (let head = 0; head < states.length; head++) {
    const state = states[head];
    if (complete(state)) continue; // Post-completion spending is not an allocation puzzle.
    for (const action of plan.actions) {
      if (state.interactions?.completed.includes(action.id)) continue;
      const dropped = action.kind === "operate" ? {ok:true,state:state} : reduceInteraction(world, state, {type:"drop"});
      const picked = action.kind === "operate" ? {ok:true,state:dropped.ok ? dropped.state : state} : reduceInteraction(world, dropped.ok ? dropped.state : state, selectInteractionSourceCommand(world,action.toolId));
      if (!picked.ok) continue;
      const result = reduceInteraction(world, picked.state, {type:"perform",actionId:action.id});
      if (!result.ok) continue;
      // Existing validation requires successive moves/attachments to be ordered;
      // quantities and choice commitments depend on this receipt set as well.
      const key = [...result.state.interactions!.completed].sort().join("|");
      let next = seen.get(key);
      if (next === undefined) {
        if (states.length >= 2048)
          throw new ModelPlanError("The retryable allocation puzzle is too complex to verify. Simplify the resource routes or keep completionPolicy protected.");
        next = states.length; seen.set(key, next);
        states.push(result.state); edges.push([]); predecessors.push([]);
      }
      edges[head].push({to:next,action}); predecessors[next].push(head);
    }
  }
  const viable = new Set<number>(), frontier: number[] = [];
  for (let index = 0; index < states.length; index++) if (complete(states[index])) {
    viable.add(index); frontier.push(index);
  }
  for (let head = 0; head < frontier.length; head++) for (const previous of predecessors[frontier[head]]) if (!viable.has(previous)) {
    viable.add(previous); frontier.push(previous);
  }
  if (!viable.has(0)) throw new ModelPlanError("The retryable allocation puzzle has no completing run from its original supplies. Correct the plan; Undo cannot substitute for a solution.");
  for (let index = 0; index < states.length; index++) {
    if (complete(states[index])) continue; // Spending after winning is not a puzzle.
    const spends = (action:InteractionAction) => action.kind === "transfer" ? [action.toolId] : (action.costs??[]).map(cost=>cost.entityId);
    const allocations = edges[index].filter(edge=>spends(edge.action).length);
    for (const safe of allocations) for (const losing of allocations) {
      if (safe.action.id !== losing.action.id && spends(safe.action).some(id=>spends(losing.action).includes(id)) &&
          viable.has(safe.to) && !viable.has(losing.to)) return;
    }
  }
  throw new ModelPlanError('Retryable play needs a real allocation decision: two legal actions spending the same finite resource on different consequences, where one can finish and the other needs Undo. Do not invent a waste receiver or impossible chore; keep completionPolicy:"protected" when the source has no such puzzle.');
}
