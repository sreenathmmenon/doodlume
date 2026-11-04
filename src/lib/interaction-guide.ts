import type { PlayState, WorldDefinition } from "../../shared/world";
import { activeInteractionSource, selectInteractionSourceCommand, reduceInteraction, interactionChoiceBlockedReason, interactionCompletionStatus, interactionState, safeAvailableInteractions, playerAvailableInteractions } from "../../shared/interactions";
import { objectName } from "./object-name";

export interface InteractionHint {
  entityId: string;
  text: string;
  recovery?: boolean;
}

/** Show the selected tool's present affordances, not a route or a guaranteed
 * solution. In retryable games this deliberately preserves legal risky choices. */
export function selectedSourceTargets(world: WorldDefinition, state: PlayState): string[] {
  if (state.completed && !state.exploring) return [];
  const source = activeInteractionSource(interactionState(world, state));
  if (!source) return [];
  return [...new Set(playerAvailableInteractions(world, state)
    .filter(action => action.kind !== "operate" && action.toolId === source)
    .map(action => action.targetId))];
}

/** An optional hint uses the same legal actions as play. It never spends a
 * resource, changes possession, or supplies a model-invented solution. */
export function nextInteractionHint(world: WorldDefinition, state: PlayState): InteractionHint | undefined {
  if (!world.interactions || (state.completed && !state.exploring)) return;
  const progress = interactionState(world, state);
  if (world.interactions.completionPolicy === "retryable" && interactionCompletionStatus(world, state) === "impossible") {
    const missing = (world.goalRules?.requiredResourceIds ?? []).map(id => world.interactions!.objects.find(object => object.entityId === id))
      .find(object => object?.resource && (progress.quantities[object.entityId] ?? 0) < object.resource.capacity);
    const id = missing?.entityId ?? world.interactions.objects[0].entityId;
    const shortfall = missing?.resource ? `${objectName(world, id, 40)} still needs ${new Intl.NumberFormat("en",{maximumSignificantDigits:6}).format(missing.resource.capacity - (progress.quantities[id] ?? 0))} more. ` : "";
    return {entityId:id, recovery:true, text:`${shortfall}The remaining moves cannot finish this allocation. Revisit your last choice or restart.`};
  }
  const activeSource = activeInteractionSource(progress);
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
    const action = actions.find(action => action.id === id);
    if (!action || interactionChoiceBlockedReason(world, progress, action)) return;
    needed.add(id);
    for (const prior of action.requires ?? []) requireAction(prior);
    for (const resource of action.requiresResourceIds ?? []) requireResource(resource);
    for (const cost of action.costs ?? []) if ((progress.quantities[cost.entityId] ?? 0) < cost.amount)
      for (const refill of actions) if (refill.kind === "transfer" && refill.targetId === cost.entityId) requireAction(refill.id);
    // A refill can be the useful next move, even though only the delivery is
    // listed as a goal. Follow compatible incoming transfers, not object names.
    if (action.kind === "transfer" && (progress.quantities[action.toolId] ?? 0) < action.amount) {
      for (const refill of actions) if (refill.kind === "transfer" && refill.targetId === action.toolId) requireAction(refill.id);
    }
    if (action.kind === "transfer") {
      const capacity = world.interactions!.objects.find(object => object.entityId === action.targetId)?.resource?.capacity ?? 0;
      if ((progress.quantities[action.targetId] ?? 0) + action.amount > capacity) {
        for (const drain of actions) if (drain.kind === "transfer" && drain.toolId === action.targetId || drain.costs?.some(cost=>cost.entityId===action.targetId)) requireAction(drain.id);
      }
    }
  };
  for (const id of world.goalRules?.requiredInteractionIds ?? []) requireAction(id);
  for (const id of world.goalRules?.requiredResourceIds ?? []) requireResource(id);
  for (const id of world.goalRules?.requiredChoiceGroupIds ?? []) {
    const group = world.interactions.choiceGroups?.find(group => group.id === id);
    if (group && !group.actionIds.some(id => progress.completed.includes(id))) {
      for (const actionId of group.actionIds) requireAction(actionId);
    }
  }
  const hasUnfinishedTasks = needed.size > 0;
  const hasInteractionGoals = Boolean(world.goalRules?.requiredInteractionIds?.length || world.goalRules?.requiredResourceIds?.length || world.goalRules?.requiredChoiceGroupIds?.length);
  const candidatesById = new Map(safeAvailableInteractions(world, state)
    .filter(action => action.kind === "operate" && (!hasInteractionGoals || needed.has(action.id)))
    .map(action => [action.id, action]));
  for (const action of world.interactions.objects.flatMap(object => {
    if ((!object.carryable && !object.usableInPlace) || progress.attachments[object.entityId]) return [];
    const command = selectInteractionSourceCommand(world, object.entityId);
    if (!command) return [];
    const selected = reduceInteraction(world, {...state, interactions: {...progress, heldEntityId: null, selectedSourceId: null}}, command);
    if (!selected.ok) return [];
    return safeAvailableInteractions(world, selected.state)
      .filter(action => !hasInteractionGoals || needed.has(action.id));
  })) candidatesById.set(action.id, action);
  const candidates = [...candidatesById.values()];
  const distance = (id: string) => {
    const entity = world.entities.find(entity => entity.id === id);
    return entity && state.player ? Math.hypot(entity.x + entity.width / 2 - state.player.x, entity.y + entity.height / 2 - state.player.y) : 0;
  };
  candidates.sort((a, b) => Number(b.toolId === activeSource) - Number(a.toolId === activeSource)
    || distance(a.toolId === activeSource ? a.targetId : a.toolId) - distance(b.toolId === activeSource ? b.targetId : b.toolId));
  const hintFor = (action: typeof candidates[number]): InteractionHint => action.kind === "operate" || action.toolId === activeSource
    ? {entityId:action.targetId,text:`${action.label} · ${objectName(world,action.targetId,48)}`}
    : {entityId:action.toolId,text:`${world.interactions!.objects.find(object=>object.entityId===action.toolId)?.usableInPlace ? "Select" : "Take"} ${objectName(world,action.toolId,48)} to ${action.label.charAt(0).toLowerCase()}${action.label.slice(1)}.`};
  // Required outcomes may sit behind preparation while another route is ready
  // immediately. Describe the choice before selecting either route's first step.
  // These probes run only for requested hints: at most eight bounded completion
  // searches/step checks, and dependency walks visit each action/resource once.
  let branchProbeBudget = 8;
  const dependencyIds = (memberId: string) => {
    const related = new Set<string>(), resourceIds = new Set<string>();
    const pending: {kind: "action" | "resource"; id: string}[] = [{kind:"action",id:memberId}];
    while (pending.length) {
      const entry = pending.pop()!;
      if (entry.kind === "resource") {
        if (resourceIds.has(entry.id)) continue;
        resourceIds.add(entry.id);
        const resource = world.interactions!.objects.find(object => object.entityId === entry.id)?.resource;
        if (!resource || (progress.quantities[entry.id] ?? 0) >= resource.capacity) continue;
        for (const action of actions) if (action.kind === "transfer" && action.targetId === entry.id) pending.push({kind:"action",id:action.id});
        continue;
      }
      if (related.has(entry.id) || progress.completed.includes(entry.id)) continue;
      const action = actions.find(candidate => candidate.id === entry.id);
      if (!action || interactionChoiceBlockedReason(world, progress, action)) continue;
      related.add(action.id);
      for (const id of action.requires ?? []) pending.push({kind:"action",id});
      for (const id of action.requiresResourceIds ?? []) pending.push({kind:"resource",id});
      for (const cost of action.costs ?? []) if ((progress.quantities[cost.entityId] ?? 0) < cost.amount)
        for (const refill of actions) if (refill.kind === "transfer" && refill.targetId === cost.entityId) pending.push({kind:"action",id:refill.id});
      if (action.kind === "transfer") {
        if ((progress.quantities[action.toolId] ?? 0) < action.amount)
          for (const refill of actions) if (refill.kind === "transfer" && refill.targetId === action.toolId) pending.push({kind:"action",id:refill.id});
        const capacity = world.interactions!.objects.find(object => object.entityId === action.targetId)?.resource?.capacity ?? 0;
        if ((progress.quantities[action.targetId] ?? 0) + action.amount > capacity)
          for (const drain of actions) if (drain.kind === "transfer" && drain.toolId === action.targetId || drain.costs?.some(cost=>cost.entityId===action.targetId)) pending.push({kind:"action",id:drain.id});
      }
    }
    return related;
  };
  const short = (text: string, limit: number) => text.length > limit ? `${text.slice(0,limit-1).trimEnd()}…` : text;
  for (const groupId of world.goalRules?.requiredChoiceGroupIds ?? []) {
    const group = world.interactions.choiceGroups?.find(candidate => candidate.id === groupId);
    if (!group || group.actionIds.some(id => progress.completed.includes(id))) continue;
    const routes: {entityId: string; text: string; first?: typeof candidates[number]}[] = [];
    for (const id of group.actionIds) {
      if (branchProbeBudget <= 0) break;
      const member = actions.find(action => action.id === id)!;
      if (interactionChoiceBlockedReason(world, progress, member)) continue;
      const related = dependencyIds(id);
      const first = candidates.find(candidate => related.has(candidate.id));
      if (!first) continue;
      const branchWorld: WorldDefinition = {...world, interactions: {...world.interactions, completionPolicy:"protected"}, goalRules: {
        ...(world.goalRules ?? {requiredCollectedIds:[],requiredActivatedIds:[]}),
        requiredInteractionIds: [...new Set([...(world.goalRules?.requiredInteractionIds ?? []),id])],
      }};
      branchProbeBudget--;
      if (interactionCompletionStatus(branchWorld,state) !== "possible") continue;
      let preparation = first.id === id ? "" : " (prepare first)";
      let verifiedFirst = first.id === id;
      if (first.id !== id && branchProbeBudget > 0) {
        const selected = first.kind === "operate" ? {ok:true,state} : reduceInteraction(branchWorld,
          {...state,interactions:{...progress,heldEntityId:null,selectedSourceId:null}}, selectInteractionSourceCommand(branchWorld,first.toolId));
        branchProbeBudget--;
        // A safe step for the overall OR goal need not preserve this particular
        // route. Name preparation only when its actual reducer proves that too.
        if (selected.ok && reduceInteraction(branchWorld,selected.state,{type:"perform",actionId:first.id}).ok) {
          preparation = ` (first: ${short(first.label,40)})`;
          verifiedFirst = true;
        }
      }
      routes.push({entityId:member.toolId,text:`${short(member.label,52)}${preparation}`,...(verifiedFirst ? {first} : {})});
    }
    if (routes.length > 1) return {entityId:routes[0].entityId,text:`Choose: ${routes.slice(0,2).map(route=>route.text).join(" or ")}${routes.length>2 ? `, or ${routes.length-2} more` : ""}.`};
    if (routes.length === 1 && routes[0].first) return hintFor(routes[0].first);
    if (branchProbeBudget <= 0) break;
  }
  const next = candidates[0];
  const choice = world.interactions.choiceGroups?.find(group => next && group.actionIds.includes(next.id));
  const alternatives = choice ? candidates.filter(action => choice.actionIds.includes(action.id)) : [];
  if (next && alternatives.length > 1) {
    const names = alternatives.slice(0, 2).map(action => action.label);
    return { entityId: next.toolId, text: `Choose: ${names.join(" or ")}${alternatives.length > 2 ? `, or ${alternatives.length - 2} more` : ""}.` };
  }
  if (next) return hintFor(next);
  const collectible = world.goalRules?.requiredCollectedIds.find(id => !state.collected.includes(id));
  const switchId = world.goalRules?.requiredActivatedIds.find(id => !state.activated.includes(id));
  const entityId = collectible ?? switchId ?? (!hasUnfinishedTasks ? world.entities.find(entity => entity.kind === "goal")?.id : undefined);
  if (entityId) return { entityId, text: `${collectible ? "Collect" : switchId ? "Activate" : "Reach"} ${objectName(world, entityId, 48)}.` };
}

/** Feedback is a receipt for changed game quantities, never a predicted physical
 * transformation. Both ends come from the same normalized saved-state rules. */
export function interactionResourceChanges(world: WorldDefinition, before: PlayState, after: PlayState): {entityId: string; delta: number}[] {
  const previous = interactionState(world, before), next = interactionState(world, after);
  return (world.interactions?.objects ?? []).flatMap(object => {
    if (!object.resource) return [];
    const delta = (next.quantities[object.entityId] ?? 0) - (previous.quantities[object.entityId] ?? 0);
    return delta ? [{entityId: object.entityId, delta}] : [];
  });
}
