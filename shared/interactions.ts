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
  | { kind: "moveSpeedBoost"; multiplier: number };
interface ActionBase {
  id: string;
  label: string;
  toolId: string;
  targetId: string;
  requires?: string[];
  effects?: InteractionEffect[];
}
export type InteractionAction = ActionBase & (
  | { kind: "transfer"; amount: number }
  | { kind: "attach" }
  | { kind: "use" }
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
  kind: "pickup" | "drop" | "transfer" | "attach" | "use";
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

export function validateInteractions(world: WorldDefinition): void {
  const p = world.interactions;
  if (p === undefined) {
    if (world.goalRules?.requiredInteractionIds?.length) fail("A task refers to actions that are not in this world.");
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
  for (const a of p.actions) {
    if (!record(a) || !keysOnly(a, ["id", "label", "toolId", "targetId", "requires", "effects", "kind", ...(a.kind === "transfer" ? ["amount"] : [])]) ||
        !safeId(a.id) || actions.has(a.id) || typeof a.label !== "string" || !a.label.trim() || a.label.length > 80 ||
        !["transfer", "attach", "use"].includes(a.kind) || !safeId(a.toolId) || !safeId(a.targetId) || a.toolId === a.targetId ||
        !objects.get(a.toolId)?.carryable || !objects.has(a.targetId) ||
        (a.requires !== undefined && (!Array.isArray(a.requires) || a.requires.length > 32 || a.requires.some(id => !safeId(id)) || new Set(a.requires).size !== a.requires.length)) ||
        (a.effects !== undefined && (!Array.isArray(a.effects) || a.effects.length > 8)))
      fail("An action needs a carried source, a distinct target and supported effects.");
    if (a.kind === "transfer") {
      const source = objects.get(a.toolId)!.resource, target = objects.get(a.targetId)!.resource;
      if (!source || !target || source.type !== target.type || !quantity(a.amount) || a.amount <= 0 || a.amount > source.capacity || a.amount > target.capacity)
        fail("A transfer needs compatible resources and a usable amount.");
    } else if (!a.effects?.length) fail("Using or attaching an object must change a supported capability.");
    if (a.kind === "attach") {
      if (attachedTools.has(a.toolId)) fail("A part can attach to only one target in this plan.");
      attachedTools.add(a.toolId);
    }
    for (const effect of a.effects ?? []) {
      if (!record(effect)) fail("Unsupported interaction effect.");
      if (effect.kind === "openGate") {
        if (world.gameplay?.movement === "discover" || !keysOnly(effect, ["kind", "entityId"]) || !safeId(effect.entityId) || entities.get(effect.entityId)?.kind !== "gate")
          fail("An opening effect must reference a real gate in a moving world.");
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
  for (const action of p.actions) {
    const dependencies = new Set<string>();
    const collect = (id: string) => {
      if (dependencies.has(id)) return;
      dependencies.add(id);
      for (const prior of actions.get(id)!.requires ?? []) collect(prior);
    };
    for (const id of action.requires ?? []) collect(id);
    if ([...dependencies].some(id => actions.get(id)!.kind === "attach" && actions.get(id)!.toolId === action.toolId))
      fail("A part cannot be used again after a required attachment consumes it.");
  }
  const required = world.goalRules?.requiredInteractionIds;
  if (required !== undefined && (!Array.isArray(required) || required.length > 64 || new Set(required).size !== required.length || required.some(id => !safeId(id) || !actions.has(id))))
    fail("A task refers to a missing or repeated action.");
  validateInteractionFeasibility(world);
}

/** Sign only executable meaning: renaming a task must not erase earned work. */
function signature(action: InteractionAction) {
  return JSON.stringify({ kind: action.kind, toolId: action.toolId, targetId: action.targetId,
    requires: [...(action.requires ?? [])].sort(), effects: action.effects ?? [],
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
  if (checkHeld && s.heldEntityId !== action.toolId) return "Pick up the matching object first.";
  if (s.attachments[action.toolId]) return "That part is already attached.";
  if (action.kind === "transfer") {
    const target = world.interactions!.objects.find(o => o.entityId === action.targetId)!.resource!;
    if ((s.quantities[action.toolId] ?? 0) < action.amount) return "Not enough left in this object.";
    if ((s.quantities[action.targetId] ?? 0) + action.amount > target.capacity) return "The target does not have enough room.";
  }
}
function apply(s: InteractionState, action: InteractionAction) {
  if (action.kind === "transfer") {
    s.quantities[action.toolId] = Math.max(0, s.quantities[action.toolId] - action.amount);
    s.quantities[action.targetId] += action.amount;
  }
  if (action.kind === "attach") {
    s.attachments[action.toolId] = action.targetId;
    if (s.heldEntityId === action.toolId) s.heldEntityId = null;
  }
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
    if (a && record(saved.completedSignatures) && Object.hasOwn(saved.completedSignatures, id) && saved.completedSignatures[id] === signature(a) && !blockedReason(world, result, a, false)) apply(result, a);
  }
  const held = saved.heldEntityId;
  if (typeof held === "string" && world.interactions.objects.some(o => o.entityId === held && o.carryable) && !result.attachments[held]) result.heldEntityId = held;
  return result;
}

/** Validate only after graph syntax/IDs. Explore real bounded states, permitting
 * optional supporting actions without requiring mutually exclusive choices.
 * This runs during plan/rule validation, never in the per-frame reducer. */
export function validateInteractionFeasibility(world: WorldDefinition): void {
  const required = new Set(world.goalRules?.requiredInteractionIds ?? []);
  if (!required.size || !world.interactions) return;
  const actions = world.interactions.actions;
  const needed = new Set(required);
  const visit = (id: string) => {
    const action = actions.find(candidate => candidate.id === id)!;
    for (const prerequisite of action.requires ?? []) if (!needed.has(prerequisite)) {
      needed.add(prerequisite); visit(prerequisite);
    }
  };
  for (const id of required) visit(id);
  const ordered = [...actions].sort((a, b) => Number(needed.has(b.id)) - Number(needed.has(a.id)));
  const seen = new Set<string>();
  let bounded = false;
  const search = (state: InteractionState): boolean => {
    if ([...needed].every(id => state.completed.includes(id))) return true;
    const key = [...state.completed].sort().join("|");
    if (seen.has(key)) return false;
    if (seen.size >= 8192) { bounded = true; return false; }
    seen.add(key);
    for (const action of ordered) {
      // Possession is freely selectable for feasibility; attachments still
      // consume parts, and quantities/prerequisites use the live game's rules.
      if (blockedReason(world, state, action, false)) continue;
      const next = structuredClone(state);
      apply(next, action);
      if (search(next)) return true;
    }
    return false;
  };
  if (!search(initialState(world))) fail(bounded
    ? "This action plan is too complex to verify. Simplify the required sequence before applying it."
    : "The required tasks cannot be completed with these supplies and attachments. Adjust the amounts or required actions.");
}

export function availableInteractions(world: WorldDefinition, state: PlayState, targetId?: string): InteractionAction[] {
  const s = interactionState(world, state);
  return (world.interactions?.actions ?? []).filter(a => (!targetId || a.targetId === targetId) && !blockedReason(world, s, a, true));
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
  apply(s, action);
  return { ok: true, state: { ...state, interactions: s }, event: {
    kind: action.kind, actionId: action.id, toolId: action.toolId, targetId: action.targetId,
    ...(action.kind === "transfer" ? { amount: action.amount } : {}),
  } };
}

export function interactionEffects(world: WorldDefinition, state: PlayState) {
  const completed = new Set(interactionState(world, state).completed);
  const openGateIds = new Set<string>();
  let jumpMultiplier = 1, moveSpeedMultiplier = 1;
  for (const action of world.interactions?.actions ?? []) if (completed.has(action.id)) {
    for (const effect of action.effects ?? []) {
      if (effect.kind === "openGate") openGateIds.add(effect.entityId);
      else if (effect.kind === "jumpBoost") jumpMultiplier = Math.max(jumpMultiplier, effect.multiplier);
      else if (effect.kind === "moveSpeedBoost") moveSpeedMultiplier = Math.max(moveSpeedMultiplier, effect.multiplier);
    }
  }
  return { openGateIds: [...openGateIds], jumpMultiplier, moveSpeedMultiplier };
}
