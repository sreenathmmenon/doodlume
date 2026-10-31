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
  artShape?: "box" | "ellipse";
  targetId?: string;
  label?: string;
}

export interface WorldDefinition {
  id: string;
  name: string;
  description: string;
  theme: Theme;
  width: number;
  height: number;
  source: "example" | "meta" | "manual";
  inputKind?: InputKind;
  sourceImage: string;
  entities: WorldEntity[];
  revision: number;
}

export interface PlayState {
  player: { x: number; y: number } | null;
  velocity?: { x: number; y: number };
  facingLeft?: boolean;
  collected: string[];
  activated: string[];
  completed: boolean;
}

export const emptyPlayState = (): PlayState => ({
  player: null,
  collected: [],
  activated: [],
  completed: false,
});

export function validateWorld(value: unknown): WorldDefinition {
  if (!value || typeof value !== "object")
    throw new Error("This drawing did not produce a usable world.");
  const w = value as WorldDefinition;
  if (
    typeof w.id !== "string" ||
    !/^[\w-]{1,80}$/.test(w.id) ||
    !["example", "meta", "manual"].includes(w.source) ||
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
  if (typeof w.name !== "string" || !w.name.trim() || w.name.length > 80)
    throw new Error("Your world needs a short name.");
  if (!["grove", "moon", "sunset"].includes(w.theme))
    throw new Error("Unsupported world palette.");
  if (
    w.width !== 1440 ||
    w.height !== 820 ||
    !Array.isArray(w.entities) ||
    w.entities.length > 40
  )
    throw new Error("The drawing is too complex for this world.");
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
      ![entity.x, entity.y, entity.width, entity.height].every(
        Number.isFinite,
      ) ||
      entity.width < 4 ||
      entity.height < 4 ||
      entity.width > 1600 ||
      entity.height > 900 ||
      entity.x < -20 ||
      entity.x > 1440 ||
      entity.y < -20 ||
      entity.y > 820
    )
      throw new Error("An object falls outside the usable page.");
    if (
      entity.art &&
      !entity.art.startsWith("/art/") &&
      !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(entity.art)
    )
      throw new Error("Unsupported artwork format.");
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
    if (
      entity.artShape !== undefined &&
      !["box", "ellipse"].includes(entity.artShape)
    )
      throw new Error("Unsupported selection shape.");
  }
  if (
    w.entities.filter((e) => e.kind === "player").length !== 1 ||
    !w.entities.some((e) => ["terrain", "bridge"].includes(e.kind))
  )
    throw new Error(
      "Choose one character and include some ground to stand on.",
    );
  for (const entity of w.entities.filter((e) => e.kind === "lever")) {
    if (
      !entity.targetId ||
      !w.entities.some((e) => e.id === entity.targetId && e.kind === "gate")
    )
      throw new Error(
        "A lever needs a clear connection to a gate in this world.",
      );
  }
  return w;
}

export function retainPlayState(
  world: WorldDefinition,
  state: PlayState,
): PlayState {
  const ids = new Set(world.entities.map((e) => e.id));
  return {
    ...state,
    collected: state.collected.filter((id) => ids.has(id)),
    activated: state.activated.filter((id) => ids.has(id)),
  };
}
