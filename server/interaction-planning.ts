import { ModelPlanError, MODEL_PLAN_DIAGNOSTIC_LIMIT } from "./model.js";
import type { WorldDefinition } from "../shared/world.js";
import { validateInteractions, type InteractionPlan, type InteractionAction, type InteractionEffect } from "../shared/interactions.js";

// This is a model transport contract. Runtime validation remains authoritative;
// no model text is executed and every referenced object must exist in the image.
export type PlannedInteractions = InteractionPlan;
type DestinationEffect = Extract<InteractionEffect, {kind:"moveObject"}> & {destinationId?:string};
const identifier = { type: "string", pattern: "^[A-Za-z0-9_-]{1,60}$" };
const effectSchema = { anyOf: [
  { type: "object", additionalProperties: false, properties: { kind: { const: "moveObject" }, entityId: identifier, destinationId: identifier, durationMs: {type:"number",minimum:150,maximum:4000} }, required:["kind","entityId","destinationId","durationMs"] },
  { type: "object", additionalProperties: false, properties: { kind: { const: "openGate" }, entityId: identifier }, required: ["kind", "entityId"] },
  { type: "object", additionalProperties: false, properties: { kind: { type: "string", enum: ["jumpBoost", "moveSpeedBoost"] }, multiplier: { type: "number", exclusiveMinimum: 1, maximum: 2 } }, required: ["kind", "multiplier"] },
] };
const actionProperties = {
  id: identifier, label: { type: "string", maxLength: 80 }, toolId: identifier, targetId: identifier,
  requires: { type: "array", maxItems: 16, items: identifier },
  requiresResourceIds: { type: "array", maxItems: 24, items: identifier },
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
      { type: "object", additionalProperties: false, properties: { ...actionProperties, kind: { type: "string", enum: ["attach", "use", "place"] } }, required: [...Object.keys(actionProperties), "kind"] },
    ] } },
  }, required: ["version", "objects", "actions"] },
] };

export const interactionInstructions = `Meaningful object interactions are supported through gameplay.interactions. Return null and requiredInteractionIds:[] when the person's intention is best served by traversal, collection or discovery. Otherwise design a coherent task using actual source objects: select a carryable tool, then use it on a compatible visible target. Let the user take a role and make a useful change, rather than finding renamed coins. Prefer 2–5 consequential actions when the source supports them; never pad with arbitrary chores. Make their relationship meaningful: preparing a needed resource should enable a later consequence, not simply add unrelated checklist steps. Design around changes in what the player can do: when the image supports preparation followed by a different result, let preparation unlock that result through requires or requiresResourceIds. Several identical transfers to independent recipients are one repeated mechanic, not an escalating sequence. Prefer a distinct supported consequence over more copies of that mechanic, but do not invent a consequence when the image has none. Every prerequisite must express a plausible reason the later action was unavailable; do not impose an arbitrary order on independent actions. A choice is meaningful when the selected supply, destination or order changes the route or visible outcome, rather than only changing an action label. Give the player an intelligible choice when the source allows one, such as compatible supplies serving different recipients; all successful allocations must remain valid. A resource-only task is appropriate when filling or balancing those actual recipients is itself the intended result. A visible movement payoff must move an actual independently separable object to an actual visible destination. Avoid arbitrary motion merely to decorate completion. Keep the creator's requested goal authoritative. For an ordinary photograph and a neutral request, use ordinary plausible object relationships; introduce fantasy only when the creator explicitly asks for it. A resource type must represent a plausible supply and receiver in this scene, not a metaphor invented to connect unrelated objects. Do not turn an arbitrary surface or personal item into a resource receiver just to add steps. Prefer fewer coherent actions over a larger absurd mission. Titles, instructions and action labels must describe visible runtime consequences; they cannot promise transformations the effects do not perform.
The interactions object has version:1, objects and actions. Each object references an actual recognized source ID. Give tools carryable:true. A resource object has {type,capacity,initial}; units are bounded game quantities, not a claim of real physics. A transfer changes resource quantities; it does NOT relocate the source artwork. Its label must describe that actual flow (fill, feed, charge, supply), never claim to place or arrange a physical object, repair machinery, or cook something. If the intended visible change is an object moving to a destination, use place instead of renaming a transfer. Transfer actions move amount from toolId to targetId: both must have the same resource type, source must contain enough, destination must have space. Resource types come from the scene/intent, such as water or charge; do not infer measurements from an image. Each action happens once. Use multiple transfer actions only for genuinely distinct steps. Depend on earlier action IDs in requires to make a causal sequence. Use requiresResourceIds:[receiverId] when an action must wait until those real resource receivers are filled to capacity, regardless of which compatible supply was used; return [] when no filled-resource prerequisite applies. This allows alternate resource allocations followed by one consequential invention or departure, without prescribing a particular transfer receipt. Resource prerequisites check current quantities, not whether the receiver was full earlier. A resource can be used by more than one task, but the entire required sequence must remain possible without free refills.
place means carrying and setting down the selected source object at a real visible destination. Use kind:"place", carryable:true for its tool object and exactly one effect {kind:"moveObject",entityId:toolId,destinationId:targetId,durationMs:900}. The target must be a different detected source object. This releases the held object there; it is not permanently attached and can be picked up again. Successive placements of the same object need an explicit requires sequence, and each destination must differ. Use place for arranging actual pictured objects such as a chair by a table or a book at a shelf; do not call moving the chair itself a use action or mark a selectable object as noncarryable. The destination places the object at the target's center without shrinking it: select an appropriate visible landing region, ensure the complete moved object fits inside the image there, and avoid implausible overlap or clipped edge placements. It does not rotate, resize, reconstruct perspective, animate walking, or change the room's physical geometry.
attach/use actions need a real supported effect: openGate removes an actual recognized gate obstruction in platform/roam mode; jumpBoost improves the moving player's jump in platform mode; moveSpeedBoost improves movement in roam/platform mode. For use/attach, moveObject moves a different independently extracted stationary decoration to the center of a real visible destination: {kind:"moveObject",entityId,destinationId,durationMs:900}. Both IDs must be detected source objects; list this separately triggered moved object in objects with carryable:false. A use/attach action cannot move its own carried tool; choose place when the tool itself is being relocated. This is a straight bounded animation, not navigation, walking, physics or vehicle simulation. Use only when that motion makes sense; do not move through scenery or imply wheels/limbs animate. It works in discover too. They cannot simulate cooking or change arbitrary artwork. Do not describe a capability those operations cannot deliver. No openGate, jumpBoost or moveSpeedBoost in discover: source-native pointer roleplay supports transfers, place, and use/attach actions with moveObject. Transfer itself visibly changes a quantity and can fulfill an objective without an additional effect. Effects are optional only for transfer. Never use openGate as a cosmetic substitute for unrelated repairs.
For source-native roleplay, choose movement:discover, mode:creative, avatarId:null, objective:explore, clues:[] and obstacleIds:[]. Mark tools and targets as decoration (a genuinely opening barrier remains gate); preserve their source identity and positions. No invented finish marker is needed: requiredInteractionIds lists action IDs whose real successful execution completes the mission. For resource-routing puzzles offer every meaningful compatible source/receiver action, leave requiredInteractionIds empty unless a particular action is essential, and set gameplay.requiredResourceIds to receivers that must be filled to capacity. This allows different successful allocations. Never require all mutually exclusive alternative actions. Legacy goalRules arrays stay empty unless the user also explicitly asks for collection/activation. Use short player-facing object labels (Mug, Plant, Crystal), not long recognition descriptions. Keep action labels concise. Keep one concise mission title and an actionable first instruction, e.g. select the visible tool then its target. Object meaning may be creatively reassigned when explicitly requested by the user; this is a play rule, not visual evidence that the object has that real capability. If necessary objects are absent or the request needs unsupported mechanics, ask one focused clarification instead of silently replacing it with a hunt. Never invent detections or dispatch on file names.`;

export function readPlannedInteractions(value: unknown): PlannedInteractions | undefined {
  if (value === undefined || value === null) return undefined;
  const input = value as PlannedInteractions;
  const fail = () => { throw new ModelPlanError("The proposed object interactions were incomplete. Your original image and current game are unchanged."); };
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
    if (!action || !id(action.id) || !id(action.toolId) || !id(action.targetId) ||
      typeof action.label !== "string" || !action.label.trim() || action.label.length > 80 || !["transfer", "attach", "use", "place"].includes(action.kind) ||
      (action.requires !== undefined && (!Array.isArray(action.requires) || action.requires.length > 16 || action.requires.some(dep => !id(dep)))) ||
      (action.requiresResourceIds !== undefined && (!Array.isArray(action.requiresResourceIds) || action.requiresResourceIds.length > 24 || new Set(action.requiresResourceIds).size !== action.requiresResourceIds.length || action.requiresResourceIds.some(dep => !id(dep)))) ||
      (action.effects !== undefined && (!Array.isArray(action.effects) || action.effects.length > 4 || action.effects.some(effect => !effect ||
        (effect.kind === "openGate" ? !id(effect.entityId) : effect.kind === "moveObject" ? !id(effect.entityId) || !id((effect as DestinationEffect).destinationId) || (effect.durationMs !== undefined && (!Number.isFinite(effect.durationMs) || effect.durationMs < 150 || effect.durationMs > 4000)) : !["jumpBoost", "moveSpeedBoost"].includes(effect.kind) || !Number.isFinite(effect.multiplier) || effect.multiplier <= 1 || effect.multiplier > 2)))) ||
      (action.kind === "transfer" ? !Number.isFinite(action.amount) || action.amount! <= 0 || action.amount! > 10000 : !action.effects?.length) ||
      (action.kind === "place" && (action.effects?.length !== 1 || action.effects[0].kind !== "moveObject" || action.effects[0].entityId !== action.toolId || (action.effects[0] as DestinationEffect).destinationId !== action.targetId))) fail();
    return { ...action, label: action.label.trim(), requires: [...(action.requires ?? [])], ...(action.requiresResourceIds?.length ? {requiresResourceIds:[...action.requiresResourceIds]} : {}), effects: [...(action.effects ?? [])] } as InteractionAction;
  });
  if (new Set(objects.map(o => o.entityId)).size !== objects.length || new Set(actions.map(a => a.id)).size !== actions.length) fail();
  return { version: 1, objects, actions };
}

/** Attach only after layout compilation so missing or substituted source IDs
 * cannot make a plausible-looking but nonfunctional game escape validation. */
export function applyPlannedInteractions(world: WorldDefinition, interactions: PlannedInteractions | undefined, requiredIds: string[] = [], allowUnpreparedArtwork = false): WorldDefinition {
  if (!interactions) {
    if (requiredIds.length) throw new ModelPlanError("Required actions were returned without their object interactions. Try interpreting the same image again.");
    return world;
  }
  const ids = new Set(world.entities.map(entity => entity.id));
  if (interactions.objects.some(object => !ids.has(object.entityId)) || interactions.actions.some(action => !ids.has(action.toolId) || !ids.has(action.targetId)))
    throw new ModelPlanError("A proposed interaction lost its original source object during layout. Choose the tool and target again; no substitute has been added.");
  if (requiredIds.some(id => !interactions.actions.some(action => action.id === id)) || new Set(requiredIds).size !== requiredIds.length)
    throw new ModelPlanError("A finishing action did not match the proposed interactions. Choose which actions should complete the game.");
  // Report independent, actionable plan mistakes together. A single correction
  // must not fix geometry only to discover the already-known tool-role error.
  // This is diagnostic preflight, never a plan rewrite; runtime validation below
  // remains authoritative for the complete dependency/resource contract.
  const entities = new Map(world.entities.map(entity => [entity.id, entity]));
  const objects = new Map(interactions.objects.map(object => [object.entityId, object]));
  const diagnostics = new Set<string>();
  const label = (id: string) => (entities.get(id)?.label || id).slice(0, 80);
  for (const action of interactions.actions) {
    const prefix = `Action ${action.id}: `;
    if (!objects.get(action.toolId)?.carryable)
      diagnostics.add(`${prefix}${label(action.toolId)} (${action.toolId}) must be a carried source: set carryable:true for that actual tool.`);
    if (action.toolId === action.targetId)
      diagnostics.add(`${prefix}${label(action.toolId)} needs a distinct target. toolId and targetId cannot reference the same object.`);
    for (const effect of action.effects ?? []) {
      if (effect.kind !== "moveObject") continue;
      if (effect.entityId === action.toolId && action.kind !== "place")
        diagnostics.add(`${prefix}${label(action.toolId)} is its own carried tool; moving it requires kind:"place". A use/attach action must move a different stationary prop.`);
      const destinationId = (effect as DestinationEffect).destinationId;
      if (!destinationId) continue;
      const moved = entities.get(effect.entityId), destination = entities.get(destinationId);
      if (!moved || !destination || moved.id === destination.id) {
        diagnostics.add(`${prefix}Moving ${label(effect.entityId)} needs a different visible destination; ${destinationId} is not valid for it.`);
        continue;
      }
      const x = destination.x + (destination.width - moved.width) / 2;
      const y = destination.y + (destination.height - moved.height) / 2;
      if (x < 0 || y < 0 || x + moved.width > world.width || y + moved.height > world.height)
        diagnostics.add(`${prefix}${label(moved.id)} cannot fit at the center of ${label(destination.id)} without leaving the image. Choose a more central visible destination or correct its source selection. The object has not been resized or moved elsewhere.`);
    }
  }
  if (diagnostics.size) {
    const lines: string[] = [];
    let length = 0;
    for (const diagnostic of diagnostics) {
      if (length + diagnostic.length + 1 > MODEL_PLAN_DIAGNOSTIC_LIMIT - 45) {
        lines.push("Additional plan problems remain.");
        break;
      }
      lines.push(diagnostic); length += diagnostic.length + 1;
    }
    throw new ModelPlanError(lines.join("\n"));
  }
  const compiled: InteractionPlan = { ...interactions, actions: interactions.actions.map(action => ({...action, effects: action.effects?.map(effect => {
    if (effect.kind !== "moveObject" || !(effect as DestinationEffect).destinationId) return effect;
    const destination = world.entities.find(entity => entity.id === (effect as DestinationEffect).destinationId);
    const moved = world.entities.find(entity => entity.id === effect.entityId);
    if (!destination || !moved || destination.id === moved.id) throw new ModelPlanError("The moving object needs a different visible destination.");
    const x = destination.x + (destination.width - moved.width) / 2;
    const y = destination.y + (destination.height - moved.height) / 2;
    if (x < 0 || y < 0 || x + moved.width > world.width || y + moved.height > world.height)
      throw new ModelPlanError(`${moved.label || "The selected object"} cannot fit at the center of ${destination.label || "that destination"} without leaving the image. Choose a more central visible destination or correct its source selection. The object has not been resized or moved elsewhere.`.slice(0, 500));
    return { kind:"moveObject" as const, entityId:effect.entityId, x, y, ...(effect.durationMs ? {durationMs:effect.durationMs} : {}) };
  })})) };
  const candidate: WorldDefinition = { ...world, interactions:compiled, goalRules: { requiredCollectedIds: [], requiredActivatedIds: [], ...world.goalRules, requiredInteractionIds: requiredIds } };
  try { validateInteractions(candidate, {allowUnpreparedArtwork}); }
  catch (error) { throw new ModelPlanError(error instanceof Error ? error.message : "The object interactions could not be validated."); }
  return candidate;
}
