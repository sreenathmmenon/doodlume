import { emptyPlayState, type GoalRules, type PlayState, type WorldEntity } from "../shared/world.js";
import { interactionEffects, reduceInteraction, selectInteractionSourceCommand } from "../shared/interactions.js";
import { applyPlannedInteractions, type PlannedInteractions } from "./interaction-planning.js";
import { InterpretationError } from "./model.js";

/** Prove one playable route, including resource choices and gates. An optional
 * action may spend the key supply, so executing every action in model order is
 * not a valid reachability test. Source geometry is never moved to pass this. */
export function checkRoamRoute(width: number, height: number, guide: WorldEntity, entities: WorldEntity[], rules: GoalRules, interactions?: PlannedInteractions) {
  const blockers = entities.filter(entity => ["terrain", "bridge", "gate"].includes(entity.kind));
  const step = 32, radius = 18;
  const behaviorIds = new Set(interactions?.objects.map(object => object.entityId) ?? []);
  const targets = entities.filter(entity => ["coin", "lever", "goal"].includes(entity.kind) || behaviorIds.has(entity.id));
  const cols = Math.ceil((width - radius * 2) / step) + 1;
  const rows = Math.ceil((height - radius * 2) / step) + 1;
  const point = (index: number) => ({ x: Math.min(width - radius, radius + index % cols * step), y: Math.min(height - radius, radius + Math.floor(index / cols) * step) });
  const free = (x: number, y: number, solids: WorldEntity[]) => solids.every(solid => x + radius <= solid.x || x - radius >= solid.x + solid.width || y + radius <= solid.y || y - radius >= solid.y + solid.height);
  const outsideTargets = (x: number, y: number) => targets.every(target => Math.hypot(
    Math.max(target.x - x, 0, x - target.x - target.width),
    Math.max(target.y - y, 0, y - target.y - target.height)) >= radius + 24);
  let start = -1, distance = Infinity;
  for (let index = 0; index < cols * rows; index++) {
    const at = point(index);
    if (!free(at.x, at.y, blockers) || !outsideTargets(at.x, at.y)) continue;
    const nextDistance = Math.hypot(at.x - guide.x - guide.width / 2, at.y - guide.y - guide.height / 2);
    if (nextDistance < distance) { start = index; distance = nextDistance; }
  }
  if (start === -1) throw new InterpretationError("There is no clear starting space outside the proposed objects and obstacles. Choose more focused source details, or explore this image through discovery.");
  const at = point(start);
  guide.x = at.x - guide.width / 2; guide.y = at.y - guide.height / 2;
  if (!blockers.length) return;

  const regions = new Map<string, Int32Array>();
  let visitedCells = 0;
  const region = (opened: Set<string>) => {
    const key = [...opened].sort().join("|");
    const cached = regions.get(key);
    if (cached) return cached;
    const solids = blockers.filter(entity => !opened.has(entity.id));
    const seen = new Uint8Array(cols * rows), queue = new Int32Array(cols * rows);
    let head = 0, tail = 1;
    queue[0] = start; seen[start] = 1;
    while (head < tail) {
      if (++visitedCells > 2_000_000) throw new InterpretationError("This route has too many interacting choices to verify. Simplify its dependencies or obstacles before playing.");
      const index = queue[head++], col = index % cols, row = Math.floor(index / cols), from = point(index);
      for (const candidate of [col > 0 ? index - 1 : -1, col + 1 < cols ? index + 1 : -1,
        row > 0 ? index - cols : -1, row + 1 < rows ? index + cols : -1]) {
        if (candidate < 0 || seen[candidate]) continue;
        const to = point(candidate);
        const clearSegment = solids.every(solid => Math.max(from.x, to.x) + radius <= solid.x || Math.min(from.x, to.x) - radius >= solid.x + solid.width || Math.max(from.y, to.y) + radius <= solid.y || Math.min(from.y, to.y) - radius >= solid.y + solid.height);
        if (free(to.x, to.y, solids) && clearSegment) { seen[candidate] = 1; queue[tail++] = candidate; }
      }
    }
    const result = queue.slice(0, tail);
    // Bound retained flood maps for unusually large photographs and many gates.
    if (regions.size >= 16) regions.delete(regions.keys().next().value!);
    regions.set(key, result);
    return result;
  };
  const reachable = (entity: WorldEntity, cells: Int32Array) => {
    for (const index of cells) {
      const at = point(index);
      if (behaviorIds.has(entity.id)) {
        if (Math.hypot(Math.max(entity.x - at.x, 0, at.x - entity.x - entity.width), Math.max(entity.y - at.y, 0, at.y - entity.y - entity.height)) <= 100) return true;
      } else if (entity.kind === "lever") {
        if (Math.hypot(at.x - entity.x - entity.width / 2, at.y - entity.y - entity.height / 2) <= 135) return true;
      } else if (at.x + radius >= entity.x && at.x - radius <= entity.x + entity.width && at.y + radius >= entity.y && at.y - radius <= entity.y + entity.height) return true;
    }
    return false;
  };
  const behaviorWorld = interactions ? applyPlannedInteractions({
    id: "roam-preflight", name: "Source interaction preflight", description: "", theme: "grove",
    width, height, source: "manual", sourceImage: "/art/preflight.png", revision: 1, entities, goalRules: rules,
    gameplay: { movement: "roam", objectiveTitle: "Check access", instructions: "Use the source objects." },
  }, interactions, rules.requiredInteractionIds, true) : undefined;
  const required = new Set([...rules.requiredCollectedIds, ...rules.requiredActivatedIds]);
  const goals = entities.filter(entity => entity.kind === "goal");
  const byId = new Map(entities.map(entity => [entity.id, entity]));
  const allActions = behaviorWorld?.interactions?.actions ?? [];
  const relevantActions = new Set(rules.requiredInteractionIds ?? []);
  const choiceMembers = new Set(interactions?.choiceGroups?.flatMap(group => group.actionIds) ?? []);
  for (const actionId of choiceMembers) relevantActions.add(actionId);
  const relevantResources = new Set(rules.requiredResourceIds ?? []);
  const relevantObjects = new Set([...required, ...goals.map(goal => goal.id)]);
  // Backward slice from winning conditions and source access. Keep the whole
  // connected resource network: draining a receiver may make room for a later
  // required transfer, so amount-only pruning would be unsafe.
  let expanded: boolean;
  do {
    const count = relevantActions.size + relevantResources.size + relevantObjects.size;
    for (const action of allActions) {
      const changesAccess = action.effects?.some(effect => effect.kind === "openGate" && blockers.some(blocker => blocker.id === effect.entityId) ||
        effect.kind === "moveObject" && relevantObjects.has(effect.entityId));
      const movesNeededPart = action.kind === "attach" && relevantObjects.has(action.toolId);
      const connectsResource = action.kind === "transfer" && (relevantResources.has(action.toolId) || relevantResources.has(action.targetId));
      if (changesAccess || movesNeededPart || connectsResource) relevantActions.add(action.id);
      if (!relevantActions.has(action.id)) continue;
      relevantObjects.add(action.toolId); relevantObjects.add(action.targetId);
      for (const id of action.requires ?? []) relevantActions.add(id);
      for (const id of action.requiresResourceIds ?? []) relevantResources.add(id);
      if (action.kind === "transfer") { relevantResources.add(action.toolId); relevantResources.add(action.targetId); }
    }
    expanded = count !== relevantActions.size + relevantResources.size + relevantObjects.size;
  } while (expanded);
  const routeActions = allActions.filter(action => relevantActions.has(action.id));
  const frontier: PlayState[] = [emptyPlayState()];
  const seenStates = new Set<string>([""]);
  const predecessors = new Map<string, Set<string>>(), winning = new Set<string>();
  let bounded = false;
  for (let head = 0; head < frontier.length; head++) {
    const state = frontier[head];
    const stateKey = [...(state.interactions?.completed ?? [])].sort().join("|");
    const effects: Pick<ReturnType<typeof interactionEffects>, "openGateIds" | "objectMoves"> = behaviorWorld ? interactionEffects(behaviorWorld, state) : { openGateIds: [], objectMoves: {} };
    const opened = new Set<string>(effects.openGateIds);
    let cells = region(opened);
    // Ordinary switches are free to activate and only expand the region.
    let changed: boolean;
    do {
      changed = false;
      for (const lever of entities.filter(entity => entity.kind === "lever" && entity.targetId)) {
        if (!opened.has(lever.targetId!) && blockers.some(solid => solid.id === lever.targetId && solid.kind === "gate") && reachable(lever, cells)) {
          opened.add(lever.targetId!); changed = true;
        }
      }
      if (changed) cells = region(opened);
    } while (changed);
    const positions = new Map<string, WorldEntity>();
    const currentEntity = (id: string): WorldEntity => {
      const cached = positions.get(id);
      if (cached) return cached;
      const entity = byId.get(id)!;
      const moved = effects.objectMoves[id];
      const parentId = state.interactions?.attachments[id];
      let position = moved ? { ...entity, x: moved.x, y: moved.y } : entity;
      if (parentId) {
        // Match the runtime's mounted-part sizing and offset. Resolve parents
        // recursively so nested attachments follow a moved receiving object.
        const parent = currentEntity(parentId), originalParent = byId.get(parentId)!;
        const scale = Math.min(1, Math.max(originalParent.width, originalParent.height) * .5 / Math.max(entity.width, entity.height));
        const partWidth = entity.width * scale, partHeight = entity.height * scale;
        position = { ...entity, width: partWidth, height: partHeight,
          x: parent.x + parent.width * .65 - partWidth / 2,
          y: parent.y + parent.height / 2 + (parent.kind === "player" ? originalParent.height * .2 - partHeight / 2 : -partHeight) };
      }
      positions.set(id, position);
      return position;
    };
    const actionsComplete = (rules.requiredInteractionIds ?? []).every(id => state.interactions?.completed.includes(id));
    const choicesComplete = (rules.requiredChoiceGroupIds ?? []).every(id =>
      interactions?.choiceGroups?.find(group => group.id === id)?.actionIds.some(actionId => state.interactions?.completed.includes(actionId)));
    const resourcesComplete = (rules.requiredResourceIds ?? []).every(id => {
      const resource = interactions!.objects.find(object => object.entityId === id)!.resource!;
      return (state.interactions?.quantities[id] ?? resource.initial) >= resource.capacity;
    });
    if (actionsComplete && choicesComplete && resourcesComplete && [...required].every(id => reachable(currentEntity(id), cells)) && (!goals.length || goals.some(goal => reachable(currentEntity(goal.id), cells)))) {
      if (!choiceMembers.size) return;
      winning.add(stateKey);
    }
    if (!behaviorWorld) break;
    for (const action of routeActions) {
      if (state.interactions?.completed.includes(action.id) || !reachable(currentEntity(action.toolId), cells) || !reachable(currentEntity(action.targetId), cells)) continue;
      const dropped = action.kind === "operate" ? {ok:true,state:state} : reduceInteraction(behaviorWorld, state, { type: "drop" });
      const picked = action.kind === "operate" ? {ok:true,state:dropped.ok ? dropped.state : state} : reduceInteraction(behaviorWorld, dropped.ok ? dropped.state : state, selectInteractionSourceCommand(behaviorWorld,action.toolId));
      if (!picked.ok) continue;
      const performed = reduceInteraction(behaviorWorld, picked.state, { type: "perform", actionId: action.id });
      if (!performed.ok) continue;
      // Validated moves of one object have a dependency order or are exclusive;
      // quantities and attachments are determined by the completed action set.
      const key = [...performed.state.interactions!.completed].sort().join("|");
      if (!predecessors.has(key)) predecessors.set(key, new Set());
      predecessors.get(key)!.add(stateKey);
      if (seenStates.has(key)) continue;
      if (seenStates.size >= 2048) { bounded = true; continue; }
      seenStates.add(key); frontier.push(performed.state);
    }
  }
  if (bounded) throw new InterpretationError("This route has too many interacting choices to verify. Simplify its dependencies or obstacles before playing.");
  if (choiceMembers.size) {
    // Every offered selection, including combinations across groups, must still
    // have a physical route to completion. Undo is not a substitute for a route.
    const viable = new Set(winning), queue = [...winning];
    for (let head = 0; head < queue.length; head++) for (const prior of predecessors.get(queue[head]) ?? [])
      if (!viable.has(prior)) { viable.add(prior); queue.push(prior); }
    if (viable.size === seenStates.size && [...choiceMembers].every(id => frontier.some(state => state.interactions?.completed.includes(id)))) return;
    throw new InterpretationError("The intended obstacles block a choice route. Every offered choice must remain reachable and allow the required objects or destination to be completed. Check its targets, supplies and opened paths.");
  }
  throw new InterpretationError("The intended obstacles block the route to the required objects or destination. Check access to the tools, targets and supplies; no substitute route has been added.");
}
