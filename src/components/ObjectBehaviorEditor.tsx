import { useEffect, useState } from "react";
import { validateInteractions, type InteractionAction, type InteractionPlan } from "../../shared/interactions";
import type { WorldDefinition, WorldEntity } from "../../shared/world";
import { isSourceAlignedScenery, isSourceBackdrop } from "../../shared/source-scenery";
import { movementMode } from "../../shared/world";
import "./object-behavior-editor.css";

interface AbilityDraft {
  targetId: string; behavior: string; label: string; resourceType: string;
  amount: number; supply: number; capacity: number;
  destination?: {x:number;y:number}; prerequisites: string[]; resourcePrerequisites?: string[]; dirty: boolean;
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
  onChange: (plan: InteractionPlan | undefined) => void;
  onDraw?: () => void;
  onCancelDestination?: () => void;
  onDraftChange?: (dirty: boolean) => void;
  onPickDestination?: (target: WorldEntity, choose: (point: {x: number; y: number}) => void) => void;
}) {
  const cacheKey = `${world.id}:${world.revision}:${item.id}`;
  const draft = abilityDrafts.get(cacheKey);
  const [targetId, setTargetId] = useState(draft?.targetId ?? "");
  const [behavior, setBehavior] = useState(draft?.behavior ?? "transfer");
  const [label, setLabel] = useState(draft?.label ?? "");
  const [resourceType, setResourceType] = useState(() => draft?.resourceType ?? plan?.objects.find(object => object.entityId === item.id)?.resource?.type ?? "energy");
  const [amount, setAmount] = useState(draft?.amount ?? 1);
  const [supply, setSupply] = useState(draft?.supply ?? 1);
  const [capacity, setCapacity] = useState(draft?.capacity ?? 1);
  const [destination, setDestination] = useState<{x: number; y: number} | undefined>(draft?.destination);
  const [prerequisites, setPrerequisites] = useState<string[]>(draft?.prerequisites ?? []);
  const [resourcePrerequisites, setResourcePrerequisites] = useState<string[]>(draft?.resourcePrerequisites ?? []);
  const originalResource = plan?.objects.find(object => object.entityId === item.id)?.resource?.type ?? "energy";
  const dirty = Boolean(targetId || label.trim() || destination || prerequisites.length || resourcePrerequisites.length || behavior !== "transfer" || resourceType !== originalResource || amount !== 1 || supply !== 1 || capacity !== 1);
  useEffect(() => {
    abilityDrafts.set(cacheKey, {targetId, behavior, label, resourceType, amount, supply, capacity, destination, prerequisites, resourcePrerequisites, dirty});
    const prefix = `${world.id}:${world.revision}:`;
    onDraftChange?.([...abilityDrafts].some(([key, value]) => key.startsWith(prefix) && value.dirty));
  }, [cacheKey, targetId, behavior, label, resourceType, amount, supply, capacity, destination, prerequisites, resourcePrerequisites, dirty, onDraftChange, world.id, world.revision]);
  const movesObject = behavior === "move" || behavior === "attach-move";
  const [error, setError] = useState("");
  const sourceResource = plan?.objects.find(object => object.entityId === item.id)?.resource;
  const targetResource = plan?.objects.find(object => object.entityId === targetId)?.resource;
  const actions = plan?.actions.filter(a => a.toolId === item.id) ?? [];
  const mode = movementMode(world);
  if (item.kind !== "decoration") return null;
  // Existing embedded scenery must first be separated by the source preparation pipeline.
  const canCarry = !item.artSource || !world.entities.some(isSourceBackdrop) || Boolean(item.sourceLayer);
  if (!canCarry) return null;
  if (!item.art) return onDraw ? <button className="secondary-button" onClick={onDraw}>Draw this object</button> : null;
  const openingTargets = world.entities.filter(e => e.kind === "gate" && (!e.artSource || Boolean(e.sourceLayer) || (world.entities.some(isSourceAlignedScenery) && Boolean(e.art))));
  const movingTargets = world.entities.filter(e => e.kind === "decoration" && e.art && (!e.artSource || e.sourceLayer) && !isSourceBackdrop(e) && !plan?.objects.some(o => o.entityId === e.id && o.carryable));
  const targets = world.entities.filter(e => e.id !== item.id &&
    (behavior === "place" ? !isSourceBackdrop(e) : movesObject ? movingTargets.some(target => target.id === e.id) : behavior === "open" ? openingTargets.some(gate => gate.id === e.id) : behavior === "jump" || behavior === "speed" ? e.kind === "player" : !isSourceBackdrop(e) && e.kind !== "terrain" && e.kind !== "bridge"));
  function addAction() {
    if (!targets.some(e => e.id === targetId)) { setError("Choose what your object works with."); return; }
    if (movesObject && !destination) { setError("Choose where the object should go on the scene."); return; }
    if (!label.trim()) { setError("Name the action players will take."); return; }
    if (behavior === "transfer" && (!/^[\w-]{1,60}$/.test(resourceType) || !Number.isFinite(amount) || amount <= 0 || amount > 10000)) {
      setError("Choose a resource name and an amount between 1 and 10,000."); return;
    }
    if ((behavior === "jump" || behavior === "speed" || behavior === "attach-move") && actions.some(a => a.kind === "attach")) {
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
    const source = next.objects.find(o => o.entityId === item.id) ?? { entityId: item.id, carryable: true };
    const target = next.objects.find(o => o.entityId === targetId) ?? { entityId: targetId };
    source.carryable = true;
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
    const base = { id: `action-${crypto.randomUUID()}`, label: label.trim(), toolId: item.id, targetId, ...(prerequisites.length ? {requires: prerequisites.filter(id => next.actions.some(action => action.id === id))} : {}), ...(resourcePrerequisites.length ? {requiresResourceIds:resourcePrerequisites.filter(id=>next.objects.some(object=>object.entityId===id && object.resource))} : {}) };
    const action: InteractionAction = behavior === "transfer" ? { ...base, kind: "transfer", amount } :
      behavior === "place" ? { ...base, kind: "place", effects: [{kind: "moveObject", entityId: item.id, ...placement, durationMs: 900}] } :
      movesObject ? { ...base, kind: behavior === "attach-move" ? "attach" : "use", effects: [{ kind: "moveObject", entityId: targetId, x: destination!.x, y: destination!.y, durationMs: 1600 }] } :
      behavior === "open" ? { ...base, kind: "use", effects: [{ kind: "openGate", entityId: targetId }] } :
      { ...base, kind: "attach", effects: [{ kind: behavior === "jump" ? "jumpBoost" : "moveSpeedBoost", multiplier: 1.5 }] };
    next.actions.push(action);
    if (behavior === "place") {
      try { validateInteractions({...world, interactions: next}); }
      catch (cause) {
        const message = cause instanceof Error ? cause.message : "Check this placement and its requirements.";
        setError(message.includes("explicit prerequisite sequence")
          ? "Choose the earlier placement under Requirements first."
          : message);
        return;
      }
    }
    onChange(next);
    setTargetId(""); setBehavior("transfer"); setLabel(""); setResourceType(source.resource?.type ?? "energy");
    setAmount(1); setSupply(1); setCapacity(1); setPrerequisites([]); setResourcePrerequisites([]); setDestination(undefined); setError("");
  }
  function removeAction(id: string) {
    if (plan?.actions.some(a => a.requires?.includes(id))) { setError("Another action needs this one. Remove that action first."); return; }
    const remaining = plan?.actions.filter(a => a.id !== id) ?? [];
    const requiredResources = world.goalRules?.requiredResourceIds ?? [];
    if (!remaining.length) {
      onChange((mode === "discover" && !world.entities.some(e => e.kind === "goal")) || requiredResources.length
        ? { ...plan!, actions: [] } : undefined);
      return;
    }
    const used = new Set([
      ...requiredResources,
      ...remaining.flatMap(a => [a.toolId, a.targetId, ...(a.requiresResourceIds ?? []), ...(a.effects ?? []).flatMap(effect => "entityId" in effect ? [effect.entityId] : [])]),
    ]);
    onChange({ version: 1, actions: remaining, objects: plan!.objects.filter(o => used.has(o.entityId)) });
  }
  return <details className="object-purpose" open={actions.length > 0 || dirty || undefined}>
    <summary>Give it a purpose</summary>
    {actions.length > 0 && <ul>{actions.map(a => <li key={a.id}><strong>{a.label}</strong><span>{world.entities.find(e => e.id === a.targetId)?.label ?? "Object"}</span><button className="text-button" aria-label={`Remove ability ${a.label}`} onClick={() => removeAction(a.id)}>Remove</button></li>)}</ul>}
    <details className="purpose-new" open={!actions.length}><summary>{actions.length ? "Add another ability" : "New ability"}</summary>
    <label>What can it do?
      <select aria-label="Object ability" value={behavior} onChange={e => { onCancelDestination?.(); setBehavior(e.target.value); setTargetId(""); setDestination(undefined); setError(""); }}>
        <option value="transfer">Transfer a resource</option>
        <option value="place">Place this object</option>
        {movingTargets.length > 0 && <><option value="move">Make an object move</option><option value="attach-move">Fit a part to make it move</option></>}
        {mode !== "discover" && openingTargets.length > 0 && <option value="open">Open a gate</option>}
        {mode === "platform" && <option value="jump">Attach · jump higher</option>}
        {mode !== "discover" && <option value="speed">Attach · move faster</option>}
      </select>
    </label>
    <label>{behavior === "place" ? "Place at" : "Works with"}
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
    {behavior === "transfer" && <div className="purpose-resource">
      <label>Resource<input aria-label="Resource name" maxLength={60} value={resourceType} onChange={e => setResourceType(e.target.value)} /></label>
      <label>Amount<input aria-label="Transfer amount" type="number" min="1" max="10000" value={amount} onChange={e => { const next = Number(e.target.value); setAmount(next); setSupply(value => Math.max(value, next)); setCapacity(value => Math.max(value, next)); }} /></label>
      <label>Starting supply<input aria-label="Starting supply" type="number" min="1" max="10000" disabled={Boolean(sourceResource)} value={sourceResource?.initial ?? supply} onChange={e => setSupply(Number(e.target.value))} /></label>
      <label>Target capacity<input aria-label="Target capacity" type="number" min="1" max="10000" disabled={Boolean(targetResource)} value={targetResource?.capacity ?? capacity} onChange={e => setCapacity(Number(e.target.value))} /></label>
    </div>}
    <label>Action name<input aria-label="Action name" placeholder="What should the player do?" maxLength={80} value={label} onChange={e => setLabel(e.target.value)} /></label>
    {Boolean(plan?.actions.length || plan?.objects.some(object=>object.resource)) && <details className="purpose-sequence"><summary>Requirements</summary>
      {Boolean(plan?.actions.length) && <div className="purpose-requirements-heading">After another action</div>}
      {plan?.actions.map(action => <label key={action.id}>
        <input type="checkbox" checked={prerequisites.includes(action.id)} onChange={e => setPrerequisites(ids => e.target.checked ? [...ids, action.id] : ids.filter(id => id !== action.id))} />
        <span>{action.label}</span>
      </label>)}
      {plan?.objects.some(object=>object.resource) && <div className="purpose-requirements-heading">After an object is filled</div>}
      {plan?.objects.filter(object=>object.resource).map(object=><label key={object.entityId}>
        <input type="checkbox" checked={resourcePrerequisites.includes(object.entityId)} onChange={e=>setResourcePrerequisites(ids=>e.target.checked ? [...ids,object.entityId] : ids.filter(id=>id!==object.entityId))}/>
        <span>{world.entities.find(entity=>entity.id===object.entityId)?.label || "Object"} · {object.resource!.capacity} {object.resource!.type}</span>
      </label>)}
    </details>}
    <button className="secondary-button" onClick={addAction}>Add ability</button>
    </details>
    {error && <p role="alert">{error}</p>}
  </details>;
}
