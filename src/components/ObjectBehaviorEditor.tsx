import { useState } from "react";
import type { InteractionAction, InteractionPlan } from "../../shared/interactions";
import type { WorldDefinition, WorldEntity } from "../../shared/world";
import { isSourceAlignedScenery, isSourceBackdrop } from "../../shared/source-scenery";
import { movementMode } from "../../shared/world";
import "./object-behavior-editor.css";

/** Author executable object relationships; no source names select mechanics. */
export function ObjectBehaviorEditor({ world, item, plan, onChange, onDraw }: {
  world: WorldDefinition; item: WorldEntity; plan?: InteractionPlan;
  onChange: (plan: InteractionPlan | undefined) => void;
  onDraw?: () => void;
}) {
  const [targetId, setTargetId] = useState("");
  const [behavior, setBehavior] = useState("transfer");
  const [label, setLabel] = useState("");
  const [resourceType, setResourceType] = useState(() => plan?.objects.find(object => object.entityId === item.id)?.resource?.type ?? "energy");
  const [amount, setAmount] = useState(1);
  const [supply, setSupply] = useState(1);
  const [capacity, setCapacity] = useState(1);
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
  const targets = world.entities.filter(e => e.id !== item.id &&
    (behavior === "open" ? openingTargets.some(gate => gate.id === e.id) : behavior === "jump" || behavior === "speed" ? e.kind === "player" : !isSourceBackdrop(e) && e.kind !== "terrain" && e.kind !== "bridge"));
  function addAction() {
    if (!targets.some(e => e.id === targetId)) { setError("Choose what your object works with."); return; }
    if (!label.trim()) { setError("Name the action players will take."); return; }
    if (behavior === "transfer" && (!/^[\w-]{1,60}$/.test(resourceType) || !Number.isFinite(amount) || amount <= 0 || amount > 10000)) {
      setError("Choose a resource name and an amount between 1 and 10,000."); return;
    }
    if ((behavior === "jump" || behavior === "speed") && actions.some(a => a.kind === "attach")) {
      setError("This part already has an attachment. Draw another part for a new ability."); return;
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
    const base = { id: `action-${crypto.randomUUID()}`, label: label.trim(), toolId: item.id, targetId };
    const action: InteractionAction = behavior === "transfer" ? { ...base, kind: "transfer", amount } :
      behavior === "open" ? { ...base, kind: "use", effects: [{ kind: "openGate", entityId: targetId }] } :
      { ...base, kind: "attach", effects: [{ kind: behavior === "jump" ? "jumpBoost" : "moveSpeedBoost", multiplier: 1.5 }] };
    next.actions.push(action); onChange(next); setLabel(""); setError("");
  }
  function removeAction(id: string) {
    if (plan?.actions.some(a => a.requires?.includes(id))) { setError("Another action needs this one. Remove that action first."); return; }
    const remaining = plan?.actions.filter(a => a.id !== id) ?? [];
    if (!remaining.length) { onChange(mode === "discover" && !world.entities.some(e => e.kind === "goal") ? { ...plan!, actions: [] } : undefined); return; }
    const used = new Set(remaining.flatMap(a => [a.toolId, a.targetId]));
    onChange({ version: 1, actions: remaining, objects: plan!.objects.filter(o => used.has(o.entityId)) });
  }
  return <details className="object-purpose" open={actions.length > 0 || undefined}>
    <summary>Give it a purpose</summary>
    {actions.length > 0 && <ul>{actions.map(a => <li key={a.id}><strong>{a.label}</strong><span>{world.entities.find(e => e.id === a.targetId)?.label ?? "Object"}</span><button className="text-button" aria-label={`Remove ability ${a.label}`} onClick={() => removeAction(a.id)}>Remove</button></li>)}</ul>}
    <details className="purpose-new" open={!actions.length}><summary>{actions.length ? "Add another ability" : "New ability"}</summary>
    <label>What can it do?
      <select aria-label="Object ability" value={behavior} onChange={e => { setBehavior(e.target.value); setTargetId(""); setError(""); }}>
        <option value="transfer">Transfer a resource</option>
        {mode !== "discover" && openingTargets.length > 0 && <option value="open">Open a gate</option>}
        {mode === "platform" && <option value="jump">Attach · jump higher</option>}
        {mode !== "discover" && <option value="speed">Attach · move faster</option>}
      </select>
    </label>
    <label>Works with
      <select aria-label="Action target" value={targetId} onChange={e => setTargetId(e.target.value)}>
        <option value="">Choose an object…</option>
        {targets.map(e => <option key={e.id} value={e.id}>{e.label || e.kind}</option>)}
      </select>
    </label>
    {behavior === "transfer" && <div className="purpose-resource">
      <label>Resource<input aria-label="Resource name" maxLength={60} value={resourceType} onChange={e => setResourceType(e.target.value)} /></label>
      <label>Amount<input aria-label="Transfer amount" type="number" min="1" max="10000" value={amount} onChange={e => { const next = Number(e.target.value); setAmount(next); setSupply(value => Math.max(value, next)); setCapacity(value => Math.max(value, next)); }} /></label>
      <label>Starting supply<input aria-label="Starting supply" type="number" min="1" max="10000" disabled={Boolean(sourceResource)} value={sourceResource?.initial ?? supply} onChange={e => setSupply(Number(e.target.value))} /></label>
      <label>Target capacity<input aria-label="Target capacity" type="number" min="1" max="10000" disabled={Boolean(targetResource)} value={targetResource?.capacity ?? capacity} onChange={e => setCapacity(Number(e.target.value))} /></label>
    </div>}
    <label>Action name<input aria-label="Action name" placeholder="What should the player do?" maxLength={80} value={label} onChange={e => setLabel(e.target.value)} /></label>
    <button className="secondary-button" onClick={addAction}>Add ability</button>
    </details>
    {error && <p role="alert">{error}</p>}
  </details>;
}
