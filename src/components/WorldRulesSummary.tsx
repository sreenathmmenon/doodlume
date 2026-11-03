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
  const describe = (id: string) =>
    world.interactions?.actions.find((action) => action.id === id)?.label ??
    `${world.entities.find((entity) => entity.id === id)?.kind === "lever" ? "Use" : "Collect"} ${objectiveObjectLabel(world, id)}`;
  const optional = [
    ...objectives.filter((entity) => !required.has(entity.id)).map((entity) => objectiveObjectLabel(world, entity.id)),
    ...(world.interactions?.actions ?? []).filter((action) => !required.has(action.id)).map((action) => action.label),
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
              ? `Reach ${destinations.map((entity, index) => entity.label?.trim() || `Destination ${index + 1}`).join(" or ")}${required.size ? " after the required actions." : "."}`
              : required.size && world.interactions ? "Complete the required actions." : "Explore freely. Add a destination to give this world a finish."}
          </dd>
        </div>
        <div>
          <dt>Required</dt>
          <dd>
            {required.size
              ? <ul className="required-object-list">{[...required].map((id) => <li key={id}>{describe(id)}</li>)}</ul>
              : "All actions are optional."}
          </dd>
        </div>
        {optional.length > 0 && <div>
          <dt>Optional</dt>
          <dd>{optional.join(" · ")}</dd>
        </div>}
      </dl>
    </section>
  );
}
