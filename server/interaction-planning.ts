import { InterpretationError } from "./model.js";
import type { WorldDefinition } from "../shared/world.js";
import { validateInteractions, type InteractionPlan, type InteractionAction } from "../shared/interactions.js";

// This is a model transport contract. Runtime validation remains authoritative;
// no model text is executed and every referenced object must exist in the image.
export type PlannedInteractions = InteractionPlan;
const identifier = { type: "string", pattern: "^[A-Za-z0-9_-]{1,60}$" };
const effectSchema = { anyOf: [
  { type: "object", additionalProperties: false, properties: { kind: { const: "openGate" }, entityId: identifier }, required: ["kind", "entityId"] },
  { type: "object", additionalProperties: false, properties: { kind: { type: "string", enum: ["jumpBoost", "moveSpeedBoost"] }, multiplier: { type: "number", exclusiveMinimum: 1, maximum: 2 } }, required: ["kind", "multiplier"] },
] };
const actionProperties = {
  id: identifier, label: { type: "string", maxLength: 80 }, toolId: identifier, targetId: identifier,
  requires: { type: "array", maxItems: 16, items: identifier },
  effects: { type: "array", maxItems: 4, items: effectSchema },
};
export const interactionsSchema = { anyOf: [
  { type: "null" },
  { type: "object", additionalProperties: false, properties: {
    version: { const: 1 },
    objects: { type: "array", minItems: 2, maxItems: 24, items: {
      type: "object", additionalProperties: false,
      properties: {
        entityId: identifier, carryable: { type: "boolean" },
        resource: { anyOf: [{ type: "null" }, { type: "object", additionalProperties: false,
          properties: { type: { ...identifier, maxLength: 40 }, capacity: { type: "number", exclusiveMinimum: 0, maximum: 10000 }, initial: { type: "number", minimum: 0, maximum: 10000 } },
          required: ["type", "capacity", "initial"] }] },
      }, required: ["entityId", "carryable", "resource"],
    } },
    actions: { type: "array", minItems: 1, maxItems: 16, items: { anyOf: [
      { type: "object", additionalProperties: false, properties: { ...actionProperties, kind: { const: "transfer" }, amount: { type: "number", exclusiveMinimum: 0, maximum: 10000 } }, required: [...Object.keys(actionProperties), "kind", "amount"] },
      { type: "object", additionalProperties: false, properties: { ...actionProperties, kind: { type: "string", enum: ["attach", "use"] } }, required: [...Object.keys(actionProperties), "kind"] },
    ] } },
  }, required: ["version", "objects", "actions"] },
] };

export const interactionInstructions = `Meaningful object interactions are supported through gameplay.interactions. Return null and requiredInteractionIds:[] when the person's intention is best served by traversal, collection or discovery. Otherwise design a coherent task using actual source objects: select a carryable tool, then use it on a compatible visible target. Let the user take a role and make a useful change, rather than finding renamed coins. Prefer 2–5 consequential actions when the source supports them; never pad with arbitrary chores. Keep the creator's requested goal authoritative.
The interactions object has version:1, objects and actions. Each object references an actual recognized source ID. Give tools carryable:true. A resource object has {type,capacity,initial}; units are bounded game quantities, not a claim of real physics. Transfer actions move amount from toolId to targetId: both must have the same resource type, source must contain enough, destination must have space. Resource types come from the scene/intent, such as water or charge; do not infer measurements from an image. Each action happens once. Use multiple transfer actions only for genuinely distinct steps. Depend on earlier action IDs in requires to make a causal sequence. A resource can be used by more than one task, but the entire required sequence must remain possible without free refills.
attach/use actions need a real supported effect: openGate removes an actual recognized gate obstruction in platform/roam mode; jumpBoost improves the moving player's jump in platform mode; moveSpeedBoost improves movement in roam/platform mode. They cannot animate a repaired vehicle, simulate cooking, change arbitrary artwork, or make a stationary character walk. Do not describe a capability those operations cannot deliver. No openGate, jumpBoost or moveSpeedBoost in discover: source-native pointer roleplay currently supports transfer tasks. Transfer itself visibly changes a quantity and can fulfill an objective without an additional effect. Effects are optional only for transfer. Never use openGate as a cosmetic substitute for unrelated repairs.
For source-native roleplay, choose movement:discover, mode:creative, avatarId:null, objective:explore, clues:[] and obstacleIds:[]. Mark tools and targets as decoration (a genuinely opening barrier remains gate); preserve their source identity and positions. No invented finish marker is needed: requiredInteractionIds lists action IDs whose real successful execution completes the mission. Legacy goalRules arrays stay empty unless the user also explicitly asks for collection/activation. Keep one concise mission title and an actionable first instruction, e.g. select the visible tool then its target. Object meaning may be creatively assigned by the user; this is a play rule, not visual evidence that the object has that real capability. If necessary objects are absent or the request needs unsupported mechanics, ask one focused clarification instead of silently replacing it with a hunt. Never invent detections or dispatch on file names.`;

export function readPlannedInteractions(value: unknown): PlannedInteractions | undefined {
  if (value === undefined || value === null) return undefined;
  const input = value as PlannedInteractions;
  const fail = () => { throw new InterpretationError("The proposed object interactions were incomplete. Your original image and current game are unchanged."); };
  const id = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z0-9_-]{1,60}$/.test(v) && !["__proto__", "prototype", "constructor"].includes(v);
  if (!input || typeof input !== "object" || input.version !== 1 || !Array.isArray(input.objects) || input.objects.length < 2 || input.objects.length > 24 ||
      !Array.isArray(input.actions) || !input.actions.length || input.actions.length > 16) fail();
  const objects = input.objects.map(object => {
    if (!object || !id(object.entityId) || (object.carryable !== undefined && typeof object.carryable !== "boolean")) fail();
    const resource = object.resource;
    if (resource != null && (typeof resource !== "object" || !id(resource.type) || resource.type.length > 40 ||
      !Number.isFinite(resource.capacity) || !Number.isFinite(resource.initial) || resource.capacity <= 0 || resource.capacity > 10000 || resource.initial < 0 || resource.initial > resource.capacity)) fail();
    return { entityId: object.entityId, carryable: Boolean(object.carryable), ...(resource ? { resource: { ...resource, type: resource.type.trim() } } : {}) };
  });
  const actions = input.actions.map(action => {
    if (!action || !id(action.id) || !id(action.toolId) || !id(action.targetId) || action.toolId === action.targetId ||
      typeof action.label !== "string" || !action.label.trim() || action.label.length > 80 || !["transfer", "attach", "use"].includes(action.kind) ||
      (action.requires !== undefined && (!Array.isArray(action.requires) || action.requires.length > 16 || action.requires.some(dep => !id(dep)))) ||
      (action.effects !== undefined && (!Array.isArray(action.effects) || action.effects.length > 4 || action.effects.some(effect => !effect ||
        (effect.kind === "openGate" ? !id(effect.entityId) : !["jumpBoost", "moveSpeedBoost"].includes(effect.kind) || !Number.isFinite(effect.multiplier) || effect.multiplier <= 1 || effect.multiplier > 2)))) ||
      (action.kind === "transfer" ? !Number.isFinite(action.amount) || action.amount! <= 0 || action.amount! > 10000 : !action.effects?.length)) fail();
    return { ...action, label: action.label.trim(), requires: [...(action.requires ?? [])], effects: [...(action.effects ?? [])] } as InteractionAction;
  });
  if (new Set(objects.map(o => o.entityId)).size !== objects.length || new Set(actions.map(a => a.id)).size !== actions.length) fail();
  return { version: 1, objects, actions };
}

/** Attach only after layout compilation so missing or substituted source IDs
 * cannot make a plausible-looking but nonfunctional game escape validation. */
export function applyPlannedInteractions(world: WorldDefinition, interactions: PlannedInteractions | undefined, requiredIds: string[] = []): WorldDefinition {
  if (!interactions) {
    if (requiredIds.length) throw new InterpretationError("Required actions were returned without their object interactions. Try interpreting the same image again.");
    return world;
  }
  const ids = new Set(world.entities.map(entity => entity.id));
  if (interactions.objects.some(object => !ids.has(object.entityId)) || interactions.actions.some(action => !ids.has(action.toolId) || !ids.has(action.targetId)))
    throw new InterpretationError("A proposed interaction lost its original source object during layout. Choose the tool and target again; no substitute has been added.");
  if (requiredIds.some(id => !interactions.actions.some(action => action.id === id)) || new Set(requiredIds).size !== requiredIds.length)
    throw new InterpretationError("A finishing action did not match the proposed interactions. Choose which actions should complete the game.");
  const candidate: WorldDefinition = { ...world, interactions, goalRules: { requiredCollectedIds: [], requiredActivatedIds: [], ...world.goalRules, requiredInteractionIds: requiredIds } };
  try { validateInteractions(candidate); }
  catch (error) { throw new InterpretationError(error instanceof Error ? error.message : "The object interactions could not be validated."); }
  return candidate;
}
