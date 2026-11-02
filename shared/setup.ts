import { validateWorld, movementMode, type WorldDefinition } from "./world.js";
import { reviewGoalRules } from "./recognition-review.js";

export function setupFeedback(world: WorldDefinition) {
  const errors: string[] = [],
    warnings: string[] = [];
  const mode = movementMode(world);
  const characters = world.entities.filter((e) => e.kind === "player");
  if (mode !== "discover" && !characters.length)
    errors.push(
      "Choose one recognizable character in the original picture and give it the Character role.",
    );
  else if (mode !== "discover" && characters.length > 1)
    errors.push(
      "Keep one Character. Change the other characters to Scenery, or remove those selections.",
    );
  if (mode === "platform" && !world.entities.some((e) => e.kind === "terrain" || e.kind === "bridge"))
    errors.push(
      "Mark a visible surface as Platform or Bridge, or add a platform to the game.",
    );
  for (const entity of world.entities) {
    if (
      entity.kind === "lever" &&
      ((mode === "platform" && !entity.targetId) ||
       (entity.targetId !== undefined && !world.entities.some(
        (gate) => gate.kind === "gate" && gate.id === entity.targetId,
      )))
    )
      errors.push(
        `Choose the gate opened by “${entity.label || "Switch"}” in its object settings, or change its role.`,
      );
  }
  errors.push(...reviewGoalRules(world.goalRules, world.entities).issues);
  try {
    validateWorld(world);
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "Check the objects in this world.";
    // The actionable role/connection notes above replace the broad contract
    // errors; every other schema failure remains a blocker.
    if (
      !(
        [
          "Choose one character and include some ground to stand on.",
          "A lever needs a clear connection to a gate in this world.",
        ].includes(message) && errors.length
      )
    )
      errors.push(message);
  }
  if (world.entities.length > 160)
    errors.push("Keep this world to 160 objects or fewer.");
  if (
    world.entities.some(
      (e) => e.x + e.width > world.width || e.y + e.height > world.height,
    )
  )
    errors.push("Keep every object inside the game frame.");
  const hero = world.entities.find((e) => e.kind === "player");
  if (hero && mode !== "discover") {
    const body = {
      x: hero.x + hero.width * 0.17,
      y: hero.y + hero.height * 0.24,
      width: hero.width * 0.66,
      height: hero.height * 0.69,
    };
    const solids = world.entities.filter((e) =>
      ["terrain", "bridge", "gate"].includes(e.kind),
    );
    if (
      solids.some(
        (e) =>
          Math.min(body.x + body.width, e.x + e.width) - Math.max(body.x, e.x) >
            3 &&
          Math.min(body.y + body.height, e.y + e.height) -
            Math.max(body.y, e.y) >
            3,
      )
    )
      errors.push(
        "Move the character out of the ground, bridge or closed gate before starting.",
      );
    if (
      mode === "platform" && !solids.some(
        (e) =>
          e.x < body.x + body.width &&
          e.x + e.width > body.x &&
          e.y >= body.y + body.height - 3,
      )
    )
      warnings.push(
        "There is no surface below your character. Add or move a platform to catch them.",
      );
    if (hero.height > 200 || hero.width > 220)
      warnings.push(
        "Your character is large for this stage. A smaller size leaves more room to explore.",
      );
  }
  if (!world.entities.some((e) => e.kind === "goal"))
    warnings.push(
      "There is no destination yet. You can explore, or add somewhere to finish.",
    );
  warnings.push(mode === "discover"
    ? "Play the clues to check that each target is clear in the original image."
    : mode === "roam"
      ? "Explore the scene to check that each required object and destination is reachable."
      : "This checks placement, not the whole route. Play the world to check which jumps and paths work.");
  return { errors, warnings };
}
