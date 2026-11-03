import {
  goalProgress,
  type PlayState,
  type WorldDefinition,
  type WorldEntity,
} from "../../shared/world";

export function discoveryResolved(
  entity: WorldEntity,
  state: PlayState,
  awaitingAmendedGoal = false,
): boolean {
  return entity.kind === "goal"
    ? state.completed && !awaitingAmendedGoal
    : entity.kind === "lever"
      ? state.activated.includes(entity.id)
      : state.collected.includes(entity.id);
}

export function nextDiscoveryClue(world: WorldDefinition, state: PlayState, awaitingAmendedGoal = false) {
  const pending = world.gameplay?.clues?.filter((clue) => {
    const entity = world.entities.find((item) => item.id === clue.entityId);
    return entity && !discoveryResolved(entity, state, awaitingAmendedGoal);
  });
  // Destination clues never trap unfinished action clues behind them after a
  // creator edit; preserve the authored order among the remaining actions.
  return (
    pending?.find(
      (clue) =>
        world.entities.find((entity) => entity.id === clue.entityId)?.kind !==
        "goal",
    ) ?? pending?.[0]
  );
}

/** Optional image details remain optional. Only the authored sequence and
 * explicit destination prerequisites constrain progression. */
export function canDiscover(
  world: WorldDefinition,
  state: PlayState,
  id: string,
  awaitingAmendedGoal = false,
): boolean {
  if (
    world.gameplay?.movement !== "discover" ||
    (state.completed && !state.exploring)
  )
    return false;
  const entity = world.entities.find((item) => item.id === id);
  if (
    !entity ||
    !["coin", "lever", "goal"].includes(entity.kind) ||
    discoveryResolved(entity, state, awaitingAmendedGoal)
  )
    return false;
  const next = nextDiscoveryClue(world, state, awaitingAmendedGoal);
  const ordered = world.gameplay.clues?.some((clue) => clue.entityId === id);
  if (next && next.entityId !== id) {
    const nextIsGoal =
      world.entities.find((item) => item.id === next.entityId)?.kind === "goal";
    if (entity.kind === "goal" ? !nextIsGoal : ordered) return false;
  }
  return entity.kind !== "goal" || goalProgress(world, state).ready;
}
