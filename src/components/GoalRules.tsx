import { useState } from "react";
import { Flag, Sparkles, ToggleRight } from "lucide-react";
import {
  objectiveObjectLabel,
  withGoalRules,
  movementMode,
  type WorldGameplay,
  type GoalRules as Rules,
  type PlayState,
  type WorldDefinition,
  type WorldEntity,
} from "../../shared/world";
import { Modal } from "./Modal";
import { WrappingTextarea } from "./WrappingTextarea";
import "./GoalRules.css";
import { objectName } from "../lib/object-name";
import { interactionState } from "../../shared/interactions";
import { emptyPlayState } from "../../shared/world";

export function GoalRules({
  world,
  state,
  onApply,
  onCancel,
}: {
  world: WorldDefinition;
  state?: PlayState;
  onApply: (rules: Rules, gameplay?: WorldGameplay) => void;
  onCancel: () => void;
}) {
  const [rules, setRules] = useState<Rules>(() =>
    structuredClone(
      world.goalRules ?? {
        requiredCollectedIds: [],
        requiredActivatedIds: [],
      },
    ),
  );
  const [error, setError] = useState("");
  const isDiscovery = movementMode(world) === "discover";
  const [clueTexts, setClueTexts] = useState<Record<string,string>>(() => Object.fromEntries((world.gameplay?.clues ?? []).map(clue => [clue.entityId, clue.text])));
  const hasGoal = world.entities.some((e) => e.kind === "goal");
  const canFinish = hasGoal || Boolean(world.interactions);
  const count =
    rules.requiredCollectedIds.length + rules.requiredActivatedIds.length + (rules.requiredInteractionIds?.length ?? 0) + (rules.requiredResourceIds?.length ?? 0);
  const quantities = interactionState(world, state ?? emptyPlayState()).quantities;
  const original = world.goalRules ?? {
    requiredCollectedIds: [],
    requiredActivatedIds: [],
  };
  const changed = Object.entries(clueTexts).some(([id,text]) => text !== world.gameplay?.clues?.find(clue => clue.entityId === id)?.text) || (["requiredCollectedIds", "requiredActivatedIds", "requiredInteractionIds", "requiredResourceIds"] as (keyof Rules)[]).some(
    (key) =>
      (rules[key] ?? []).length !== (original[key] ?? []).length ||
      (rules[key] ?? []).some((id) => !(original[key] ?? []).includes(id)),
  );
  function toggle(key: keyof Rules, id: string) {
    setError("");
    setRules((old) => ({
      ...old,
      [key]: (old[key] ?? []).includes(id)
        ? (old[key] ?? []).filter((selected) => selected !== id)
        : [...(old[key] ?? []), id],
    }));
  }
  function choices(kind: "coin" | "lever", key: keyof Rules) {
    const entities = world.entities.filter((e) => e.kind === kind);
    if (!entities.length) return null;
    return (
      <fieldset className="goal-rules-group" disabled={!hasGoal}>
        <legend>
          {kind === "coin" ? <Sparkles size={16} /> : <ToggleRight size={17} />}
          {kind === "coin"
            ? "Collect before finishing"
            : "Activate before finishing"}
        </legend>
        {!entities.length && (
          <p className="goal-rules-empty">
            No {kind === "coin" ? "collectibles" : "levers"} in this world yet.
          </p>
        )}
        {entities.map((entity: WorldEntity) => (
          <label className="goal-rules-choice" key={entity.id}>
            <input
              type="checkbox"
              checked={(rules[key] ?? []).includes(entity.id)}
              onChange={() => toggle(key, entity.id)}
            />
            {entity.art && <img src={entity.art} alt="" />}
            <span>
              <strong>{objectiveObjectLabel(world, entity.id)}</strong>
              {kind === "lever" && entity.targetId && (
                <small>Opens {objectName(world, entity.targetId, 60)}</small>
              )}
            </span>
            {(
              (kind === "coin" ? state?.collected : state?.activated) ?? []
            ).includes(entity.id) && (
              <em>Already {kind === "coin" ? "found" : "active"}</em>
            )}
          </label>
        ))}
      </fieldset>
    );
  }
  function apply() {
    try {
      const next = withGoalRules(world, rules, clueTexts);
      onApply(structuredClone(rules), next.gameplay);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "The requirements could not be applied. Your world is unchanged.",
      );
    }
  }
  return (
    <Modal title={world.interactions ? "Completion rules" : "Destination rules"} onClose={onCancel} footer={
        <div className="goal-rules-actions">
          <button
            className="text-button"
            disabled={!count}
            onClick={() =>
              setRules({ requiredCollectedIds: [], requiredActivatedIds: [], requiredInteractionIds: [], requiredResourceIds: [] })
            }
          >
            Make all optional
          </button>
          <button
            className="primary-button"
            disabled={!canFinish || !changed}
            onClick={apply}
          >
            Apply rules
          </button>
        </div>
}>
      <div className="goal-rules">
        <p className="goal-rules-intro">
          Choose what must be achieved to finish.
        </p>
        {!canFinish && (
          <p className="goal-rules-error" role="status">
            This world has no destination. Add one in Edit world before setting
            a finish rule.
          </p>
        )}
        {choices("coin", "requiredCollectedIds")}
        {choices("lever", "requiredActivatedIds")}
        {world.interactions && <fieldset className="goal-rules-group" disabled={!canFinish}>
          <legend>Complete before finishing</legend>
          {world.interactions.actions.map(action => <label className="goal-rules-choice" key={action.id}>
            <input type="checkbox" checked={(rules.requiredInteractionIds ?? []).includes(action.id)} onChange={() => toggle("requiredInteractionIds", action.id)} />
            <span><strong>{action.label}</strong></span>
            {state?.interactions?.completed.includes(action.id) && <em>Done</em>}
          </label>)}
        </fieldset>}
        {world.interactions?.objects.some(object => object.resource) && <fieldset className="goal-rules-group" disabled={!canFinish}>
          <legend>Fill to finish</legend>
          {world.interactions.objects.filter(object => object.resource).map(object => <label className="goal-rules-choice" key={object.entityId}>
            <input type="checkbox" checked={(rules.requiredResourceIds ?? []).includes(object.entityId)} onChange={() => toggle("requiredResourceIds", object.entityId)} />
            <span><strong>{objectName(world, object.entityId, 70)}</strong><small>{object.resource!.capacity} {object.resource!.type.replaceAll("-", " ")}</small></span>
            {quantities[object.entityId] >= object.resource!.capacity && <em>Full</em>}
          </label>)}
        </fieldset>}
        {isDiscovery && !world.interactions && hasGoal && (
          <fieldset className="goal-rules-group">
            <legend>Discovery clues</legend>
            <p className="goal-rules-empty">These clues lead through your required objects, then to the finish.</p>
            {[...rules.requiredCollectedIds, ...rules.requiredActivatedIds,
              world.gameplay?.clues?.find(clue => world.entities.some(entity => entity.id === clue.entityId && entity.kind === "goal"))?.entityId ?? world.entities.find(entity => entity.kind === "goal")?.id
            ].filter((id): id is string => Boolean(id)).map(id => (
              <label className="goal-clue-field" key={id}>
                {objectiveObjectLabel(world, id)}
                <WrappingTextarea rows={3} aria-label={`Clue for ${objectiveObjectLabel(world,id)}`} maxLength={160}
                  value={clueTexts[id] ?? `Find ${objectiveObjectLabel(world,id)}.`}
                  onChange={event => { setError("");setClueTexts(old => ({...old,[id]:event.target.value})); }} />
              </label>
            ))}
          </fieldset>
        )}
        <section
          className="goal-rules-summary"
          aria-label="Completion rule"
          aria-live="polite"
        >
          <Flag size={19} />
          <div>
            <strong>
              {world.interactions && !hasGoal
                ? count ? `${count} ${count === 1 ? "requirement" : "requirements"}` : "Free play"
                : !hasGoal
                ? "Exploration · no destination"
                : count
                  ? `${count} ${count === 1 ? "requirement" : "requirements"}, then reach a destination`
                  : "Reach a destination"}
            </strong>
            <p>
              {world.interactions && !hasGoal
                ? count ? "Meet the selected goals to finish." : "All object interactions remain available."
                : !hasGoal
                ? "Add a destination in Edit world to give this world a finish."
                : count
                  ? "Every checked object is required. Any destination can finish this world once they are done."
                  : "Collection and lever use remain optional. Reaching any destination finishes the world."}
            </p>
          </div>
        </section>
        {state?.completed && (
          <p className="goal-rules-intro">
            Your completed achievement stays earned. Continue exploring with
            these rules, or choose Replay from start to try the changed
            challenge.
          </p>
        )}
        {error && (
          <p className="goal-rules-error" role="alert">
            {error}
          </p>
        )}

      </div>
    </Modal>
  );
}
