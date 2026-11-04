import type { PlayState, WorldDefinition } from "./world.js";

/** A bounded, data-only behavior graph. Source entity IDs remain the authority. */
export interface InteractionObject {
  entityId: string;
  carryable?: boolean;
  resource?: { type: string; capacity: number; initial: number };
}
export type InteractionEffect =
  | { kind: "openGate"; entityId: string }
  | { kind: "jumpBoost"; multiplier: number }
  | { kind: "moveSpeedBoost"; multiplier: number }
  | { kind: "moveObject"; entityId: string; x: number; y: number; durationMs?: number };
export interface ObjectMove {
  x: number;
  y: number;
  durationMs: number;
  actionId: string;
}
interface ActionBase {
  id: string;
  label: string;
  toolId: string;
  targetId: string;
  requires?: string[];
  /** These resource objects must currently be full, regardless of transfer route. */
  requiresResourceIds?: string[];
  effects?: InteractionEffect[];
}
export type InteractionAction = ActionBase & (
  | { kind: "transfer"; amount: number }
  | { kind: "attach" }
  | { kind: "use" }
  | { kind: "place" }
);
export interface InteractionPlan {
  version: 1;
  objects: InteractionObject[];
  actions: InteractionAction[];
}
export interface InteractionState {
  heldEntityId: string | null;
  quantities: Record<string, number>;
  completed: string[];
  attachments: Record<string, string>;
  /** Receipts prevent an edited action ID from silently granting a different effect. */
  completedSignatures?: Record<string, string>;
}
export type InteractionCommand =
  | { type: "pickup"; entityId: string }
  | { type: "drop" }
  | { type: "perform"; actionId: string };
export interface InteractionEvent {
  kind: "pickup" | "drop" | "transfer" | "attach" | "use" | "place";
  entityId?: string;
  actionId?: string;
  toolId?: string;
  targetId?: string;
  amount?: number;
}
export interface InteractionResult {
  state: PlayState;
  ok: boolean;
  reason?: string;
  event?: InteractionEvent;
}
const safeId = (v: unknown): v is string => typeof v === "string" && /^[\w-]{1,60}$/.test(v) && !["__proto__", "constructor", "prototype"].includes(v);
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const keysOnly = (v: object, keys: string[]) => Object.keys(v).every(key => keys.includes(key));
const quantity = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 10000;
const fail = (message: string): never => { throw new Error(message); };
// Resource values may be fractional. Compare within floating-point roundoff,
// rather than letting 0.1 + 0.2 overflow a 0.3-capacity container.
const sameQuantity = (a: number, b: number) => Math.abs(a - b) <= Number.EPSILON * 16 * Math.max(Math.abs(a), Math.abs(b));
const hasQuantity = (available: number, required: number) => available >= required || sameQuantity(available, required);

export function validateInteractions(world: WorldDefinition, options: { allowUnpreparedArtwork?: boolean } = {}): void {
  const p = world.interactions;
  if (p === undefined) {
    if ((world.goalRules?.requiredInteractionIds?.length || world.goalRules?.requiredResourceIds?.length)) fail("A task refers to actions that are not in this world.");
    return;
  }
  if (!record(p) || !keysOnly(p, ["version", "objects", "actions"]) || p.version !== 1 ||
      !Array.isArray(p.objects) || !p.objects.length || p.objects.length > 64 ||
      !Array.isArray(p.actions) || p.actions.length > 64)
    fail("This world needs a supported interaction plan.");
  const entities = new Map(world.entities.map(e => [e.id, e]));
  const objects = new Map<string, InteractionObject>();
  for (const o of p.objects) {
    if (!record(o) || !keysOnly(o, ["entityId", "carryable", "resource"]) || !safeId(o.entityId) ||
        objects.has(o.entityId) || !entities.has(o.entityId) ||
        (o.carryable !== undefined && typeof o.carryable !== "boolean"))
      fail("An interaction needs one distinct source object.");
    // Moving a terrain/player/goal would invalidate their ordinary physics roles.
    if (o.carryable && entities.get(o.entityId)!.kind !== "decoration")
      fail("A carried object must have the decoration role so it cannot also be collected or collide as terrain.");
    if (o.resource !== undefined) {
      const r = o.resource;
      if (!record(r) || !keysOnly(r, ["type", "capacity", "initial"]) || !safeId(r.type) ||
          !quantity(r.capacity) || r.capacity <= 0 || !quantity(r.initial) || r.initial > r.capacity)
        fail("Resource levels must fit a positive, bounded capacity.");
    }
    objects.set(o.entityId, o);
  }
  const actions = new Map<string, InteractionAction>();
  const attachedTools = new Set<string>();
  const movementSteps = new Map<string, {actionId: string; x: number; y: number}[]>();
  for (const a of p.actions) {
    if (!record(a) || !keysOnly(a, ["id", "label", "toolId", "targetId", "requires", "requiresResourceIds", "effects", "kind", ...(a.kind === "transfer" ? ["amount"] : [])]) ||
        !safeId(a.id) || actions.has(a.id) || typeof a.label !== "string" || !a.label.trim() || a.label.length > 80 ||
        !["transfer", "attach", "use", "place"].includes(a.kind) || !safeId(a.toolId) || !safeId(a.targetId) || a.toolId === a.targetId ||
        !objects.get(a.toolId)?.carryable || !objects.has(a.targetId) ||
        (a.requires !== undefined && (!Array.isArray(a.requires) || a.requires.length > 32 || a.requires.some(id => !safeId(id)) || new Set(a.requires).size !== a.requires.length)) ||
        (a.effects !== undefined && (!Array.isArray(a.effects) || a.effects.length > 8)))
      fail("An action needs a carried source, a distinct target and supported effects.");
    if (a.requiresResourceIds !== undefined && (!Array.isArray(a.requiresResourceIds) || a.requiresResourceIds.length > 32 || new Set(a.requiresResourceIds).size !== a.requiresResourceIds.length || a.requiresResourceIds.some(id => !safeId(id) || !objects.get(id)?.resource)))
      fail("An action readiness condition needs distinct resource objects from this world.");
    if (a.kind === "transfer") {
      const source = objects.get(a.toolId)!.resource, target = objects.get(a.targetId)!.resource;
      if (!source || !target || source.type !== target.type || !quantity(a.amount) || a.amount <= 0 || a.amount > source.capacity || a.amount > target.capacity)
        fail("A transfer needs compatible resources and a usable amount.");
    } else if (!a.effects?.length) fail("Using, attaching or placing an object must change a supported capability.");
    if (a.kind === "place" && (a.effects?.length !== 1 || a.effects[0].kind !== "moveObject" || a.effects[0].entityId !== a.toolId))
      fail("Placing an object must move only the carried object to one destination.");
    if (a.kind === "attach") {
      if (attachedTools.has(a.toolId)) fail("A part can attach to only one target in this plan.");
      attachedTools.add(a.toolId);
    }
    for (const effect of a.effects ?? []) {
      if (!record(effect)) fail("Unsupported interaction effect.");
      if (effect.kind === "openGate") {
        if (world.gameplay?.movement === "discover" || !keysOnly(effect, ["kind", "entityId"]) || !safeId(effect.entityId) || entities.get(effect.entityId)?.kind !== "gate")
          fail("An opening effect must reference a real gate in a moving world.");
      } else if (effect.kind === "moveObject") {
        const entity = entities.get(effect.entityId);
        const object = objects.get(effect.entityId);
        if (!keysOnly(effect, ["kind", "entityId", "x", "y", "durationMs"]) || !safeId(effect.entityId) ||
            !entity || entity.kind !== "decoration" || !object || (object.carryable && (a.kind !== "place" || effect.entityId !== a.toolId)) ||
            ![effect.x, effect.y].every(Number.isFinite) || effect.x < 0 || effect.y < 0 ||
            effect.x + entity.width > world.width || effect.y + entity.height > world.height ||
            (effect.durationMs !== undefined && (!Number.isFinite(effect.durationMs) || effect.durationMs < 150 || effect.durationMs > 4000)))
          fail("A moving object needs one bounded destination, a stationary prop or explicitly placed carried object, and a supported duration.");
        if (!options.allowUnpreparedArtwork && (!entity!.art || (entity!.artSource && !entity!.sourceLayer)))
          fail("Prepare the moving object's source artwork and background before giving it a destination.");
        const steps = movementSteps.get(effect.entityId) ?? [];
        if (steps.some(step => step.actionId === a.id)) fail("One action cannot give the same object two destinations.");
        steps.push({actionId:a.id,x:effect.x,y:effect.y});
        movementSteps.set(effect.entityId, steps);
      } else if (effect.kind === "jumpBoost" || effect.kind === "moveSpeedBoost") {
        const mode = world.gameplay?.movement ?? "platform";
        if (!keysOnly(effect, ["kind", "multiplier"]) || !Number.isFinite(effect.multiplier) || effect.multiplier <= 1 ||
            effect.multiplier > (effect.kind === "jumpBoost" ? 2.2 : 2) || mode === "discover" || (effect.kind === "jumpBoost" && mode !== "platform"))
          fail("A movement capability must match this world's controls and stay within its supported range.");
      } else fail("Unsupported interaction effect.");
    }
    actions.set(a.id, a);
  }
  const visited = new Set<string>(), visiting = new Set<string>();
  const visit = (id: string) => {
    if (visiting.has(id)) fail("Actions cannot depend on each other in a circle.");
    if (visited.has(id)) return;
    const a = actions.get(id);
    if (!a) fail("An action prerequisite is missing.");
    visiting.add(id);
    for (const dependency of a!.requires ?? []) visit(dependency);
    visiting.delete(id); visited.add(id);
  };
  for (const id of actions.keys()) visit(id);
  const attachmentTargets = new Map(p.actions.filter(a => a.kind === "attach").map(a => [a.toolId, a.targetId]));
  for (const tool of attachmentTargets.keys()) {
    const seen = new Set<string>();
    let current: string | undefined = tool;
    while (current && attachmentTargets.has(current)) {
      if (seen.has(current)) fail("Parts cannot attach to each other in a circle.");
      seen.add(current); current = attachmentTargets.get(current);
    }
  }
  const ancestors = new Map<string, Set<string>>();
  for (const action of p.actions) {
    const dependencies = new Set<string>();
    const collect = (id: string) => {
      if (dependencies.has(id)) return;
      dependencies.add(id);
      for (const prior of actions.get(id)!.requires ?? []) collect(prior);
    };
    for (const id of action.requires ?? []) collect(id);
    ancestors.set(action.id, dependencies);
    if ([...dependencies].some(id => actions.get(id)!.kind === "attach" && actions.get(id)!.toolId === action.toolId))
      fail("A part cannot be used again after a required attachment consumes it.");
  }
  for (const [entityId, steps] of movementSteps) {
    for (let i=0;i<steps.length;i++) for (let j=i+1;j<steps.length;j++) {
      if (!ancestors.get(steps[i].actionId)!.has(steps[j].actionId) && !ancestors.get(steps[j].actionId)!.has(steps[i].actionId))
        fail("Successive moves of one object must follow an explicit prerequisite sequence.");
    }
    const ordered = [...steps].sort((a,b) => ancestors.get(b.actionId)!.has(a.actionId) ? -1 : 1);
    let previous = entities.get(entityId)!;
    for (const step of ordered) {
      if (Math.hypot(step.x-previous.x,step.y-previous.y)<4)
        fail("Each movement must lead to a different position from the preceding step.");
      previous = {...previous,x:step.x,y:step.y};
    }
  }
  const required = world.goalRules?.requiredInteractionIds;
  if (required !== undefined && (!Array.isArray(required) || required.length > 64 || new Set(required).size !== required.length || required.some(id => !safeId(id) || !actions.has(id))))
    fail("A task refers to a missing or repeated action.");
  const resourceGoals = world.goalRules?.requiredResourceIds;
  if (resourceGoals !== undefined && (!Array.isArray(resourceGoals) || resourceGoals.length > 64 || new Set(resourceGoals).size !== resourceGoals.length || resourceGoals.some(id => !safeId(id) || !objects.get(id)?.resource)))
    fail("A resource task refers to a missing or repeated resource object.");
  validateInteractionFeasibility(world);
}

/** Sign only executable meaning: renaming a task must not erase earned work. */
function signature(action: InteractionAction) {
  return JSON.stringify({ kind: action.kind, toolId: action.toolId, targetId: action.targetId,
    requires: [...(action.requires ?? [])].sort(), effects: action.effects ?? [],
    ...(action.requiresResourceIds?.length ? {requiresResourceIds:[...action.requiresResourceIds].sort()} : {}),
    ...(action.kind === "transfer" ? { amount: action.amount } : {}) });
}
function initialState(world: WorldDefinition): InteractionState {
  return {
    heldEntityId: null,
    quantities: Object.fromEntries((world.interactions?.objects ?? []).filter(o => o.resource).map(o => [o.entityId, o.resource!.initial])),
    completed: [], attachments: {}, completedSignatures: {},
  };
}
function blockedReason(world: WorldDefinition, s: InteractionState, action: InteractionAction, checkHeld: boolean): string | undefined {
  if (s.completed.includes(action.id)) return "Already done.";
  if (action.requires?.some(id => !s.completed.includes(id))) return "Complete the earlier step first.";
  const missingResources = (action.requiresResourceIds ?? []).filter(id => {
    const resource = world.interactions!.objects.find(object => object.entityId === id)!.resource!;
    return !hasQuantity(s.quantities[id] ?? 0, resource.capacity);
  });
  if (missingResources.length) {
    const names = missingResources.slice(0,2).map(id => world.entities.find(entity => entity.id === id)?.label?.trim() || "the required object");
    return `Fill ${names.join(" and ")} first${missingResources.length > 2 ? ", along with the other required objects" : ""}.`;
  }
  if (checkHeld && s.heldEntityId !== action.toolId) return "Pick up the matching object first.";
  if (s.attachments[action.toolId]) return "That part is already attached.";
  if (action.kind === "transfer") {
    const target = world.interactions!.objects.find(o => o.entityId === action.targetId)!.resource!;
    if (!hasQuantity(s.quantities[action.toolId] ?? 0, action.amount)) return "Not enough left in this object.";
    if (!hasQuantity(target.capacity, (s.quantities[action.targetId] ?? 0) + action.amount)) return "The target does not have enough room.";
  }
}
function apply(world: WorldDefinition, s: InteractionState, action: InteractionAction) {
  if (action.kind === "transfer") {
    const source = s.quantities[action.toolId];
    const target = s.quantities[action.targetId] + action.amount;
    const capacity = world.interactions!.objects.find(object => object.entityId === action.targetId)!.resource!.capacity;
    s.quantities[action.toolId] = sameQuantity(source, action.amount) ? 0 : Math.max(0, source - action.amount);
    // Store exact full/empty boundary values so progress, saves and the renderer
    // all agree without each consumer inventing its own numeric tolerance.
    s.quantities[action.targetId] = sameQuantity(target, capacity) ? capacity : target;
  }
  if (action.kind === "attach") {
    s.attachments[action.toolId] = action.targetId;
    if (s.heldEntityId === action.toolId) s.heldEntityId = null;
  }
  if (action.kind === "place" && s.heldEntityId === action.toolId) s.heldEntityId = null;
  s.completed.push(action.id);
  s.completedSignatures![action.id] = signature(action);
}

/** Replays valid receipts; saved counters cannot create resources or stale capabilities. */
export function interactionState(world: WorldDefinition, state: PlayState): InteractionState {
  const result = initialState(world), saved = state.interactions;
  if (!world.interactions || !saved || !record(saved)) return result;
  const actions = new Map(world.interactions.actions.map(a => [a.id, a]));
  for (const id of Array.isArray(saved.completed) ? saved.completed.slice(0, 64) : []) {
    const a = actions.get(id);
    if (a && record(saved.completedSignatures) && Object.hasOwn(saved.completedSignatures, id) && saved.completedSignatures[id] === signature(a) && !blockedReason(world, result, a, false)) apply(world, result, a);
  }
  const held = saved.heldEntityId;
  if (typeof held === "string" && world.interactions.objects.some(o => o.entityId === held && o.carryable) && !result.attachments[held]) result.heldEntityId = held;
  return result;
}

/** Search only at validation/action boundaries, never in per-frame affordances.
 * Final quantities matter: filling a target and then draining it does not win. */
function completionFeasibility(world: WorldDefinition, start: InteractionState): "possible" | "impossible" | "bounded" {
  const required = new Set(world.goalRules?.requiredInteractionIds ?? []);
  const resources = (world.goalRules?.requiredResourceIds ?? []).map(id => world.interactions!.objects.find(o => o.entityId === id)!);
  if ((!required.size && !resources.length) || !world.interactions) return "possible";
  const actions = world.interactions.actions;
  const needed = new Set(required);
  const visit = (id: string) => {
    const action = actions.find(candidate => candidate.id === id)!;
    for (const prerequisite of action.requires ?? []) if (!needed.has(prerequisite)) {
      needed.add(prerequisite); visit(prerequisite);
    }
  };
  for (const id of required) visit(id);
  // An optional action with no effect on required work cannot help complete it.
  // Searching every permutation of such actions can exhaust the budget before
  // finding a simple valid route. Retain the complete connected resource graph:
  // outgoing transfers may free capacity, incoming transfers may replenish a
  // supply, and either route may introduce further prerequisites/readiness.
  const relevant = new Set(needed);
  const resourceIds = new Set(resources.map(object => object.entityId));
  let changed = true;
  while (changed) {
    changed = false;
    const addAction = (id: string) => { if (!relevant.has(id)) { relevant.add(id); changed = true; } };
    const addResource = (id: string) => { if (!resourceIds.has(id)) { resourceIds.add(id); changed = true; } };
    for (const action of actions) {
      if (action.kind === "transfer" && (resourceIds.has(action.toolId) || resourceIds.has(action.targetId))) addAction(action.id);
      if (!relevant.has(action.id)) continue;
      for (const id of action.requires ?? []) addAction(id);
      for (const id of action.requiresResourceIds ?? []) addResource(id);
      if (action.kind === "transfer") { addResource(action.toolId); addResource(action.targetId); }
    }
  }
  const ordered = actions.filter(action => relevant.has(action.id)).sort((a, b) => Number(needed.has(b.id)) - Number(needed.has(a.id)));
  const seen = new Set<string>();
  let bounded = false;
  const search = (state: InteractionState): boolean => {
    if ([...needed].every(id => state.completed.includes(id)) && resources.every(object => (state.quantities[object.entityId] ?? 0) >= object.resource!.capacity)) return true;
    const key = [...state.completed].sort().join("|");
    if (seen.has(key)) return false;
    if (seen.size >= 8192) { bounded = true; return false; }
    seen.add(key);
    for (const action of ordered) {
      // Possession is freely selectable for feasibility; attachments still
      // consume parts, and quantities/prerequisites use the live game's rules.
      if (blockedReason(world, state, action, false)) continue;
      const next = structuredClone(state);
      apply(world, next, action);
      if (search(next)) return true;
    }
    return false;
  };
  return search(start) ? "possible" : bounded ? "bounded" : "impossible";
}

export function validateInteractionFeasibility(world: WorldDefinition, state?: PlayState): void {
  const result = completionFeasibility(world, state ? interactionState(world, state) : initialState(world));
  if (result !== "possible") fail(result === "bounded"
    ? "This action plan is too complex to verify. Simplify the required sequence before applying it."
    : state ? "Your current supplies and attached parts cannot complete these new requirements. Keep the earlier rules or add a usable supply or part."
    : "The required tasks cannot be completed with these supplies and attachments. Adjust the amounts or required actions.");
}

export function availableInteractions(world: WorldDefinition, state: PlayState, targetId?: string): InteractionAction[] {
  const s = interactionState(world, state);
  return (world.interactions?.actions ?? []).filter(a => (!targetId || a.targetId === targetId) && !blockedReason(world, s, a, true));
}

const safeChoiceCache = new WeakMap<WorldDefinition, { fingerprint: string; actions: InteractionAction[] }>();

/** Player-facing availability includes completion safety. The decision fingerprint
 * excludes position/frame state; repeated renders reuse the same search results.
 * Plan/rule contents are included so even an in-place authoring change cannot
 * reuse stale eligibility. Target filtering does not repeat feasibility work. */
export function safeAvailableInteractions(world: WorldDefinition, state: PlayState, targetId?: string): InteractionAction[] {
  if (!world.interactions) return [];
  const fingerprint = JSON.stringify([
    world.interactions,
    world.goalRules?.requiredInteractionIds ?? [],
    world.goalRules?.requiredResourceIds ?? [],
    state.interactions ?? null,
  ]);
  let cached = safeChoiceCache.get(world);
  if (!cached || cached.fingerprint !== fingerprint) {
    const normalized = interactionState(world, state);
    const hasGoals = Boolean(world.goalRules?.requiredInteractionIds?.length || world.goalRules?.requiredResourceIds?.length);
    const actions = world.interactions.actions.filter(action => {
      if (blockedReason(world, normalized, action, true)) return false;
      if (!hasGoals) return true;
      const candidate = structuredClone(normalized);
      apply(world, candidate, action);
      return completionFeasibility(world, candidate) === "possible";
    });
    cached = { fingerprint, actions };
    safeChoiceCache.set(world, cached);
  }
  return cached.actions.filter(action => !targetId || action.targetId === targetId);
}

/** Reachability/proximity is checked by the runtime, not guessed from a saved point here. */
export function reduceInteraction(world: WorldDefinition, state: PlayState, command: InteractionCommand): InteractionResult {
  const s = interactionState(world, state);
  const reject = (reason: string): InteractionResult => ({ state, ok: false, reason });
  if (!world.interactions) return reject("This world has no object interactions.");
  if (command.type === "pickup") {
    if (!world.interactions.objects.some(o => o.entityId === command.entityId && o.carryable)) return reject("This object stays in the world.");
    if (s.attachments[command.entityId]) return reject("That part is already attached.");
    if (s.heldEntityId && s.heldEntityId !== command.entityId) return reject("Put down the object you are holding first.");
    if (s.heldEntityId === command.entityId) return reject("You are already holding it.");
    s.heldEntityId = command.entityId;
    return { ok: true, state: { ...state, interactions: s }, event: { kind: "pickup", entityId: command.entityId } };
  }
  if (command.type === "drop") {
    if (!s.heldEntityId) return reject("You are not holding anything.");
    const entityId = s.heldEntityId; s.heldEntityId = null;
    return { ok: true, state: { ...state, interactions: s }, event: { kind: "drop", entityId } };
  }
  const action = world.interactions.actions.find(a => a.id === command.actionId);
  if (!action) return reject("This action is no longer available.");
  const reason = blockedReason(world, s, action, true);
  if (reason) return reject(reason);
  apply(world, s, action);
  const feasibility = completionFeasibility(world, s);
  if (feasibility !== "possible") return reject(feasibility === "bounded"
    ? "This choice needs a simpler task plan before it can be verified."
    : "Keep these supplies or parts for the unfinished tasks. This choice would block completion.");
  return { ok: true, state: { ...state, interactions: s }, event: {
    kind: action.kind, actionId: action.id, toolId: action.toolId, targetId: action.targetId,
    ...(action.kind === "transfer" ? { amount: action.amount } : {}),
  } };
}

export function interactionEffects(world: WorldDefinition, state: PlayState) {
  const completed = interactionState(world, state).completed;
  const actions = new Map((world.interactions?.actions ?? []).map(action => [action.id, action]));
  const openGateIds = new Set<string>();
  const objectMoves: Record<string, ObjectMove> = {};
  let jumpMultiplier = 1, moveSpeedMultiplier = 1;
  // Receipts retain execution order even when an author reorders plan entries.
  for (const id of completed) {
    const action = actions.get(id)!;
    for (const effect of action.effects ?? []) {
      if (effect.kind === "openGate") openGateIds.add(effect.entityId);
      else if (effect.kind === "jumpBoost") jumpMultiplier = Math.max(jumpMultiplier, effect.multiplier);
      else if (effect.kind === "moveSpeedBoost") moveSpeedMultiplier = Math.max(moveSpeedMultiplier, effect.multiplier);
      else if (effect.kind === "moveObject") objectMoves[effect.entityId] = {x: effect.x, y: effect.y, durationMs: effect.durationMs ?? 900, actionId: action.id};
    }
  }
  return { openGateIds: [...openGateIds], jumpMultiplier, moveSpeedMultiplier, objectMoves };
}
