import { objectiveObjectLabel, type WorldDefinition } from "../../shared/world";

export function WorldRulesSummary({
  world,
  onEdit,
}: {
  world: WorldDefinition;
  onEdit: () => void;
}) {
  const required = new Set([
    ...(world.goalRules?.requiredCollectedIds ?? []),
    ...(world.goalRules?.requiredActivatedIds ?? []),
    ...(world.goalRules?.requiredInteractionIds ?? []),
  ]);
  const objectives = world.entities.filter(
    (entity) => entity.kind === "coin" || entity.kind === "lever",
  );
  const destinations = world.entities.filter(
    (entity) => entity.kind === "goal",
  );
  const resourceGoals = world.goalRules?.requiredResourceIds ?? [];
  const choiceGoals = (world.interactions?.choiceGroups ?? []).filter(group => world.goalRules?.requiredChoiceGroupIds?.includes(group.id));
  const requiredCount = required.size + resourceGoals.length + choiceGoals.length;
  const describe = (id: string) =>
    world.interactions?.actions.find((action) => action.id === id)?.label ??
    `${world.entities.find((entity) => entity.id === id)?.kind === "lever" ? "Use" : "Collect"} ${objectiveObjectLabel(world, id)}`;
  const optional = [
    ...objectives.filter((entity) => !required.has(entity.id)).map((entity) => objectiveObjectLabel(world, entity.id)),
    ...(world.interactions?.actions ?? []).filter((action) => !required.has(action.id) && !world.interactions?.choiceGroups?.some(group => group.actionIds.includes(action.id))).map((action) => action.label),
  ];
  return (
    <section
      className="world-rules-summary"
      aria-label="How this world finishes"
    >
      <div className="world-rules-heading">
        <h3>How it plays</h3>
        <button className="text-button" onClick={onEdit}>
          Edit requirements
        </button>
      </div>
      <dl>
        <div>
          <dt>Finish</dt>
          <dd>
            {destinations.length
              ? `Reach ${destinations.map((entity, index) => entity.label?.trim() || `Destination ${index + 1}`).join(" or ")}${requiredCount ? " after meeting the requirements." : "."}`
              : requiredCount && world.interactions ? "Meet the requirements below." : "Explore freely. Add a destination to give this world a finish."}
          </dd>
        </div>
        <div>
          <dt>Required</dt>
          <dd>
            {requiredCount
              ? <ul className="required-object-list">{[...required].map((id) => <li key={`action-${id}`}>{world.interactions?.choiceGroups?.some(group => group.actionIds.includes(id)) ? "Must choose " : ""}{describe(id)}</li>)}{choiceGoals.map(group => <li key={`choice-${group.id}`}>{group.label}: {group.actionIds.map(describe).join(" or ")} (choose one)</li>)}{resourceGoals.map(id => <li key={`resource-${id}`}>Fill {objectiveObjectLabel(world, id)} · {world.interactions?.objects.find(object => object.entityId === id)?.resource?.capacity} {world.interactions?.objects.find(object => object.entityId === id)?.resource?.type.replaceAll("-", " ")}</li>)}</ul>
              : "All actions are optional."}
          </dd>
        </div>
        {Boolean(world.interactions?.choiceGroups?.some(group => !world.goalRules?.requiredChoiceGroupIds?.includes(group.id))) && <div>
          <dt>Optional choices</dt>
          <dd>{world.interactions!.choiceGroups!.filter(group => !world.goalRules?.requiredChoiceGroupIds?.includes(group.id)).map(group => `${group.label}: ${group.actionIds.map(describe).join(" or ")}`).join(" · ")}</dd>
        </div>}
        {optional.length > 0 && <div>
          <dt>{resourceGoals.length ? "Available actions" : "Optional"}</dt>
          <dd>{optional.join(" · ")}</dd>
        </div>}
      </dl>
    </section>
  );
}
