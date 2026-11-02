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
  ]);
  const objectives = world.entities.filter(
    (entity) => entity.kind === "coin" || entity.kind === "lever",
  );
  const destinations = world.entities.filter(
    (entity) => entity.kind === "goal",
  );
  const describe = (id: string) =>
    `${world.entities.find((entity) => entity.id === id)?.kind === "lever" ? "Use" : "Collect"} ${objectiveObjectLabel(world, id)}`;
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
              : "Explore freely. Add a destination in Edit objects to give this game a finish."}
          </dd>
        </div>
        <div>
          <dt>Required</dt>
          <dd>
            {required.size
              ? <ul className="required-object-list">{[...required].map((id) => <li key={id}>{describe(id)}</li>)}</ul>
              : "No collectible or switch is required."}
          </dd>
        </div>
        {objectives.some((entity) => !required.has(entity.id)) && <div>
          <dt>Optional</dt>
          <dd>{objectives.filter((entity) => !required.has(entity.id)).map((entity) => objectiveObjectLabel(world, entity.id)).join(" · ")}</dd>
        </div>}
      </dl>
    </section>
  );
}
