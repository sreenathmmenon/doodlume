import { interactionState, validateInteractions, type InteractionPlan, type InteractionState } from "./interactions.js";
import {
  validatePngArtwork,
  artworkRasterSize,
  MAX_WORLD_ARTWORK_PIXELS,
} from "./artwork-validation.js";
export type EntityKind =
  | "player"
  | "terrain"
  | "bridge"
  | "coin"
  | "lever"
  | "gate"
  | "goal"
  | "decoration";
export type Theme = "grove" | "moon" | "sunset";
export type InputKind = "drawing" | "picture";
export interface ArtworkBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface WorldEntity {
  id: string;
  kind: EntityKind;
  x: number;
  y: number;
  width: number;
  height: number;
  art?: string;
  artMethod?: "sam" | "paper" | "crop";
  artNote?: string;
  artSource?: ArtworkBox;
  /** Original collider placement before a source object became an editable layer. */
  sourceLayer?: ArtworkBox;
  /** Original collision bounds, independent from the complete source artwork. */
  sourcePlacement?: ArtworkBox;
  artShape?: "box" | "ellipse";
  targetId?: string;
  label?: string;
}

/** Creator-selected prerequisites shared by this world's destinations. */
export interface GoalRules {
  requiredCollectedIds: string[];
  requiredActivatedIds: string[];
  requiredInteractionIds?: string[];
  /** Referenced resource objects must be full at the same time. */
  requiredResourceIds?: string[];
}

export interface WorldGameplay {
  movement: "platform" | "roam" | "discover";
  /** Authored platform jump velocity relative to the default; source geometry stays intact. */
  jumpStrength?: number;
  objectiveTitle: string;
  instructions: string;
  clues?: { entityId: string; text: string }[];
}

export function movementMode(world: Pick<WorldDefinition, "gameplay">) {
  return world.gameplay?.movement ?? "platform";
}

export interface WorldDefinition {
  id: string;
  name: string;
  description: string;
  theme: Theme;
  width: number;
  height: number;
  source: "example" | "meta" | "manual";
  exampleId?: string;
  inputKind?: InputKind;
  sourceImage: string;
  entities: WorldEntity[];
  goalRules?: GoalRules;
  gameplay?: WorldGameplay;
  interactions?: InteractionPlan;
  revision: number;
}

export interface PlayState {
  player: { x: number; y: number } | null;
  velocity?: { x: number; y: number };
  facingLeft?: boolean;
  collected: string[];
  activated: string[];
  completed: boolean;
  exploring?: boolean;
  interactions?: InteractionState;
}

export const emptyPlayState = (): PlayState => ({
  player: null,
  collected: [],
  activated: [],
  completed: false,
});

export function validateWorld(value: unknown, options: { allowIncomplete?: boolean } = {}): WorldDefinition {
  if (!value || typeof value !== "object")
    throw new Error("This drawing did not produce a usable world.");
  const w = value as WorldDefinition;
  if (
    typeof w.id !== "string" ||
    !/^[\w-]{1,80}$/.test(w.id) ||
    !["example", "meta", "manual"].includes(w.source) ||
    (w.exampleId !== undefined &&
      (typeof w.exampleId !== "string" ||
        !/^[\w-]{1,80}$/.test(w.exampleId))) ||
    (w.inputKind !== undefined &&
      !["drawing", "picture"].includes(w.inputKind)) ||
    typeof w.description !== "string" ||
    w.description.length > 500 ||
    !Number.isInteger(w.revision) ||
    w.revision < 1
  )
    throw new Error("This world could not be opened.");
  if (
    typeof w.sourceImage !== "string" ||
    (!w.sourceImage.startsWith("/art/") &&
      !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(w.sourceImage))
  )
    throw new Error("This world has no usable source drawing.");
  let artworkPixels = 0;
  if (w.sourceImage.startsWith("data:")) {
    const image = validatePngArtwork(w.sourceImage);
    artworkPixels += image.width * image.height;
  }
  if (typeof w.name !== "string" || !w.name.trim() || w.name.length > 80)
    throw new Error("Your world needs a short name.");
  if (!["grove", "moon", "sunset"].includes(w.theme))
    throw new Error("Unsupported world palette.");
  if (
    !Number.isInteger(w.width) ||
    w.width < 1440 ||
    w.width > 12000 ||
    !Number.isInteger(w.height) ||
    w.height < 820 ||
    w.height > 5000 ||
    !Array.isArray(w.entities) ||
    w.entities.length > 160
  )
    throw new Error("The drawing is too complex for this world.");
  if (w.gameplay !== undefined) {
    const g = w.gameplay;
    if (!g || typeof g !== "object" || Array.isArray(g) ||
        !["platform", "roam", "discover"].includes(g.movement) ||
        (g.jumpStrength !== undefined && (g.movement !== "platform" || !Number.isFinite(g.jumpStrength) || g.jumpStrength < 1 || g.jumpStrength > 1.6)) ||
        typeof g.objectiveTitle !== "string" || !g.objectiveTitle.trim() || g.objectiveTitle.length > 100 ||
        typeof g.instructions !== "string" || !g.instructions.trim() || g.instructions.length > 180 ||
        (g.clues !== undefined && (!Array.isArray(g.clues) || g.clues.length > 24)) ||
        (g.movement === "discover" && !w.interactions && (!Array.isArray(g.clues) || !g.clues.length)))
      throw new Error("This world's game instructions are incomplete.");
  }
  const allowed: EntityKind[] = [
    "player",
    "terrain",
    "bridge",
    "coin",
    "lever",
    "gate",
    "goal",
    "decoration",
  ];
  const ids = new Set<string>();
  for (const entity of w.entities) {
    if (!entity || typeof entity !== "object")
      throw new Error("An object in this drawing could not be read.");
    if (
      typeof entity.id !== "string" ||
      !/^[\w-]{1,60}$/.test(entity.id) ||
      ids.has(entity.id)
    )
      throw new Error("Some objects could not be identified clearly.");
    ids.add(entity.id);
    if (!allowed.includes(entity.kind))
      throw new Error("This drawing contains an unsupported object role.");
    if (
      entity.label !== undefined &&
      (typeof entity.label !== "string" || entity.label.length > 120)
    )
      throw new Error(
        "Object names must be text with 120 characters or fewer.",
      );
    if (
      ![entity.x, entity.y, entity.width, entity.height].every(
        Number.isFinite,
      ) ||
      entity.width < 4 ||
      entity.height < 4 ||
      entity.width > w.width + 20 ||
      entity.height > w.height + 20 ||
      entity.x < -20 ||
      entity.x > w.width ||
      entity.y < -20 ||
      entity.y > w.height
    )
      throw new Error("An object falls outside the usable page.");
    if (
      entity.art !== undefined &&
      (typeof entity.art !== "string" ||
        !entity.art.length ||
        (!entity.art.startsWith("/art/") &&
          !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(entity.art)))
    )
      throw new Error("Unsupported artwork format.");
    if (entity.art) {
      const image = entity.art.startsWith("data:")
        ? validatePngArtwork(entity.art)
        : entity.art.endsWith(".svg")
          ? artworkRasterSize(entity.width, entity.height)
          : null;
      if (image) artworkPixels += image.width * image.height;
      if (artworkPixels > MAX_WORLD_ARTWORK_PIXELS)
        throw new Error(
          "This world's artwork is too large to open. Use smaller source crops or fewer high-resolution objects.",
        );
    }
    if (
      (entity.artMethod !== undefined &&
        !["sam", "paper", "crop"].includes(entity.artMethod)) ||
      (entity.artNote !== undefined &&
        (typeof entity.artNote !== "string" || entity.artNote.length > 200))
    )
      throw new Error("Unsupported artwork extraction details.");
    if (entity.artSource) {
      const b = entity.artSource;
      if (
        ![b.x, b.y, b.width, b.height].every(Number.isFinite) ||
        b.x < 0 ||
        b.y < 0 ||
        b.width <= 0 ||
        b.height <= 0 ||
        b.x + b.width > 1001 ||
        b.y + b.height > 1001
      )
        throw new Error(
          "An artwork selection falls outside the source picture.",
        );
    }
    for (const b of [entity.sourceLayer, entity.sourcePlacement].filter(Boolean) as ArtworkBox[]) {
      if (!entity.artSource || (entity.sourceLayer && !entity.art) || ![b.x, b.y, b.width, b.height].every(Number.isFinite) ||
          b.x < -20 || b.y < -20 || b.x > w.width || b.y > w.height || b.width < 4 || b.height < 4 ||
          b.width > w.width + 20 || b.height > w.height + 20)
        throw new Error("This edited source object has no valid original artwork placement.");
    }
    if (
      entity.artShape !== undefined &&
      !["box", "ellipse"].includes(entity.artShape)
    )
      throw new Error("Unsupported selection shape.");
  }
  const mode = movementMode(w);
  const characters = w.entities.filter((e) => e.kind === "player").length;
  if (!options.allowIncomplete && (mode === "discover" ? characters !== 0 : characters !== 1))
    throw new Error(mode === "discover"
      ? "Discovery uses the original image directly, without a separate character."
      : "Choose one character and include some ground to stand on.");
  if (!options.allowIncomplete && mode === "platform" && !w.entities.some((e) => ["terrain", "bridge"].includes(e.kind)))
    throw new Error("Choose one character and include some ground to stand on.");
  if (w.gameplay?.clues) {
    const targets = new Set<string>();
    for (const clue of w.gameplay.clues) {
      if (!clue || typeof clue !== "object" || typeof clue.entityId !== "string" ||
          targets.has(clue.entityId) || typeof clue.text !== "string" || !clue.text.trim() || clue.text.length > 160 ||
          !w.entities.some(e => e.id === clue.entityId && ["coin", "lever", "goal"].includes(e.kind)))
        throw new Error("A discovery clue needs one distinct visible object and a short instruction.");
      targets.add(clue.entityId);
    }
  }
  for (const entity of w.entities.filter((e) => e.kind === "lever" && !options.allowIncomplete)) {
    if (
      (mode === "platform" && !entity.targetId) ||
      (entity.targetId !== undefined && !w.entities.some((e) => e.id === entity.targetId && e.kind === "gate"))
    )
      throw new Error(
        "A lever needs a clear connection to a gate in this world.",
      );
  }
  if (w.goalRules !== undefined) {
    const rules = w.goalRules;
    if (!rules || typeof rules !== "object" || Array.isArray(rules))
      throw new Error("Choose valid destination requirements.");
    for (const [key, kind] of [
      ["requiredCollectedIds", "coin"],
      ["requiredActivatedIds", "lever"],
    ] as const) {
      const selected = rules[key];
      if (
        !Array.isArray(selected) ||
        selected.length > 160 ||
        selected.some((id) => typeof id !== "string") ||
        new Set(selected).size !== selected.length ||
        selected.some(
          (id) => !w.entities.some((e) => e.id === id && e.kind === kind),
        )
      )
        throw new Error(
          "A destination requirement refers to a missing, repeated or incorrect object.",
        );
    }
    if (
      !options.allowIncomplete && (rules.requiredCollectedIds.length ||
        rules.requiredActivatedIds.length) &&
      !w.entities.some((e) => e.kind === "goal")
    )
      throw new Error("Add a destination before choosing its requirements.");
  }
  if (!options.allowIncomplete && mode === "discover" && w.goalRules) {
    const clued = new Set(w.gameplay?.clues?.map(clue => clue.entityId));
    if ([...w.goalRules.requiredCollectedIds, ...w.goalRules.requiredActivatedIds].some(id => !clued.has(id)))
      throw new Error("Add a discovery clue for each required object before applying these rules.");
  }
  validateInteractions(w, {allowUnpreparedArtwork: options.allowIncomplete});
  return w;
}

/** Keeps discovery order and finishing requirements in sync when the creator edits them. */
export function withGoalRules(world: WorldDefinition, rules: GoalRules, clueTexts: Record<string, string> = {}) {
  if (movementMode(world) !== "discover" || world.interactions) return validateWorld({ ...world, goalRules: structuredClone(rules) });
  const required = [...rules.requiredCollectedIds, ...rules.requiredActivatedIds];
  const old = world.gameplay!.clues ?? [];
  const ordered = [
    ...old.filter(clue => required.includes(clue.entityId)).map(clue => clue.entityId),
    ...required.filter(id => !old.some(clue => clue.entityId === id)),
  ];
  const clues = ordered.map(entityId => ({
    entityId,
    text: (clueTexts[entityId] ?? old.find(clue => clue.entityId === entityId)?.text ?? `Find ${objectiveObjectLabel(world, entityId)}.`).trim(),
  }));
  const destination = old.find(clue => world.entities.some(entity => entity.id === clue.entityId && entity.kind === "goal"))?.entityId
    ?? world.entities.find(entity => entity.kind === "goal")?.id;
  if (destination) clues.push({entityId: destination, text: (clueTexts[destination] ?? old.find(clue => clue.entityId === destination)?.text ?? `Finish at ${objectiveObjectLabel(world, destination)}.`).trim()});
  return validateWorld({ ...world, goalRules: structuredClone(rules), gameplay: { ...world.gameplay!, clues } });
}

export function objectiveObjectLabel(
  world: WorldDefinition,
  id: string,
): string {
  const entity = world.entities.find((e) => e.id === id);
  if (!entity) return id;
  const label =
    typeof entity.label === "string" ? entity.label.trim().slice(0, 70) : "";
  if (label) return label;
  const peers = world.entities.filter((e) => e.kind === entity.kind);
  return `${entity.kind === "coin" ? "Collectible" : "Lever"} ${peers.findIndex((e) => e.id === id) + 1}`;
}

/** Optional objects never block a goal. An earned completion remains earned. */
export function goalProgress(world: WorldDefinition, state: PlayState) {
  const missingCollectedIds = (
    world.goalRules?.requiredCollectedIds ?? []
  ).filter((id) => !state.collected.includes(id));
  const missingActivatedIds = (
    world.goalRules?.requiredActivatedIds ?? []
  ).filter((id) => !state.activated.includes(id));
  const interactionProgress = interactionState(world, state);
  const missingInteractionIds = (world.goalRules?.requiredInteractionIds ?? []).filter(id => !interactionProgress.completed.includes(id));
  const missingResourceIds = (world.goalRules?.requiredResourceIds ?? []).filter(id => {
    const resource = world.interactions?.objects.find(object => object.entityId === id)?.resource;
    return !resource || (interactionProgress.quantities[id] ?? 0) < resource.capacity;
  });
  const total =
    (world.goalRules?.requiredResourceIds?.length ?? 0) +
    (world.goalRules?.requiredInteractionIds?.length ?? 0) +
    (world.goalRules?.requiredCollectedIds.length ?? 0) +
    (world.goalRules?.requiredActivatedIds.length ?? 0);
  const remaining = missingCollectedIds.length + missingActivatedIds.length + missingInteractionIds.length + missingResourceIds.length;
  const actions = [
    ...missingResourceIds.map(id => `fill ${objectiveObjectLabel(world, id)}`),
    ...missingInteractionIds.map(id => world.interactions?.actions.find(action => action.id === id)?.label ?? id),
    ...missingCollectedIds.map(
      (id) => `collect ${objectiveObjectLabel(world, id)}`,
    ),
    ...missingActivatedIds.map(
      (id) => `activate ${objectiveObjectLabel(world, id)}`,
    ),
  ];
  const detail = actions.slice(0, 2).join(" and ");
  const hasDestination = world.entities.some(e => e.kind === "goal");
  const hint = remaining
    ? `${hasDestination ? "Before the destination" : "Next"}: ${detail}${remaining > 2 ? `, plus ${remaining - 2} more` : ""}.`
    : total
      ? hasDestination ? "Requirements complete. Reach a destination." : "All tasks complete."
      : world.entities.some((e) => e.kind === "goal")
        ? "Reach a destination. Collectibles are optional."
        : "Explore this world. Add a destination in Edit world to give it a finish.";
  return {
    ready: remaining === 0,
    done: total - remaining,
    total,
    missingCollectedIds,
    missingActivatedIds,
    missingInteractionIds,
    missingResourceIds,
    hint,
  };
}

export function retainPlayState(
  world: WorldDefinition,
  state: PlayState,
): PlayState {
  const collectibleIds = new Set(
    world.entities.filter((e) => e.kind === "coin").map((e) => e.id),
  );
  const leverIds = new Set(
    world.entities.filter((e) => e.kind === "lever").map((e) => e.id),
  );
  const retained: PlayState = {
    ...state,
    collected: [
      ...new Set(state.collected.filter((id) => collectibleIds.has(id))),
    ],
    activated: [...new Set(state.activated.filter((id) => leverIds.has(id)))],
    ...(world.interactions ? { interactions: interactionState(world, state) } : state.interactions ? { interactions: undefined } : {}),
  };
  if (retained.completed && !goalProgress(world, retained).ready) retained.exploring = true;
  return retained;
}

/** Continue the earned world without clearing its completed achievement or discoveries. */
export function continueExploration(state: PlayState): PlayState {
  return { ...structuredClone(state), exploring: true };
}
