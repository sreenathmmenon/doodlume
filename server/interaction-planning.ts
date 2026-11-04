import { validateGeneratedRetryablePlan } from "./retryable-planning.js";
import { ModelPlanError, MODEL_PLAN_DIAGNOSTIC_LIMIT } from "./model.js";
import type { WorldDefinition, WorldEntity } from "../shared/world.js";
import { validateInteractions, validateInteractionChoiceOutcomes, type InteractionPlan, type InteractionAction, type InteractionEffect } from "../shared/interactions.js";

// This is a model transport contract. Runtime validation remains authoritative;
// no model text is executed and every referenced object must exist in the image.
export type PlannedInteractions = InteractionPlan;
const destinationAlignments = ["center", "left", "right", "above", "below"] as const;
type DestinationAlignment = typeof destinationAlignments[number];
type DestinationAnchor = {x:number;y:number};
type DestinationEffect = Extract<InteractionEffect, {kind:"moveObject"}> & {destinationId?:string; destinationAlignment?:DestinationAlignment; destinationAnchor?:DestinationAnchor};
const validDestinationAnchor = (value: unknown): value is DestinationAnchor => !!value && typeof value === "object" && !Array.isArray(value) &&
  Object.keys(value).length === 2 && Object.keys(value).every(key=>key==="x"||key==="y") &&
  ["x","y"].every(key=>{const n=(value as Record<string,unknown>)[key];return typeof n==="number"&&Number.isFinite(n)&&n>=0&&n<=1;});
const destinationPoint = (moved: WorldEntity, destination: WorldEntity, alignment?: DestinationAlignment, anchor?: DestinationAnchor) => {
  if (anchor !== undefined) {
    if (!validDestinationAnchor(anchor) || alignment !== undefined) throw new ModelPlanError("destinationAnchor needs only finite x/y fractions from 0 to 1 and cannot be combined with destinationAlignment.");
    if (moved.width > destination.width || moved.height > destination.height)
      throw new ModelPlanError(`${moved.label || moved.id} cannot fit inside ${destination.label || destination.id} at any destinationAnchor without resizing. Choose a larger actual destination or a source-consistent exterior alignment.`);
    return {x:destination.x+(destination.width-moved.width)*anchor.x,y:destination.y+(destination.height-moved.height)*anchor.y};
  }
  alignment ??= "center";
  if (!destinationAlignments.includes(alignment)) throw new ModelPlanError("Choose a supported source-relative destination alignment.");
  const gap = 8;
  const x = destination.x + (destination.width - moved.width) / 2;
  const y = destination.y + (destination.height - moved.height) / 2;
  return {x: alignment === "left" ? destination.x - moved.width - gap : alignment === "right" ? destination.x + destination.width + gap : x,
    y: alignment === "above" ? destination.y - moved.height - gap : alignment === "below" ? destination.y + destination.height + gap : y};
};
const destinationPhrase = (alignment: DestinationAlignment = "center", anchor?:DestinationAnchor) => anchor ? "inside" : alignment === "center" ? "at the center of" :
  alignment === "left" || alignment === "right" ? `to the ${alignment} of` : alignment;
const identifier = { type: "string", pattern: "^[A-Za-z0-9_-]{1,60}$" };
const moveObjectProperties = {kind:{const:"moveObject"},entityId:identifier,destinationId:identifier,durationMs:{type:"number",minimum:150,maximum:4000}};
const moveObjectRequired = ["kind","entityId","destinationId","durationMs"];
const moveObjectSchemas = [
  {type:"object",additionalProperties:false,properties:{...moveObjectProperties,destinationAlignment:{type:"string",enum:destinationAlignments}},required:moveObjectRequired},
  {type:"object",additionalProperties:false,properties:{...moveObjectProperties,destinationAnchor:{type:"object",additionalProperties:false,properties:{x:{type:"number",minimum:0,maximum:1},y:{type:"number",minimum:0,maximum:1}},required:["x","y"]}},required:[...moveObjectRequired,"destinationAnchor"]},
];
const effectSchema = { anyOf: [
  ...moveObjectSchemas,
  { type: "object", additionalProperties: false, properties: { kind: { const: "openGate" }, entityId: identifier }, required: ["kind", "entityId"] },
  { type: "object", additionalProperties: false, properties: { kind: { type: "string", enum: ["jumpBoost", "moveSpeedBoost"] }, multiplier: { type: "number", exclusiveMinimum: 1, maximum: 2 } }, required: ["kind", "multiplier"] },
] };
const costsSchema = {type:"array",maxItems:8,items:{type:"object",additionalProperties:false,properties:{entityId:identifier,amount:{type:"number",exclusiveMinimum:0,maximum:10000}},required:["entityId","amount"]}};
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
    completionPolicy: {type:"string",enum:["protected","retryable"]},
    choiceGroups: { type: "array", maxItems: 8, items: {
      type: "object", additionalProperties: false,
      properties: { id: identifier, label: { type: "string", minLength: 1, maxLength: 80 }, actionIds: { type: "array", minItems: 2, maxItems: 4, uniqueItems: true, items: identifier } },
      required: ["id", "label", "actionIds"],
    } },
    objects: { type: "array", minItems: 1, maxItems: 24, items: {
      type: "object", additionalProperties: false,
      properties: {
        entityId: identifier, carryable: { type: "boolean", description: "True for a source the player physically carries. A fixed discover transfer source instead declares carryable:false and usableInPlace:true. A directly operated stationary controller needs carryable:false only." },
        usableInPlace: {type:"boolean",description:"Optional explicit fixed source: discover decoration resource-transfer tools only. Never carry, attach, place or move this object; its source artwork stays in place."}, layer: {type:"string",enum:["surface","object"]},
        resource: { anyOf: [{ type: "null" }, { type: "object", additionalProperties: false,
          properties: { type: { ...identifier, maxLength: 40 }, capacity: { type: "number", exclusiveMinimum: 0, maximum: 10000 }, initial: { type: "number", minimum: 0, maximum: 10000 } },
          required: ["type", "capacity", "initial"] }] },
      }, required: ["entityId", "carryable", "resource"],
    } },
    actions: { type: "array", minItems: 1, maxItems: 16, items: { anyOf: [
      { type: "object", additionalProperties: false, properties: { ...actionProperties, effects: {type:"array",maxItems:4,items:effectSchema}, kind: { const: "transfer" }, amount: { type: "number", exclusiveMinimum: 0, maximum: 10000 } }, required: [...Object.keys(actionProperties), "kind", "amount"] },
      { type: "object", additionalProperties: false, properties: { ...actionProperties, effects:{type:"array",minItems:1,maxItems:1,items:{anyOf:moveObjectSchemas}}, costs:costsSchema, kind:{const:"place"} }, required:[...Object.keys(actionProperties),"kind"] },
      { type: "object", additionalProperties: false, properties: { ...actionProperties, effects:{type:"array",minItems:1,maxItems:4,items:effectSchema}, costs:costsSchema, kind: { type: "string", enum: ["attach", "use", "operate"] } }, required: [...Object.keys(actionProperties), "kind"] },
    ] } },
  }, required: ["version", "objects", "actions"] },
] };

export const interactionInstructions = `Meaningful object interactions are supported through gameplay.interactions. Return null and requiredInteractionIds:[] when the person's intention is best served by traversal, collection or discovery. Otherwise design a coherent task using actual source objects: select an actual usable source then use it on a compatible visible target, or directly operate a visible control. Let the user take a role and make a useful change, rather than finding renamed coins. Prefer a coherent mission over an action count; never pad with arbitrary chores. Start with the creator’s requested final visible result and work backward through necessary preparation. For each proposed choice, compare which useful actions remain possible afterward: different labels, equal-cost supplies, or prescribed sequences ending alike provide route variety, not sustained strategic depth. When connected decisions are requested and pictured objects support them, let an early commitment change a later useful choice through current resources, consumed parts, readiness or physical capabilities. Preserve intentionally small requests; never add arbitrary prerequisites, unused resources, extra destinations or chores to manufacture depth. Design around changes in what the player can do: when the image supports preparation followed by a different result, let preparation unlock that result through requires or requiresResourceIds. Several identical transfers to independent recipients are one repeated mechanic, not an escalating sequence. Prefer a distinct supported consequence over more copies of that mechanic, but do not invent a consequence when the image has none. Every prerequisite must express a plausible reason the later action was unavailable; do not impose an arbitrary order on independent actions. A choice is meaningful when the selected supply, destination or order changes the route or visible outcome, rather than only changing an action label. Give the player an intelligible choice when the source allows one, such as compatible supplies serving different recipients; all successful allocations must remain valid. A resource-only task is appropriate when filling or balancing those actual recipients is itself the intended result. A visible movement payoff must move an actual independently separable object to an actual visible destination. Avoid arbitrary motion merely to decorate completion. Keep the creator's requested goal authoritative. For an ordinary photograph and a neutral request, use ordinary plausible object relationships; introduce fantasy only when the creator explicitly asks for it. A resource type must represent a plausible supply and receiver in this scene, not a metaphor invented to connect unrelated objects. Do not turn an arbitrary surface or personal item into a resource receiver just to add steps. Prefer fewer coherent actions over a larger absurd mission. Titles, instructions and action labels must describe visible runtime consequences; they cannot promise transformations the effects do not perform.
Runtime controls: players click a source object, then click its compatible target or choose an offered action. Placement animates to the authored destination. This runtime does not implement drag-and-drop placement; never tell players to drag, freely reposition or drop ingredients during play. Keyboard players use the object controls. The interactions object has version:1, objects and actions. Each object references an actual recognized source ID. Declare every action toolId and targetId in interactions.objects, including the player when an attachment targets it; a recognized source ID alone is not an interaction-object declaration. Use carryable:false and resource:null for an uncarried non-resource target. An object may declare layer:"surface" when its source-grounded role is deliberately beneath other arranged objects; ordinary objects use layer:"object" (the default). This controls visible layering, not physics or object identity. Use an explicit surface layer for an intended underlay, never infer it from object size or hide objects just to finish. Account for earlier placements on the same branch: two objects placed beside one target may overlap each other. Keep required and carryable objects visible; a later placement must not cover an earlier one unless the model explicitly places the underlay beneath it. Choose the source mode explicitly: carryable:true for a tool that should be physically lifted; for a resource-transfer source that stays fixed in the scene, use carryable:false and usableInPlace:true. The latter is supported only for decoration resource-transfer sources in movement:discover. Selecting it highlights the original source in place and transfers real game quantities; it does not extract or move its artwork. Choose from the source relationship and creator intent, never a category/name heuristic. A pictured plant or machine can supply an appropriate resource without lifting the whole object when that role is justified. usableInPlace cannot combine with carryable:true, act as an attach/place tool, or be moved by any moveObject effect. It may still receive resources or serve as the destination for another carried object. False carryable alone does not make an object selectable. Receivers and directly operated controllers need neither source mode. A resource object has {type,capacity,initial}; units are bounded game quantities, not a claim of real physics. A transfer changes resource quantities; it does NOT relocate the source artwork. Its label must describe that actual flow (fill, feed, charge, supply), never claim to place or arrange a physical object, repair machinery, or cook something. If the intended visible change is an object moving to a destination, use place instead of renaming a transfer. Transfer actions move amount from toolId to targetId: both must have the same resource type, source must contain enough, destination must have space. Resource types come from the scene/intent, such as water or charge; do not infer measurements from an image. Each action happens once. Use multiple transfer actions only for genuinely distinct steps. Depend on earlier action IDs in requires to make a causal sequence. Use requiresResourceIds:[receiverId] when an action must wait until those real resource receivers are filled to capacity, regardless of which compatible supply was used; return [] when no filled-resource prerequisite applies. This allows alternate resource allocations followed by one consequential invention or departure, without prescribing a particular transfer receipt. Resource prerequisites check current quantities, not whether the receiver was full earlier. A resource can be used by more than one task, but the entire required sequence must remain possible without free refills.
A non-transfer action may declare costs:[{entityId,amount}] to spend a positive quantity from an actual declared resource object once when its consequence occurs. Maximum8 distinct cost sources; amount cannot exceed capacity. Omit costs or return [] when the action is free. Transfer already spends its amount and must not declare costs. Costs require only the stated quantity, not a full receiver; add requiresResourceIds only when fullness is independently necessary. Readiness is checked before costs are spent. Completed effects remain earned after resources decrease, and the same action cannot be charged again. This supports limited supplies powering successive visible controls, meaningful budget tradeoffs and refilling a machine between distinct uses. Spend only a plausible resource from this actual scene; do not invent a tax or unrelated resource to manufacture difficulty. Every successful route must fit the actual initial budget plus explicit transfers. These are bounded game quantities, not continuous fuel use, new resource creation or real physics.\nplace means carrying and setting down the selected source object at a real visible destination. Use kind:"place", carryable:true for its tool object and exactly one effect {kind:"moveObject",entityId:toolId,destinationId:targetId,durationMs:900}. The target must be a different detected source object. This releases the held object there; it is not permanently attached and can be picked up again. Successive placements of the same object need an explicit requires sequence, and each destination must differ; alternative placements may instead belong to the same exclusive choice group. Use place for arranging actual pictured objects such as a chair by a table or a book at a shelf; do not call moving the chair itself a use action or mark a selectable object as noncarryable. The optional moveObject.destinationAlignment is "center" (default), "left", "right", "above" or "below". Center overlays the target's center; the other alignments place the complete object outside that target edge with an 8-pixel gap, centered on the other axis. Use left/right for "beside" and below for "below/under" in the image plane; choose the side with visible space. Labels and instructions must match the actual alignment: do not promise beside or below while returning center. Below does not tuck an object behind or underneath another layer. To place objects at different positions ON a sufficiently large visible surface, use destinationAnchor:{x,y} instead of destinationAlignment: x/y are fractions 0–1 of the available inset after subtracting the moved object size (0=left/top, 1=right/bottom, .5=center). The entire object must fit inside that destination; no resizing occurs. Never combine anchor and alignment. Different anchors can separate objects on one surface, but earlier placements must still remain visible. Keep original size: ensure the complete moved object fits inside the image and the actual scene, without overlap with unrelated objects. Out-of-bounds placements are rejected, never resized or clamped. It does not rotate, resize, reconstruct perspective, animate walking, or change the room's physical geometry.
operate directly activates an actual visible stationary controller, recognized in source objects as kind:"decoration" with targetId:null (never legacy kind:"lever", which opens a gate without these readiness rules): use kind:"operate", toolId===targetId for that controller, carryable:false, and at least one real supported effect. It needs no pickup, held tool, or usableInPlace flag. Existing requires and requiresResourceIds express causal readiness: preparation can make this control useful, then operating it causes the visible payoff. Do not add a redundant Start chore when an earlier action already produces the intended result. The control remains embedded in the original source image unless a moveObject effect actually moves it; operate may move itself or a different stationary object to a different visible destination. A usableInPlace resource source may also operate, but cannot itself move. Never relabel a transfer, arbitrary click, or unsupported transformation as operate.
attach/use/operate actions need a real supported effect: openGate removes an actual recognized gate obstruction in platform/roam mode; jumpBoost improves the moving player's jump in platform mode; moveSpeedBoost improves movement in roam/platform mode. For use/attach/operate, moveObject moves an independently extracted stationary decoration relative to a real visible destination, using the same optional destinationAlignment or destinationAnchor: {kind:"moveObject",entityId,destinationId,durationMs:900}. Both IDs must be detected source objects; list this separately triggered moved object in objects with carryable:false. A use/attach action cannot move its own carried tool; choose place when the tool itself is being relocated. This is a straight bounded animation, not navigation, walking, physics or vehicle simulation. Use only when that motion makes sense; do not move through scenery or imply wheels/limbs animate. It works in discover too. They cannot simulate cooking or change arbitrary artwork. Do not describe a capability those operations cannot deliver. No openGate, jumpBoost or moveSpeedBoost in discover: source-native pointer roleplay supports transfers, place, and use/attach/operate actions with moveObject. Transfer itself visibly changes a quantity and can fulfill an objective without an additional effect. Effects are optional only for transfer. Never use openGate as a cosmetic substitute for unrelated repairs.
When the source and intent support genuinely different physical outcomes, interactions.choiceGroups may contain {id,label,actionIds}, with 2–4 alternative action IDs per group and at most 8 groups. Each action may belong to only one group. Completing one member makes its siblings unavailable; Undo can restore the choice. Members must cause different source-object positions, attachments, opened paths or capabilities, not merely change wording or use an equivalent supply. Use only real compatible pictured targets; do not add a branch, arbitrary destination or extra chore merely to use this feature. An earned choice belongs in gameplay.requiredChoiceGroupIds: completing ANY member satisfies that requirement. Do not require the individual members in requiredInteractionIds; do not make members depend on one another. When the requested mission includes branch-specific follow-up work, put those final payoff actions in a separate terminal choice group, each requiring its matching earlier branch, and require that terminal group. Do not finish on the early choice alone when the promised arrangement or useful follow-up is still unfinished; both complete branches must remain valid ways to finish. Omit choiceGroups and requiredChoiceGroupIds when no meaningful alternative exists.
Optional completionPolicy is "protected" (default) or "retryable". Protected play prevents allocations that make the mission impossible. Use retryable only for a genuine finite-resource allocation puzzle with movement:discover: actual pictured supplies can serve different plausible pictured receivers, and allocation order or amount matters. A reachable decision must offer two currently legal actions spending the same finite supply on different consequences, through transfer or explicit costs; one leaves a completing route and another needs Undo. The player sees direct quantities and consequences, can try the allocation, and can recover through Undo. Every mission still needs a solution from its original supplies, and every offered exclusive choice member must still belong to some successful route. Never invent a drain, waste bin, arbitrary receiver, fake scarce resource, or deliberately impossible branch just to qualify; keep protected when the input/intent only supports arranging, discovery, traversal, or interchangeable successful actions. Do not use retryable for platform or roam plans.
For source-native roleplay, choose movement:discover, mode:creative, avatarId:null, objective:explore, clues:[] and obstacleIds:[]. Mark tools and targets as decoration (a genuinely opening barrier remains gate); preserve their source identity and positions. No invented finish marker is needed: requiredInteractionIds lists action IDs whose real successful execution completes the mission. For resource-routing puzzles offer every meaningful compatible source/receiver action, leave requiredInteractionIds empty unless a particular action is essential, and set gameplay.requiredResourceIds to receivers that must be filled to capacity. This allows different successful allocations. Never require all mutually exclusive alternative actions. Legacy goalRules arrays stay empty unless the user also explicitly asks for collection/activation. Use short player-facing object labels (Mug, Plant, Crystal), not long recognition descriptions. Keep action labels concise. Keep one concise mission title and an actionable first instruction, e.g. select the visible tool then its target. Object meaning may be creatively reassigned when explicitly requested by the user; this is a play rule, not visual evidence that the object has that real capability. If necessary objects are absent or the request needs unsupported mechanics, ask one focused clarification instead of silently replacing it with a hunt. Never invent detections or dispatch on file names.
Before returning JSON, check these invariants together: (1) Every operate action has the SAME visible controller in toolId and targetId; moved objects and destinations go in effects. (2) Every non-transfer action has an actual supported effect; no empty test/calibration/waste actions. (3) Every exclusive choice member can participate in a successful complete run; a possible allocation mistake is a separate legal action, not an impossible member of a required choice. Ordinary resource allocations should NOT be exclusive choice groups: the actual finite budget already controls what remains possible. Do not force an order between otherwise independent transfers. Reserve choice groups for genuinely mutually exclusive outcomes, not every decision the player makes. (4) Retryable requires a genuinely useful competing use of a finite supply that can leave too little for the goal. Never create purposeless waste just to force a mistake. If both allocations always finish, use protected. (5) Moving an object does NOT automatically move other objects placed on it. Every object that must change position needs its own explicit move effect and valid prerequisite sequence. Check that the actual requested cargo/subject reaches the destination, not only a carrier. (6) Required final actions/choices must earn the requested visible outcome, not merely preparation. Omit unused interaction objects and do not invent new detections to repair a failed plan.`;

export function readPlannedInteractions(value: unknown): PlannedInteractions | undefined {
  if (value === undefined || value === null) return undefined;
  const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
  const id = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z0-9_-]{1,60}$/.test(v) && !["__proto__", "prototype", "constructor"].includes(v);
  const problems: string[] = [];
  const referenceProblems: string[] = [];
  // Inspect only bounded transport arrays. Diagnostics are untrusted model data,
  // never a repaired plan, and the final message shares the correction limit.
  const note = (message: string) => { if (problems.length < 48) problems.push(message); };
  const reject = () => { throw new ModelPlanError(("The proposed object interactions were incomplete:\n" + problems.join("\n")).slice(0, MODEL_PLAN_DIAGNOSTIC_LIMIT)); };
  if (!record(value)) { note("gameplay.interactions must be an object with version:1, objects and actions, or null."); reject(); }
  const input = value as Record<string, unknown>;
  if (input.version !== 1) note("interactions.version must be 1.");
  if (input.completionPolicy !== undefined && (typeof input.completionPolicy !== "string" || !["protected", "retryable"].includes(input.completionPolicy))) note("interactions.completionPolicy must be protected or retryable.");
  if (!Array.isArray(input.objects) || input.objects.length < 1 || input.objects.length > 24) note("interactions.objects must contain 1–24 object declarations.");
  if (!Array.isArray(input.actions) || input.actions.length < 1 || input.actions.length > 16) note("interactions.actions must contain 1–16 actions.");
  const rawObjects: unknown[] = Array.isArray(input.objects) ? input.objects.slice(0, 24) : [];
  const rawActions: unknown[] = Array.isArray(input.actions) ? input.actions.slice(0, 16) : [];
  const objectIds = new Set(rawObjects.filter(record).map(object => object.entityId).filter(id));
  const actionIds = new Set(rawActions.filter(record).map(action => action.id).filter(id));
  const resourceIds = new Set(rawObjects.filter(record).filter(object => record(object.resource)).map(object => object.entityId).filter(id));
  for (const [index, object] of rawObjects.entries()) {
    const path = `interactions.objects[${index}]`;
    if (!record(object)) { note(`${path} must be an object declaration.`); continue; }
    if (!id(object.entityId)) note(`${path}.entityId needs a valid source ID (1–60 letters, digits, underscores or hyphens).`);
    for (const field of ["carryable", "usableInPlace"]) if (object[field] !== undefined && typeof object[field] !== "boolean") note(`${path}.${field} must be boolean.`);
    if (object.layer !== undefined && (typeof object.layer !== "string" || !["surface", "object"].includes(object.layer))) note(`${path}.layer must be surface or object.`);
    const resource = object.resource;
    if (resource != null && (!record(resource) || !id(resource.type) || resource.type.length > 40 ||
      typeof resource.capacity !== "number" || !Number.isFinite(resource.capacity) || resource.capacity <= 0 || resource.capacity > 10000 ||
      typeof resource.initial !== "number" || !Number.isFinite(resource.initial) || resource.initial < 0 || resource.initial > resource.capacity))
      note(`${path}.resource needs a type ID of at most 40 characters, capacity >0 and <=10000, and initial between 0 and capacity.`);
  }
  for (const [index, action] of rawActions.entries()) {
    if (!record(action)) { note(`interactions.actions[${index}] must be an action object.`); continue; }
    const name = id(action.id) ? `Action ${action.id}` : `interactions.actions[${index}]`;
    for (const field of ["id", "toolId", "targetId"]) if (!id(action[field])) note(`${name}.${field} needs a valid ID (1–60 letters, digits, underscores or hyphens).`);
    if (typeof action.label !== "string" || !action.label.trim() || action.label.length > 80) note(`${name}.label must contain 1–80 characters.`);
    if (typeof action.kind !== "string" || !["transfer", "attach", "use", "place", "operate"].includes(action.kind)) note(`${name}.kind must be transfer, attach, use, place or operate.`);
    for (const field of ["toolId", "targetId"]) if (id(action[field]) && !objectIds.has(action[field])) referenceProblems.push(`${name}.${field} references ${action[field]}, which must also be declared in interactions.objects using that source ID.`);
    for (const [field, limit, known] of [["requires", 16, actionIds], ["requiresResourceIds", 24, resourceIds]] as const) {
      const refs = action[field];
      if (refs === undefined) continue;
      if (!Array.isArray(refs) || refs.length > limit || refs.slice(0, limit).some(ref => !id(ref)) || new Set(refs.slice(0, limit)).size !== Math.min(refs.length, limit))
        note(`${name}.${field} must contain up to ${limit} distinct valid IDs.`);
      if (Array.isArray(refs)) for (const ref of refs.slice(0, limit)) if (id(ref) && (!known.has(ref) || (field === "requires" && ref === action.id)))
        note(`${name}.${field} references ${ref}; use ${field === "requires" ? "an existing different action ID" : "a declared resource object ID"}.`);
    }
    if (action.costs !== undefined) {
      if (action.kind === "transfer") note(`${name}.costs is not allowed on transfer; amount already spends its resource.`);
      if (!Array.isArray(action.costs) || action.costs.length > 8) note(`${name}.costs must contain up to 8 distinct resource costs.`);
      else {
        const seen = new Set<string>();
        for (const [costIndex, cost] of action.costs.entries()) {
          if (!record(cost) || !id(cost.entityId) || typeof cost.amount !== "number" || !Number.isFinite(cost.amount) || cost.amount <= 0 || cost.amount > 10000)
            note(`${name}.costs[${costIndex}] needs entityId and amount >0 and <=10000.`);
          else {
            if (seen.has(cost.entityId) || !resourceIds.has(cost.entityId)) note(`${name}.costs[${costIndex}].entityId must name a distinct declared resource object.`);
            seen.add(cost.entityId);
          }
        }
      }
    }
    if (action.kind === "transfer" && (typeof action.amount !== "number" || !Number.isFinite(action.amount) || action.amount <= 0 || action.amount > 10000)) note(`${name}.amount must be >0 and <=10000.`);
    const effects = action.effects;
    if (typeof action.kind === "string" && ["attach", "use", "place", "operate"].includes(action.kind) && (!Array.isArray(effects) || !effects.length))
      note(`${name} (${action.kind}) has no supported visible effect. Remove empty chores; keep actual source-supported consequences.`);
    if (action.kind === "operate" && id(action.toolId) && id(action.targetId) && action.toolId !== action.targetId)
      note(`${name} must operate its controller: toolId and targetId must both be ${action.toolId}. Put the moved object and destination in effects.`);
    if (action.kind !== "operate" && id(action.toolId) && action.toolId === action.targetId) referenceProblems.push(`${name} needs distinct toolId and targetId; only operate uses the same stationary controller.`);
    if (action.kind === "place" && (!Array.isArray(effects) || effects.length !== 1 || !record(effects[0]) || effects[0].kind !== "moveObject" || effects[0].entityId !== action.toolId || effects[0].destinationId !== action.targetId))
      note(`${name}: place requires exactly one moveObject effect with entityId=toolId and destinationId=targetId. It moves only the selected carried object, not a group; separate independently carried objects into separate place actions.`);
    if (effects !== undefined && (!Array.isArray(effects) || effects.length > 4)) note(`${name}.effects must be an array of at most 4 supported effects.`);
    if (Array.isArray(effects)) for (const [effectIndex, effect] of effects.slice(0, 4).entries()) {
      const path = `${name}.effects[${effectIndex}]`;
      if (!record(effect)) { note(`${path} must be a supported effect object.`); continue; }
      if (effect.kind === "openGate") {
        if (!id(effect.entityId)) note(`${path}.entityId must name the actual source gate.`);
      } else if (effect.kind === "moveObject") {
        if (!id(effect.entityId)) note(`${path}.entityId must name a source declared in interactions.objects.`);
        else if (!objectIds.has(effect.entityId)) referenceProblems.push(`${path}.entityId references ${effect.entityId}, which must be declared in interactions.objects.`);
        if (!id(effect.destinationId)) note(`${path}.destinationId must name the actual visible destination source.`);
        if (effect.destinationAlignment !== undefined && !destinationAlignments.includes(effect.destinationAlignment as DestinationAlignment)) note(`${path}.destinationAlignment must be center, left, right, above or below.`);
        if (effect.destinationAnchor !== undefined && !validDestinationAnchor(effect.destinationAnchor)) note(`${path}.destinationAnchor must contain only x/y finite fractions from 0 to 1.`);
        if (effect.destinationAnchor !== undefined && effect.destinationAlignment !== undefined) note(`${path} cannot combine destinationAnchor with destinationAlignment; choose one positioning method.`);
        if (effect.durationMs !== undefined && (typeof effect.durationMs !== "number" || !Number.isFinite(effect.durationMs) || effect.durationMs < 150 || effect.durationMs > 4000)) note(`${path}.durationMs must be between 150 and 4000.`);
      } else if (typeof effect.kind === "string" && ["jumpBoost", "moveSpeedBoost"].includes(effect.kind)) {
        if (typeof effect.multiplier !== "number" || !Number.isFinite(effect.multiplier) || effect.multiplier <= 1 || effect.multiplier > 2) note(`${path}.multiplier must be >1 and <=2.`);
      } else note(`${path}.kind must be moveObject, openGate, jumpBoost or moveSpeedBoost.`);
    }
  }
  const choiceGroups = input.choiceGroups;
  if (choiceGroups !== undefined) {
    if (!Array.isArray(choiceGroups) || choiceGroups.length > 8) note("interactions.choiceGroups must contain at most 8 groups.");
    if (Array.isArray(choiceGroups)) {
      const groups = new Set<string>(), members = new Set<string>();
      for (const [index, group] of choiceGroups.slice(0, 8).entries()) {
        const path = `interactions.choiceGroups[${index}]`;
        if (!record(group)) { note(`${path} must be a choice group object.`); continue; }
        if (!id(group.id) || groups.has(group.id)) note(`${path}.id must be a distinct valid group ID.`);
        if (id(group.id)) groups.add(group.id);
        if (typeof group.label !== "string" || !group.label.trim() || group.label.length > 80) note(`${path}.label must contain 1–80 characters.`);
        if (!Array.isArray(group.actionIds) || group.actionIds.length < 2 || group.actionIds.length > 4) note(`${path}.actionIds needs 2–4 distinct existing action IDs.`);
        if (Array.isArray(group.actionIds)) for (const member of group.actionIds.slice(0, 4)) {
          if (!id(member) || !actionIds.has(member) || members.has(member)) note(`${path}.actionIds must use existing actions, each in only one group and listed once.`);
          if (id(member)) members.add(member);
        }
      }
    }
  }
  // Leave semantic-only failures to source preflight, which can also name
  // source-role errors. Include known reference failures when structure is bad.
  if (problems.length) { for (const diagnostic of referenceProblems) note(diagnostic); reject(); }
  // Only structurally safe arrays reach normalization and semantic diagnostics.
  const typed = value as PlannedInteractions;
  const objects = typed.objects.map(object => ({ entityId:object.entityId, carryable: Boolean(object.carryable), ...(object.usableInPlace !== undefined ? {usableInPlace:object.usableInPlace} : {}), ...(object.layer ? {layer:object.layer} : {}), ...(object.resource ? {resource:{...object.resource,type:object.resource.type.trim()}} : {}) }));
  // Null is the model's explicit no-resource value; runtime uses absence.
  for (const object of objects) if (object.resource == null) delete object.resource;
  const actions = typed.actions.map(action => ({ ...action, label: action.label.trim(), requires: [...(action.requires ?? [])], ...(action.requiresResourceIds?.length ? {requiresResourceIds:[...action.requiresResourceIds]} : {}), ...(action.costs ? {costs:action.costs.map(cost=>({...cost}))} : {}), effects: [...(action.effects ?? [])] } as InteractionAction));
  const duplicateObjects = objects.map(object=>object.entityId).filter((entityId,index,ids)=>ids.indexOf(entityId)!==index);
  const duplicateActions = actions.map(action=>action.id).filter((actionId,index,ids)=>ids.indexOf(actionId)!==index);
  if (duplicateObjects.length) note(`Duplicate interaction object IDs: ${[...new Set(duplicateObjects)].join(", ")}. Declare each source once.`);
  if (duplicateActions.length) note(`Duplicate action IDs: ${[...new Set(duplicateActions)].join(", ")}. Every action needs a unique ID.`);
  if (problems.length) { for (const diagnostic of plannedInteractionDiagnostics({version:1,objects,actions})) note(diagnostic); reject(); }
  return { version: 1, objects, actions, ...(typed.completionPolicy?{completionPolicy:typed.completionPolicy}:{}), ...(typed.choiceGroups !== undefined ? {choiceGroups: typed.choiceGroups.map(group => ({id:group.id,label:group.label.trim(),actionIds:[...group.actionIds]}))} : {}) };
}

/** Independent transport diagnostics only. These never rewrite a proposed plan
 * or grant a result; the full compiler and runtime validators remain required. */
export function plannedInteractionDiagnostics(plan: PlannedInteractions, requiredResourceIds: string[] = []): string[] {
  const diagnostics:string[]=[], objects=new Map(plan.objects.map(object=>[object.entityId,object]));
  for(const toolId of new Set(plan.actions.filter(action=>action.kind!=="operate").map(action=>action.toolId)))if(!objects.get(toolId)?.carryable&&!objects.get(toolId)?.usableInPlace)
    diagnostics.push(`Interaction tool ${toolId} must be a carried source: set carryable:true for a lifted tool, or explicitly set usableInPlace:true with carryable:false for a fixed discover resource-transfer source.`);
  for(const action of plan.actions){
    for(const id of new Set([action.toolId,action.targetId,...(action.requiresResourceIds??[]),...(action.costs??[]).map(cost=>cost.entityId)]))
      if(!objects.has(id))diagnostics.push(`Action ${action.id} references ${id}, which must also be declared in interactions.objects using that existing source ID. Include the player when it receives an attachment; do not invent a new source object.`);
  }
  for(const action of plan.actions.filter(action=>action.kind==="operate")){
    if(action.toolId!==action.targetId)diagnostics.push(`Action ${action.id} must operate the same visible controller in toolId and targetId.`);
    if(objects.get(action.toolId)?.carryable)diagnostics.push(`Action ${action.id} operates a stationary controller; set carryable:false for ${action.toolId}.`);
  }
  for(const action of plan.actions)for(const cost of action.costs??[]){
    const resource=objects.get(cost.entityId)?.resource;
    if(!resource)diagnostics.push(`Action ${action.id} cost ${cost.entityId} must refer to a declared resource object.`);
    else if(cost.amount>resource.capacity)diagnostics.push(`Action ${action.id} cost ${cost.amount} exceeds ${cost.entityId} capacity ${resource.capacity}.`);
  }
  const transfers=plan.actions.filter(action=>action.kind==="transfer");
  for(const action of transfers){
    const source=objects.get(action.toolId)?.resource,target=objects.get(action.targetId)?.resource;
    if(!source||!target||source.type!==target.type)diagnostics.push(`Action ${action.id} needs source and receiver resources of the same type.`);
    else if(action.amount>target.capacity)diagnostics.push(`Action ${action.id} amount ${action.amount} exceeds receiver ${action.targetId} capacity ${target.capacity}.`);
  }
  if(requiredResourceIds.length>24||requiredResourceIds.some(id=>typeof id!=="string"))return diagnostics;
  const goals=[...new Set(requiredResourceIds)].map(id=>objects.get(id));
  if(goals.some(object=>!object?.resource))diagnostics.push("gameplay.requiredResourceIds must reference declared resource objects.");
  // A necessary upper bound for direct supply→receiver networks. If supplies
  // themselves can be refilled or goals transfer onward, defer to the full
  // state search rather than claiming an unsound arithmetic impossibility.
  const validGoals=goals.filter(object=>object?.resource);
  // Creator-reviewed plans allow more actions than the model transport. Bound
  // diagnostic work independently; exhaustion must defer to full validation.
  let subsetWork=0;
  for(const type of new Set(validGoals.map(object=>object!.resource!.type))){
    const targets=validGoals.filter(object=>object!.resource!.type===type);
    const targetIds=new Set(targets.map(object=>object!.entityId));
    const relevant=transfers.filter(action=>targetIds.has(action.targetId));
    const sourceIds=new Set(relevant.map(action=>action.toolId));
    if(transfers.some(action=>sourceIds.has(action.targetId)||targetIds.has(action.toolId)))continue;
    let maximum=0,bounded=false;
    const supplies:string[]=[];
    for(const sourceId of sourceIds){
      const resource=objects.get(sourceId)?.resource;
      if(!resource||resource.type!==type)continue;
      let sums=new Set([0]);
      for(const action of relevant.filter(action=>action.toolId===sourceId)){
        const next=new Set(sums);
        for(const sum of sums){
          if(++subsetWork>65_536){bounded=true;break;}
          if(sum+action.amount<=resource.initial+1e-9*Math.max(1,resource.initial))next.add(sum+action.amount);
          if(next.size>32_768){bounded=true;break;}
        }
        if(bounded)break;
        sums=next;
      }
      if(bounded)break;
      let usable=0;for(const sum of sums)usable=Math.max(usable,sum);maximum+=usable;
      supplies.push(`${sourceId}: at most ${usable} of ${resource.initial}`);
    }
    if(bounded)continue;
    const needed=targets.reduce((sum,object)=>sum+object!.resource!.capacity-object!.resource!.initial,0);
    if(maximum+1e-9*Math.max(1,needed)<needed)
      diagnostics.push(`Resource tasks cannot all finish: required receivers need ${needed} more ${type}, but the one-time transfer amounts can deliver at most ${maximum} (${supplies.join("; ")}). Adjust amounts/routes or supplies coherently; equal total stock and demand does not guarantee a usable allocation.`);
  }
  return diagnostics;
}

/** Check only semantic declarations before paid source-boundary refinement or
 * artwork extraction. Actual bounds, motion destinations and physical routes
 * remain authoritative in the later compiler; source roles are never rewritten. */
export function validatePlannedInteractionSources(interactions: PlannedInteractions | undefined, sources: ReadonlyArray<Pick<WorldEntity,"id"|"kind">>, movement: "platform"|"roam"|"discover" = "platform"): void {
  if(!interactions)return;
  const entities=new Map(sources.map(source=>[source.id,source]));
  const diagnostics=plannedInteractionDiagnostics(interactions);
  for(const object of interactions.objects)if(!entities.has(object.entityId))
    diagnostics.push(`Interaction object ${object.entityId} lost its original source object. Use an existing recognized source ID; do not invent a substitute.`);
  for(const object of interactions.objects){
    const role=entities.get(object.entityId)?.kind;
    if(object.carryable&&role!=="decoration")diagnostics.push(`Carried source ${object.entityId} must have source kind:"decoration".`);
    if(!object.usableInPlace)continue;
    if(movement!=="discover")diagnostics.push(`Source ${object.entityId} uses usableInPlace:true, which requires movement:"discover". A platform or roam transfer tool must be explicitly carryable:true without usableInPlace; do not silently change the requested movement.`);
    if(object.carryable||role!=="decoration"||!object.resource)diagnostics.push(`Fixed source ${object.entityId} must declare carryable:false, a real resource, and source kind:"decoration".`);
    if(!interactions.actions.some(action=>action.kind==="transfer"&&action.toolId===object.entityId))diagnostics.push(`Fixed source ${object.entityId} needs an outgoing transfer action; receivers and direct-operation-only controllers do not need usableInPlace.`);
    if(interactions.actions.some(action=>action.toolId===object.entityId&&!["transfer","operate"].includes(action.kind)))diagnostics.push(`Fixed source ${object.entityId} cannot serve as an attach/place/use tool; it can only transfer or directly operate.`);
    if(interactions.actions.some(action=>action.effects?.some(effect=>effect.kind==="moveObject"&&effect.entityId===object.entityId)))diagnostics.push(`Fixed source ${object.entityId} cannot be moved by any moveObject effect.`);
  }
  for(const action of interactions.actions){
    for(const id of new Set([action.toolId,action.targetId]))if(!entities.has(id))diagnostics.push(`Action ${action.id} lost its original source object ${id}; use an existing recognized source ID.`);
    if(action.kind==="operate"&&entities.get(action.toolId)?.kind!=="decoration")
      diagnostics.push(`Action ${action.id}: controller ${action.toolId} must have source kind:"decoration" and targetId:null. A legacy lever activates independently and cannot enforce operation readiness.`);
    for(const effect of action.effects??[]){
      if(effect.kind==="openGate"&&entities.get(effect.entityId)?.kind!=="gate")
        diagnostics.push(`Action ${action.id} must open an actual recognized gate: ${effect.entityId} is not a gate source.`);
      if(effect.kind==="moveObject"){
        if(effect.entityId===action.toolId&&action.kind!=="place"&&action.kind!=="operate")diagnostics.push(`Action ${action.id}: ${action.toolId} is its own carried tool; moving it requires kind:"place". A use/attach action must move a different stationary prop.`);
        if(entities.get(effect.entityId)?.kind!=="decoration")diagnostics.push(`Action ${action.id} must move an actual decoration source: ${effect.entityId} is not one.`);
        const destination=(effect as DestinationEffect).destinationId;
        if(destination&&!entities.has(destination))diagnostics.push(`Action ${action.id} destination ${destination} is not an actual recognized source object.`);
      }
    }
  }
  if(diagnostics.length)throw new ModelPlanError(diagnostics.join("\n").slice(0,MODEL_PLAN_DIAGNOSTIC_LIMIT));
}

/** Attach only after layout compilation so missing or substituted source IDs
 * cannot make a plausible-looking but nonfunctional game escape validation. */
export function applyPlannedInteractions(world: WorldDefinition, interactions: PlannedInteractions | undefined, requiredIds: string[] = [], allowUnpreparedArtwork = false, options: { validateGeneratedChoices?: boolean } = {}): WorldDefinition {
  if (!interactions) {
    if (requiredIds.length || world.goalRules?.requiredChoiceGroupIds?.length) throw new ModelPlanError("Required actions or choices were returned without their object interactions. Try interpreting the same image again.");
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
  for(const toolId of new Set(interactions.actions.filter(action=>action.kind!=="operate").map(action=>action.toolId)))
    if(!objects.get(toolId)?.carryable&&!objects.get(toolId)?.usableInPlace)
      diagnostics.add(`${label(toolId)} (${toolId}) must be a carried source: set carryable:true for a lifted tool, or explicitly set usableInPlace:true with carryable:false for a fixed discover resource-transfer source.`);
  for (const action of interactions.actions) {
    const prefix = `Action ${action.id}: `;
    if (action.kind === "operate" && entities.get(action.toolId)?.kind !== "decoration")
      diagnostics.add(`${prefix}${label(action.toolId)} must have source kind:"decoration" and targetId:null for direct operation. A legacy lever opens its gate independently and cannot enforce this action's readiness rules.`);
    if (action.kind === "operate" && action.toolId !== action.targetId)
      diagnostics.add(`${prefix}Operating a visible control requires toolId and targetId to be that same stationary controller.`);
    if (action.kind !== "operate" && action.toolId === action.targetId)
      diagnostics.add(`${prefix}${label(action.toolId)} needs a distinct target. toolId and targetId cannot reference the same object.`);
    for (const effect of action.effects ?? []) {
      if (effect.kind !== "moveObject") continue;
      if (effect.entityId === action.toolId && action.kind !== "place" && action.kind !== "operate")
        diagnostics.add(`${prefix}${label(action.toolId)} is its own carried tool; moving it requires kind:"place". A use/attach action must move a different stationary prop.`);
      const destinationId = (effect as DestinationEffect).destinationId;
      if (!destinationId) continue;
      const moved = entities.get(effect.entityId), destination = entities.get(destinationId);
      if (!moved || !destination || moved.id === destination.id) {
        diagnostics.add(`${prefix}Moving ${label(effect.entityId)} needs a different visible destination; ${destinationId} is not valid for it.`);
        continue;
      }
      let point:{x:number;y:number};
      try { point=destinationPoint(moved,destination,(effect as DestinationEffect).destinationAlignment,(effect as DestinationEffect).destinationAnchor); }
      catch(error) { if (!(error instanceof ModelPlanError)) throw error; diagnostics.add(`${prefix}${error.message}`); continue; }
      const {x,y}=point;
      if (x < 0 || y < 0 || x + moved.width > world.width || y + moved.height > world.height) {
        const fitting=destinationAlignments.filter(alignment=>{const point=destinationPoint(moved,destination,alignment);return point.x>=0&&point.y>=0&&point.x+moved.width<=world.width&&point.y+moved.height<=world.height;});
        diagnostics.add(`${prefix}${label(moved.id)} cannot fit ${destinationPhrase((effect as DestinationEffect).destinationAlignment,(effect as DestinationEffect).destinationAnchor)} ${label(destination.id)} without leaving the image. ${fitting.length ? `destinationAlignment values that fit these actual image bounds: ${fitting.join(", ")}. Choose a source-consistent option and update its label; this list does not guarantee other objects remain visible.` : "No supported alignment fits this destination. Choose another actual visible destination."} Use a more central visible destination if needed; correct a source selection only if its detected bounds are wrong. The object has not been resized or moved elsewhere.`);
      }
    }
  }
  for(const diagnostic of plannedInteractionDiagnostics(interactions,world.goalRules?.requiredResourceIds??[]))
    if(!diagnostic.startsWith("Interaction tool "))diagnostics.add(diagnostic);
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
    const {x,y} = destinationPoint(moved,destination,(effect as DestinationEffect).destinationAlignment,(effect as DestinationEffect).destinationAnchor);
    if (x < 0 || y < 0 || x + moved.width > world.width || y + moved.height > world.height)
      throw new ModelPlanError(`${moved.label || "The selected object"} cannot fit ${destinationPhrase((effect as DestinationEffect).destinationAlignment,(effect as DestinationEffect).destinationAnchor)} ${destination.label || "that destination"} without leaving the image. Choose a more central visible destination or correct its source selection. The object has not been resized or moved elsewhere.`.slice(0, 500));
    return { kind:"moveObject" as const, entityId:effect.entityId, x, y, ...(effect.durationMs ? {durationMs:effect.durationMs} : {}) };
  })})) };
  const candidate: WorldDefinition = { ...world, interactions:compiled, goalRules: { requiredCollectedIds: [], requiredActivatedIds: [], ...world.goalRules, requiredInteractionIds: requiredIds } };
  try {
    validateInteractions(candidate, {allowUnpreparedArtwork});
    // Generated alternatives must all be real options. Artwork-only rebuilds
    // retain the creator's explicitly selected branch and requirements.
    if (options.validateGeneratedChoices !== false) {
      validateInteractionChoiceOutcomes(candidate);
      validateGeneratedRetryablePlan(candidate);
    }
  }
  catch (error) { throw new ModelPlanError(error instanceof Error ? error.message : "The object interactions could not be validated."); }
  return candidate;
}
