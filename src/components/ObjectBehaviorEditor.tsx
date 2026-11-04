import { useEffect, useRef, useState } from "react";
import { validateInteractions, type InteractionAction, type InteractionPlan } from "../../shared/interactions";
import type { GoalRules, WorldDefinition, WorldEntity } from "../../shared/world";
import { isSourceAlignedScenery, isSourceBackdrop } from "../../shared/source-scenery";
import { movementMode } from "../../shared/world";
import "./object-behavior-editor.css";
import {withActionCosts, type ActionCosts} from "../lib/action-cost-authoring";

interface AbilityDraft {
  targetId: string; behavior: string; label: string; resourceType: string;
  amount: number; supply: number; capacity: number; useInPlace?: boolean;
  costs?: ActionCosts; destination?: {x:number;y:number}; prerequisites: string[]; resourcePrerequisites?: string[]; alternativeTo?: string; dirty: boolean;
}
const abilityDrafts = new Map<string, AbilityDraft>();
export function clearObjectAbilityDrafts(worldId: string, revision: number) {
  const prefix = `${worldId}:${revision}:`;
  for (const key of abilityDrafts.keys()) if (key.startsWith(prefix)) abilityDrafts.delete(key);
}
export function pendingObjectAbilities(worldId: string, revision: number) {
  const prefix = `${worldId}:${revision}:`;
  return [...abilityDrafts].filter(([key, value]) => key.startsWith(prefix) && value.dirty).map(([key]) => key.slice(prefix.length));
}
export function removeObjectAbilityDraft(worldId: string, revision: number, objectId: string) {
  abilityDrafts.delete(`${worldId}:${revision}:${objectId}`);
}

/** Author executable object relationships; no source names select mechanics. */
export function ObjectBehaviorEditor({ world, item, plan, onChange, onDraw, onPickDestination, onCancelDestination, onDraftChange }: {
  world: WorldDefinition; item: WorldEntity; plan?: InteractionPlan;
  onChange: (plan: InteractionPlan | undefined, requirements?: Pick<GoalRules, "requiredInteractionIds" | "requiredChoiceGroupIds">) => void;
  onDraw?: () => void;
  onCancelDestination?: () => void;
  onDraftChange?: (dirty: boolean) => void;
  onPickDestination?: (target: WorldEntity, choose: (point: {x: number; y: number}) => void) => void;
}) {
  const cacheKey = `${world.id}:${world.revision}:${item.id}`;
  const draft = abilityDrafts.get(cacheKey);
  const [targetId, setTargetId] = useState(draft?.targetId ?? "");
  const [label, setLabel] = useState(draft?.label ?? "");
  const [resourceType, setResourceType] = useState(() => draft?.resourceType ?? plan?.objects.find(object => object.entityId === item.id)?.resource?.type ?? "energy");
  const [amount, setAmount] = useState(draft?.amount ?? 1);
  const [supply, setSupply] = useState(draft?.supply ?? 1);
  const [capacity, setCapacity] = useState(draft?.capacity ?? 1);
  const canCarry = !item.artSource || !world.entities.some(isSourceBackdrop) || Boolean(item.sourceLayer && item.art);
  const existingSource = plan?.objects.find(object => object.entityId === item.id);
  const hasOperation = Boolean(plan?.actions.some(action => action.toolId === item.id && action.kind === "operate"));
  const defaultBehavior = movementMode(world) !== "discover" && (!canCarry || hasOperation) ? "" : "transfer";
  const [behavior, setBehavior] = useState(draft?.behavior ?? defaultBehavior);
  const initialUseInPlace = existingSource?.usableInPlace ?? (hasOperation || !canCarry);
  const [useInPlace, setUseInPlace] = useState(draft?.useInPlace ?? initialUseInPlace);
  const [destination, setDestination] = useState<{x: number; y: number} | undefined>(draft?.destination);
  const [prerequisites, setPrerequisites] = useState<string[]>(draft?.prerequisites ?? []);
  const [resourcePrerequisites, setResourcePrerequisites] = useState<string[]>(draft?.resourcePrerequisites ?? []);
  const [alternativeTo, setAlternativeTo] = useState(draft?.alternativeTo ?? "");
  const [costs, setCosts] = useState<ActionCosts>(draft?.costs ?? []);
  const originalResource = plan?.objects.find(object => object.entityId === item.id)?.resource?.type ?? "energy";
  const dirty = Boolean((!plan?.actions.some(action => action.toolId === item.id) && useInPlace !== initialUseInPlace) || costs.length || alternativeTo || targetId || label.trim() || destination || prerequisites.length || resourcePrerequisites.length || behavior !== defaultBehavior || resourceType !== originalResource || amount !== 1 || supply !== 1 || capacity !== 1);
  useEffect(() => {
    abilityDrafts.set(cacheKey, {targetId, behavior, label, resourceType, amount, supply, capacity, destination, prerequisites, resourcePrerequisites, alternativeTo, costs, useInPlace, dirty});
    const prefix = `${world.id}:${world.revision}:`;
    onDraftChange?.([...abilityDrafts].some(([key, value]) => key.startsWith(prefix) && value.dirty));
  }, [cacheKey, targetId, behavior, label, resourceType, amount, supply, capacity, destination, prerequisites, resourcePrerequisites, alternativeTo, costs, useInPlace, dirty, onDraftChange, world.id, world.revision]);
  const operates = behavior.startsWith("operate-");
  const effectBehavior = operates ? behavior.slice(8) : behavior;
  const movesObject = effectBehavior === "move" || effectBehavior === "attach-move";
  const [error, setError] = useState("");
  const newAbilityForm = useRef<HTMLDetailsElement>(null);
  function cancelAbilityDraft() {
    onCancelDestination?.();
    setTargetId(""); setBehavior(defaultBehavior); setLabel(""); setResourceType(originalResource);
    setUseInPlace(initialUseInPlace); setCosts([]); setAmount(1); setSupply(1); setCapacity(1);
    setPrerequisites([]); setResourcePrerequisites([]); setAlternativeTo(""); setDestination(undefined); setError("");
    requestAnimationFrame(() => newAbilityForm.current?.querySelector("summary")?.focus());
  }
  const sourceResource = plan?.objects.find(object => object.entityId === item.id)?.resource;
  const targetResource = plan?.objects.find(object => object.entityId === targetId)?.resource;
  const actions = plan?.actions.filter(a => a.toolId === item.id) ?? [];
  const mode = movementMode(world);
  if (item.kind !== "decoration") return null;
  // Stationary sources can use embedded art without moving it out of the scene.
  const embeddedArtwork = Boolean(item.artSource) && world.entities.some(entity => isSourceBackdrop(entity) && Boolean(entity.art));
  if (!item.art && !embeddedArtwork) return onDraw ? <button className="secondary-button" onClick={onDraw}>Draw this object</button> : null;
  const openingTargets = world.entities.filter(e => e.kind === "gate" && (!e.artSource || Boolean(e.sourceLayer) || (world.entities.some(isSourceAlignedScenery) && Boolean(e.art))));
  const movingTargets = world.entities.filter(e => e.kind === "decoration" && e.art && (!e.artSource || e.sourceLayer) && !isSourceBackdrop(e) && !plan?.objects.some(o => o.entityId === e.id && (o.carryable || o.usableInPlace)));
  const targets = world.entities.filter(e => (e.id !== item.id || operates && movesObject) &&
    (behavior === "place" ? !isSourceBackdrop(e) : movesObject ? movingTargets.some(target => target.id === e.id) : effectBehavior === "open" ? openingTargets.some(gate => gate.id === e.id) : effectBehavior === "jump" || effectBehavior === "speed" ? e.kind === "player" : !isSourceBackdrop(e) && e.kind !== "terrain" && e.kind !== "bridge"));
  function addAction() {
    if (!behavior) { setError("Choose an ability for this object."); return; }
    if (!targets.some(e => e.id === targetId)) { setError("Choose what your object works with."); return; }
    if (movesObject && !destination) { setError("Choose where the object should go on the scene."); return; }
    if (!label.trim()) { setError("Name the action players will take."); return; }
    if (behavior === "transfer" && (!/^[\w-]{1,60}$/.test(resourceType) || !Number.isFinite(amount) || amount <= 0 || amount > 10000)) {
      setError("Choose a resource name and an amount between 1 and 10,000."); return;
    }
    if (!alternativeTo && (behavior === "jump" || behavior === "speed" || behavior === "attach-move") && actions.some(a => a.kind === "attach")) {
      setError("This part already has an attachment. Draw another part for a new ability."); return;
    }
    const placementTarget = targets.find(entity => entity.id === targetId)!;
    const placement = {
      x: placementTarget.x + (placementTarget.width - item.width) / 2,
      y: placementTarget.y + (placementTarget.height - item.height) / 2,
    };
    if (behavior === "place" && (placement.x < 0 || placement.y < 0 || placement.x + item.width > world.width || placement.y + item.height > world.height)) {
      setError("This object would extend beyond the scene. Choose another target."); return;
    }
    const next: InteractionPlan = structuredClone(plan ?? { version: 1, objects: [], actions: [] });
    const source = next.objects.find(o => o.entityId === item.id) ?? { entityId: item.id };
    const target = next.objects.find(o => o.entityId === targetId) ?? { entityId: targetId };
    const stationary = Boolean(source.usableInPlace) || behavior === "transfer" && (hasOperation || (!actions.length && useInPlace));
    if (operates) {
      if (source.carryable) { setError("This object is carried. Direct operation needs an object that stays in the scene."); return; }
    } else {
      if (hasOperation && (behavior !== "transfer" || mode !== "discover")) { setError("This controller stays in place. Add another operation, or a resource transfer used in place in a discovery game."); return; }
      if (stationary && behavior !== "transfer") { setError("This source stays in place. Choose an operation or Transfer a resource."); return; }
      if (stationary) { source.usableInPlace = true; delete source.carryable; }
      else { source.carryable = true; delete source.usableInPlace; }
      if (!stationary && !canCarry) { setError("This artwork stays in the scene. Choose an operation or a transfer used in place."); return; }
    }
    if (behavior === "transfer") {
      if ([source, target].some(o => o.resource && o.resource.type !== resourceType)) {
        setError("These objects already hold a different resource. Use the same resource name."); return;
      }
      if ((!source.resource && (!Number.isFinite(supply) || supply < amount || supply > 10000)) ||
          (!target.resource && (!Number.isFinite(capacity) || capacity < amount || capacity > 10000))) {
        setError("Supply and capacity must cover this transfer and stay within 10,000."); return;
      }
      source.resource ??= { type: resourceType, capacity: supply, initial: supply };
      target.resource ??= { type: resourceType, capacity, initial: 0 };
      if (source.resource.capacity < amount || target.resource.capacity < amount) {
        setError("The amount exceeds this object's existing capacity."); return;
      }
    }
    if (!next.objects.some(o => o.entityId === source.entityId)) next.objects.push(source);
    if (!next.objects.some(o => o.entityId === target.entityId)) next.objects.push(target);
    const base = { ...(behavior !== "transfer" && costs.length ? {costs: structuredClone(costs)} : {}), id: `action-${crypto.randomUUID()}`, label: label.trim(), toolId: item.id, targetId: operates ? item.id : targetId, ...(prerequisites.length ? {requires: prerequisites.filter(id => next.actions.some(action => action.id === id))} : {}), ...(resourcePrerequisites.length ? {requiresResourceIds:resourcePrerequisites.filter(id=>next.objects.some(object=>object.entityId===id && object.resource))} : {}) };
    const action: InteractionAction = behavior === "transfer" ? { ...base, kind: "transfer", amount } :
      behavior === "place" ? { ...base, kind: "place", effects: [{kind: "moveObject", entityId: item.id, ...placement, durationMs: 900}] } :
      movesObject ? { ...base, kind: operates ? "operate" : behavior === "attach-move" ? "attach" : "use", effects: [{ kind: "moveObject", entityId: targetId, x: destination!.x, y: destination!.y, durationMs: 1600 }] } :
      effectBehavior === "open" ? { ...base, kind: operates ? "operate" : "use", effects: [{ kind: "openGate", entityId: targetId }] } :
      { ...base, kind: operates ? "operate" : "attach", effects: [{ kind: effectBehavior === "jump" ? "jumpBoost" : "moveSpeedBoost", multiplier: 1.5 }] };
    next.actions.push(action);
    let requirements: Pick<GoalRules, "requiredInteractionIds" | "requiredChoiceGroupIds"> | undefined;
    if (alternativeTo) {
      const groups = next.choiceGroups ?? [];
      const existingGroup = alternativeTo.startsWith("group:") ? groups.find(group => group.id === alternativeTo.slice(6)) : undefined;
      const previousAction = alternativeTo.startsWith("action:") ? next.actions.find(candidate => candidate.id === alternativeTo.slice(7)) : undefined;
      if ((!existingGroup && !previousAction) || (previousAction && groups.some(group => group.actionIds.includes(previousAction.id)))) {
        setError("This alternative has changed. Choose an existing ability or choice again."); return;
      }
      if (existingGroup && existingGroup.actionIds.length >= 4) { setError("This choice already has four abilities."); return; }
      if (!existingGroup && groups.length >= 8) { setError("This world already has eight choices. Add to an existing choice instead."); return; }
      const group = existingGroup ? {...existingGroup, actionIds: [...existingGroup.actionIds, action.id]} : {
        id: `choice-${crypto.randomUUID()}`,
        label: `Choose ${behavior === "place" ? "a destination" : "an ability"} for ${item.label || "this object"}`.slice(0, 80),
        actionIds: [previousAction!.id, action.id],
      };
      next.choiceGroups = existingGroup ? groups.map(candidate => candidate.id === group.id ? group : candidate) : [...groups, group];
      const requiredActions = world.goalRules?.requiredInteractionIds ?? [];
      const requiredGroups = world.goalRules?.requiredChoiceGroupIds ?? [];
      requirements = {
        requiredInteractionIds: requiredActions.filter(id => !group.actionIds.includes(id)),
        requiredChoiceGroupIds: requiredActions.some(id => group.actionIds.includes(id))
          ? [...new Set([...requiredGroups, group.id])] : [...requiredGroups],
      };
    }
    {
      try { validateInteractions({...world, interactions: next, goalRules: {
        ...(world.goalRules ?? {requiredCollectedIds: [], requiredActivatedIds: []}), ...requirements,
      }}); }
      catch (cause) {
        const message = cause instanceof Error ? cause.message : "Check this placement and its requirements.";
        setError(message.includes("incompatible choices")
          ? "These requirements need two options from the same choice. Remove the conflicting action requirement."
          : message.includes("explicit prerequisite sequence")
            ? "Choose an earlier placement under Requirements, or make this an alternative."
            : message);
        return;
      }
    }
    onChange(next, requirements);
    setAlternativeTo("");
    setTargetId(""); setBehavior(mode !== "discover" && (!canCarry || hasOperation || operates) ? "" : "transfer"); setLabel(""); setResourceType(source.resource?.type ?? "energy");
    setUseInPlace(Boolean(source.usableInPlace));
    setCosts([]); setAmount(1); setSupply(1); setCapacity(1); setPrerequisites([]); setResourcePrerequisites([]); setDestination(undefined); setError("");
  }
  function removeAction(id: string) {
    const choice = plan?.choiceGroups?.find(group => group.actionIds.includes(id));
    if (choice) { setError(`This ability belongs to “${choice.label}”. Edit or remove that choice before removing the ability.`); return; }
    if (plan?.actions.some(a => a.requires?.includes(id))) { setError("Another action needs this one. Remove that action first."); return; }
    const remaining = plan?.actions.filter(a => a.id !== id) ?? [];
    const requiredResources = world.goalRules?.requiredResourceIds ?? [];
    const remainingObjects = plan?.objects.map(object => {
      if (!object.usableInPlace || remaining.some(action => action.toolId === object.entityId && action.kind === "transfer")) return object;
      const receiver = {...object}; delete receiver.usableInPlace; return receiver;
    }) ?? [];
    if (!remaining.length) {
      onChange((mode === "discover" && !world.entities.some(e => e.kind === "goal")) || requiredResources.length
        ? { ...plan!, objects: remainingObjects, actions: [] } : undefined);
      return;
    }
    const used = new Set([
      ...requiredResources,
      ...remaining.flatMap(a => [a.toolId, a.targetId, ...(a.requiresResourceIds ?? []), ...(a.costs ?? []).map(cost => cost.entityId), ...(a.effects ?? []).flatMap(effect => "entityId" in effect ? [effect.entityId] : [])]),
    ]);
    onChange({ ...plan!, actions: remaining, objects: remainingObjects.filter(o => used.has(o.entityId)) });
  }
  function changeCosts(actionId: string, costs: ActionCosts) {
    if (!plan) return;
    try { const next = withActionCosts(world, plan, actionId, costs); setError(""); onChange(next); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "This resource cost could not be applied."); }
  }
  function changeSourceHandling(stationary: boolean) {
    if (!plan) return;
    if (!stationary && !canCarry) { setError("Separate this artwork before making it carryable."); return; }
    const next = structuredClone(plan), object = next.objects.find(object => object.entityId === item.id);
    if (!object) return;
    if (stationary) { object.usableInPlace = true; delete object.carryable; }
    else { object.carryable = true; delete object.usableInPlace; }
    try { validateInteractions({...world, interactions: next}); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "This source cannot be changed."); return; }
    setUseInPlace(stationary); setError(""); onChange(next);
  }
  function changeLayer(layer: "object" | "surface") {
    if (!plan) return;
    const next = structuredClone(plan), object = next.objects.find(object => object.entityId === item.id);
    if (!object) return;
    if (layer === "object") delete object.layer;
    else object.layer = layer;
    try { validateInteractions({...world, interactions: next}); }
    catch (error) { setError(error instanceof Error ? error.message : "This arrangement could not be applied."); return; }
    setError(""); onChange(next);
  }
  return <details className="object-purpose" open={actions.length > 0 || dirty || undefined}>
    <summary>Give it a purpose</summary>
    {actions.length > 0 && <ul>{actions.map(a => <li key={a.id}><strong>{a.label}</strong><span>{world.entities.find(e => e.id === a.targetId)?.label ?? "Object"}</span>{a.kind !== "transfer" && <ResourceCostFields world={world} plan={plan} costs={a.costs ?? []} onChange={costs => changeCosts(a.id, costs)} context={a.label} inAbilityList />}<button className="text-button" aria-label={`Remove ability ${a.label}`} onClick={() => removeAction(a.id)}>Remove</button></li>)}</ul>}
    {plan?.objects.some(object => object.entityId === item.id) && <details className="purpose-sequence">
      <summary>Arrangement</summary>
      {mode === "discover" && existingSource?.resource && actions.some(action => action.kind === "transfer") && <label>Source handling
        <select aria-label="Source handling" value={existingSource.usableInPlace ? "fixed" : "carry"} onChange={event => changeSourceHandling(event.target.value === "fixed")}>
          <option value="carry" disabled={!canCarry || hasOperation}>Carry</option><option value="fixed">Use in place</option>
        </select>
        <span>{existingSource.usableInPlace ? "Select this source, then choose where its resource goes." : "Take this source to use its resource."}</span>
      </label>}
      <label>Arrangement layer<select aria-label="Arrangement layer" value={plan.objects.find(object => object.entityId === item.id)?.layer ?? "object"} onChange={event => changeLayer(event.target.value as "object" | "surface")}>
        <option value="object">Object</option>
        <option value="surface">Under other objects</option>
      </select></label>
    </details>}
    <details ref={newAbilityForm} className="purpose-new" open={!actions.length}><summary>{actions.length ? "Add another ability" : "New ability"}</summary>
    <label>What can it do?
      <select aria-label="Object ability" value={behavior} onChange={e => { onCancelDestination?.(); setBehavior(e.target.value); setTargetId(""); setDestination(undefined); setError(""); }}>
        {!defaultBehavior && <option value="">Choose an ability…</option>}
        <option value="transfer" disabled={!canCarry && mode !== "discover" || hasOperation && mode !== "discover"}>Transfer a resource</option>
        <option value="place" disabled={!canCarry || hasOperation || Boolean(existingSource?.usableInPlace)}>Place this object</option>
        {!existingSource?.carryable && <optgroup label="Operate this object">
          {movingTargets.length > 0 && <option value="operate-move">Operate → move an object</option>}
          {mode !== "discover" && openingTargets.length > 0 && <option value="operate-open">Operate → open a gate</option>}
          {mode === "platform" && <option value="operate-jump">Operate → jump higher</option>}
          {mode !== "discover" && <option value="operate-speed">Operate → move faster</option>}
        </optgroup>}
        {canCarry && !hasOperation && !existingSource?.usableInPlace && movingTargets.length > 0 && <><option value="move">Make an object move</option><option value="attach-move">Fit a part to make it move</option></>}
        {canCarry && !hasOperation && !existingSource?.usableInPlace && mode !== "discover" && openingTargets.length > 0 && <option value="open">Open a gate</option>}
        {canCarry && !hasOperation && !existingSource?.usableInPlace && mode === "platform" && <option value="jump">Attach · jump higher</option>}
        {canCarry && !hasOperation && !existingSource?.usableInPlace && mode !== "discover" && <option value="speed">Attach · move faster</option>}
      </select>
    </label>
    <label>{behavior === "place" ? "Place at" : operates ? effectBehavior === "open" ? "Gate to open" : movesObject ? "Object to move" : "Character" : "Works with"}
      <select aria-label="Action target" value={targetId} onChange={e => { onCancelDestination?.(); setTargetId(e.target.value); setDestination(undefined); }}>
        <option value="">Choose an object…</option>
        {targets.map(e => <option key={e.id} value={e.id}>{e.label || e.kind}</option>)}
      </select>
    </label>
    {movesObject && <div className="purpose-destination">
      <button className="secondary-button" disabled={!targetId} onClick={() => {
        const target = targets.find(entity => entity.id === targetId);
        if (target) onPickDestination?.(target, point => { setDestination(point); setError(""); });
      }}>{destination ? "Change destination on scene" : "Choose destination on scene"}</button>
      {destination && <span role="status">Destination set</span>}
    </div>}
    {behavior === "transfer" && mode === "discover" && !actions.length && <label>Source handling
      <select aria-label="New source handling" value={useInPlace ? "fixed" : "carry"} onChange={event => setUseInPlace(event.target.value === "fixed")}>
        <option value="carry" disabled={!canCarry || hasOperation}>Carry</option><option value="fixed">Use in place</option>
      </select>
    </label>}
    {behavior === "transfer" && <div className="purpose-resource">
      <label>Resource<input aria-label="Resource name" maxLength={60} value={resourceType} onChange={e => setResourceType(e.target.value)} /></label>
      <label>Amount<input aria-label="Transfer amount" type="number" min="1" max="10000" value={amount} onChange={e => { const next = Number(e.target.value); setAmount(next); setSupply(value => Math.max(value, next)); setCapacity(value => Math.max(value, next)); }} /></label>
      <label>Starting supply<input aria-label="Starting supply" type="number" min="1" max="10000" disabled={Boolean(sourceResource)} value={sourceResource?.initial ?? supply} onChange={e => setSupply(Number(e.target.value))} /></label>
      <label>Target capacity<input aria-label="Target capacity" type="number" min="1" max="10000" disabled={Boolean(targetResource)} value={targetResource?.capacity ?? capacity} onChange={e => setCapacity(Number(e.target.value))} /></label>
    </div>}
    {behavior && behavior !== "transfer" && <ResourceCostFields world={world} plan={plan} costs={costs} onChange={setCosts} context="New ability" />}
    <label>Action name<input aria-label="Action name" placeholder="What should the player do?" maxLength={80} value={label} onChange={e => setLabel(e.target.value)} /></label>
    {Boolean(plan?.actions.length || plan?.objects.some(object=>object.resource)) && <details className="purpose-sequence"><summary>Requirements</summary>
      {Boolean(plan?.actions.length) && <label style={{display: "grid"}}>Alternative to
        <select aria-label="Alternative to" value={alternativeTo} onChange={event => {setAlternativeTo(event.target.value); setError("");}}>
          <option value="">No alternative</option>
          {plan?.actions.filter(action => !plan.choiceGroups?.some(group => group.actionIds.includes(action.id))).map(action =>
            <option key={action.id} value={`action:${action.id}`} disabled={(plan.choiceGroups?.length ?? 0) >= 8}>{action.label} · {world.entities.find(entity => entity.id === action.toolId)?.label || "Object"}</option>)}
          {plan?.choiceGroups?.filter(group => group.actionIds.length < 4).map(group => <option key={group.id} value={`group:${group.id}`}>{group.label}</option>)}
        </select>
        {alternativeTo && <span>Players choose one. An existing finishing requirement becomes complete one of these abilities.</span>}
      </label>}
      {Boolean(plan?.actions.length) && <div className="purpose-requirements-heading">After another action</div>}
      {plan?.actions.map(action => <label key={action.id} style={{flexDirection: "row"}}>
        <input type="checkbox" checked={prerequisites.includes(action.id)} disabled={!prerequisites.includes(action.id) && Boolean(plan?.choiceGroups?.some(group => group.actionIds.includes(action.id) && group.actionIds.some(id => prerequisites.includes(id))))}
          onChange={e => setPrerequisites(ids => e.target.checked ? [...ids, action.id] : ids.filter(id => id !== action.id))} />
        <span>{action.label}</span>
      </label>)}
      {plan?.objects.some(object=>object.resource) && <div className="purpose-requirements-heading">After an object is filled</div>}
      {plan?.objects.filter(object=>object.resource).map(object=><label key={object.entityId} style={{flexDirection: "row"}}>
        <input type="checkbox" checked={resourcePrerequisites.includes(object.entityId)} onChange={e=>setResourcePrerequisites(ids=>e.target.checked ? [...ids,object.entityId] : ids.filter(id=>id!==object.entityId))}/>
        <span>{world.entities.find(entity=>entity.id===object.entityId)?.label || "Object"} · {object.resource!.capacity} {object.resource!.type}</span>
      </label>)}
    </details>}
    <button className="secondary-button" onClick={addAction}>Add ability</button>
    {dirty && <button className="text-button" onClick={cancelAbilityDraft}>Cancel ability draft</button>}
    </details>
    {error && <p role="alert">{error}</p>}
  </details>;
}

/** Spending is optional and uses only resources already authored in this world. */
function ResourceCostFields({world, plan, costs, onChange, context, inAbilityList}: {
  world: WorldDefinition; plan?: InteractionPlan; costs: ActionCosts;
  onChange: (costs: ActionCosts) => void; context: string; inAbilityList?: boolean;
}) {
  const resources = plan?.objects.filter(object => object.resource) ?? [];
  if (!resources.length) return null;
  return <details style={{marginTop: 12, marginRight: inAbilityList ? -55 : 0}}>
    <summary>Resource costs{costs.length ? ` · ${costs.length}` : ""}</summary>
    <div style={{marginTop: 8, fontSize: 12, color: "#667085"}}>Spent once when this ability succeeds.</div>
    {resources.map(object => {
      const cost = costs.find(cost => cost.entityId === object.entityId);
      const name = world.entities.find(entity => entity.id === object.entityId)?.label || "Object";
      return <div key={object.entityId} style={{display: "grid", gridTemplateColumns: cost ? "minmax(0, 1fr) 70px" : "minmax(0, 1fr)", gap: 10, alignItems: "end"}}>
        <label style={{display: "flex", flexDirection: "row", alignItems: "center", gap: 8}}>
          <input type="checkbox" aria-label={`${context}: spend from ${name}`} checked={Boolean(cost)} disabled={!cost && costs.length >= 8}
            style={{width: 16, height: 16, minHeight: 16, padding: 0, margin: 0, flexShrink: 0}}
            onChange={event => onChange(event.target.checked ? [...costs, {entityId: object.entityId, amount: Math.min(1, object.resource!.capacity)}] : costs.filter(cost => cost.entityId !== object.entityId))} />
          <span>{name} · {object.resource!.type}</span>
        </label>
        {cost && <CostAmountField amount={cost.amount} capacity={object.resource!.capacity} label={`${context}: amount spent from ${name}`}
          onChange={amount => onChange(costs.map(value => value.entityId === object.entityId ? {...value, amount} : value))} />}
      </div>;
    })}
  </details>;
}

/** Keep incomplete numeric keystrokes local; never substitute a different amount. */
function CostAmountField({amount, capacity, label, onChange}: {
  amount: number; capacity: number; label: string; onChange: (amount: number) => void;
}) {
  const [text, setText] = useState(String(amount));
  const [notice, setNotice] = useState("");
  const focused = useRef(false);
  useEffect(() => { if (!focused.current) setText(String(amount)); }, [amount]);
  const valid = (value: string) => value.trim() !== "" && Number.isFinite(Number(value)) && Number(value) > 0 && Number(value) <= capacity;
  return <><label>Amount<input type="number" step="any" min="0" max={capacity} aria-label={label} value={text}
    onFocus={() => { focused.current = true; }}
    onChange={event => {
      const value = event.target.value;
      setText(value); setNotice("");
      if (valid(value)) onChange(Number(value));
    }}
    onBlur={() => {
      focused.current = false;
      if (!valid(text)) setNotice(`Kept ${amount}. Enter an amount above 0, up to ${capacity}.`);
      setText(String(amount));
    }} /></label>{notice && <span role="status" style={{gridColumn: "1 / -1", fontSize: 12, lineHeight: 1.4}}>{notice}</span>}</>;
}

export interface ChoiceDraft {
  editingId?: string;
  label: string;
  actionIds: string[];
  required: boolean;
}

/** Advanced authoring stays in the editor, outside ordinary play controls. */
export function ChoiceGroupEditor({world, plan, requiredIds, draft, onDraftChange, onChange}: {
  world: WorldDefinition;
  plan: InteractionPlan;
  requiredIds: string[];
  draft?: ChoiceDraft;
  onDraftChange: (draft: ChoiceDraft | undefined) => void;
  onChange: (plan: InteractionPlan, requiredIds: string[], convertedActionIds?: string[]) => void;
}) {
  const [error, setError] = useState("");
  const groups = plan.choiceGroups ?? [];
  const abilityName = (action: InteractionAction) => `${action.label} · ${world.entities.find(entity => entity.id === action.toolId)?.label || "Object"}`;
  function save() {
    if (!draft) return;
    if (!draft.label.trim()) { setError("Name this choice."); return; }
    if (draft.actionIds.length < 2 || draft.actionIds.length > 4) { setError("Choose two to four abilities."); return; }
    if (!draft.editingId && groups.length >= 8) { setError("This world already has eight choices."); return; }
    if (groups.some(group => group.id !== draft.editingId && group.actionIds.some(id => draft.actionIds.includes(id)))) {
      setError("An ability can belong to only one choice."); return;
    }
    const group = {id: draft.editingId ?? `choice-${crypto.randomUUID()}`, label: draft.label.trim(), actionIds: [...draft.actionIds]};
    const next = {...plan, choiceGroups: [...groups.filter(item => item.id !== group.id), group]};
    const required = draft.required ? [...new Set([...requiredIds, group.id])] : requiredIds.filter(id => id !== group.id);
    const previousMembers = groups.find(candidate => candidate.id === draft.editingId)?.actionIds ?? [];
    const convertedActionIds = draft.actionIds.filter(id => !previousMembers.includes(id));
    try {
      validateInteractions({...world, interactions: next, goalRules: {
        ...(world.goalRules ?? {requiredCollectedIds: [], requiredActivatedIds: []}),
        requiredInteractionIds: (world.goalRules?.requiredInteractionIds ?? []).filter(id => !convertedActionIds.includes(id)),
        requiredChoiceGroupIds: required,
      }});
      onChange(next, required, convertedActionIds); onDraftChange(undefined); setError("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Check these abilities before saving the choice."); }
  }
  return <details className="object-purpose" open={draft ? true : undefined}>
    <summary>Choices{groups.length ? ` · ${groups.length}` : ""}</summary>
    <div className="editor-scope">Choose one ability per run. The other options close for this run.</div>
    {groups.length > 0 && <ul>{groups.map(group => <li key={group.id}>
      <strong>{group.label}</strong>
      <span>{group.actionIds.map(id => { const action = plan.actions.find(action => action.id === id); return action ? abilityName(action) : id; }).join(" or ")}{requiredIds.includes(group.id) ? " · Required" : " · Optional"}</span>
      <button className="text-button" disabled={Boolean(draft)} onClick={() => {onDraftChange({editingId: group.id, label: group.label, actionIds: [...group.actionIds], required: requiredIds.includes(group.id)}); setError("");}}>Edit</button>
    </li>)}</ul>}
    {!draft && <button className="secondary-button" disabled={groups.length >= 8 || plan.actions.filter(action => !groups.some(group => group.actionIds.includes(action.id))).length < 2}
      onClick={() => {onDraftChange({label: "", actionIds: [], required: true}); setError("");}}>Add choice</button>}
    {draft && <div className="purpose-new">
      <label>Choice name<input aria-label="Choice name" maxLength={80} value={draft.label} onChange={event => onDraftChange({...draft, label: event.target.value})} /></label>
      <fieldset className="purpose-sequence" style={{border: 0, padding: 0, minWidth: 0}}><legend>Choose abilities</legend>
        {plan.actions.filter(action => !groups.some(group => group.id !== draft.editingId && group.actionIds.includes(action.id))).map(action => <label key={action.id} style={{flexDirection: "row"}}>
          <input type="checkbox" checked={draft.actionIds.includes(action.id)} disabled={draft.actionIds.length >= 4 && !draft.actionIds.includes(action.id)}
            onChange={event => onDraftChange({...draft, actionIds: event.target.checked ? [...draft.actionIds, action.id] : draft.actionIds.filter(id => id !== action.id)})} />
          <span>{abilityName(action)}</span>
        </label>)}
      </fieldset>
      <div className="purpose-sequence"><label style={{flexDirection: "row"}}><input type="checkbox" checked={draft.required} onChange={event => onDraftChange({...draft, required: event.target.checked})} />Complete one to finish</label></div>
      <div className="editor-scope">{draft.editingId ? "Newly added options replace their individual finishing requirements. Existing fixed requirements stay unchanged." : "These abilities become a choice instead of individual finishing requirements."}</div>
      <button className="secondary-button" onClick={save}>Save choice</button>
      <button className="text-button" onClick={() => {onDraftChange(undefined); setError("");}}>Cancel</button>
      {draft.editingId && <button className="text-button" onClick={() => {
        onChange({...plan, choiceGroups: groups.filter(item => item.id !== draft.editingId)}, requiredIds.filter(id => id !== draft.editingId));
        onDraftChange(undefined); setError("");
      }}>Remove choice</button>}
    </div>}
    {error && <p role="alert">{error}</p>}
  </details>;
}
