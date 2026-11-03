import { sourceScenery, SOURCE_SCENERY_NOTE } from "./source-scenery.js";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { cropArtwork, imageData } from "./images.js";
import { extractArtwork, segmentationConfigured, type SegmentationConnection } from "./segmentation.js";
import type { SourceSelection, GameplayPlan } from "./creative-adaptation.js";
import type { GoalRules, InputKind, WorldDefinition, WorldEntity } from "../shared/world.js";
import { setupFeedback } from "../shared/setup.js";

interface Options {
  source: Buffer;
  inputKind: InputKind;
  name: string;
  description: string;
  theme: WorldDefinition["theme"];
  objects: SourceSelection[];
  plan: GameplayPlan;
  segmentation: SegmentationConnection;
  signal: AbortSignal;
  transport: typeof fetch;
  requested: GoalRules;
  onReject?: (reason: string) => void;
  finishRules: (entities: WorldEntity[], defaults: GoalRules) => GoalRules;
}
type Surface = WorldEntity & { kind: "terrain" | "bridge" };
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const center = (entity: WorldEntity) => entity.x + entity.width / 2;
const overlaps = (a: { x: number; y: number; width: number; height: number }, b: WorldEntity) =>
  Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x) > 2 &&
  Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y) > 2;

/** Assemble a genuine source scene. Source surfaces determine the layout; the
 * semantic waypoint list chooses the start, never replaces their geometry.
 * A null result means the bounded scene could not be verified and the caller
 * must use its explicitly introduced adaptation instead of claiming fidelity.
 */
export async function sourcePlatformScene(options: Options): Promise<WorldDefinition | null> {
  const { source, plan, signal, inputKind } = options;
  const reject = (reason: string): null => { options.onReject?.(reason); return null; };
  const actor = options.objects.find(object => object.id === plan.avatarId) ??
    (options.objects.filter(object => object.kind === "player").length === 1 ? options.objects.find(object => object.kind === "player") : undefined);
  const sourceSurfaces = options.objects.filter(object => ["terrain", "bridge"].includes(object.kind));
  if (!actor || sourceSurfaces.length < 2) return reject("A source-aligned adventure needs a complete character and at least two recognized walkable surfaces.");
  const size = await sharp(source).metadata();
  const scale = Math.max(1440 / size.width!, 820 / size.height!);
  const width = Math.round(size.width! * scale), height = Math.round(size.height! * scale);
  // Very tall/very wide pages still have the clearly introduced adaptation;
  // do not distort their source geometry to squeeze into the physics bounds.
  if (width > 12000 || height > 5000) return reject("This image is too tall or wide to preserve its layout within the supported adventure frame.");
  const sx = width / 1000, sy = height / 1000;
  const entities: WorldEntity[] = [], artJobs = new Map<string, SourceSelection>();
  const ids = new Set(options.objects.map(object => object.id));
  const introducedId = (part: string) => {
    let id = `introduced-${part}`;
    while (ids.has(id)) id += "x";
    ids.add(id); return id;
  };
  const fromSource = (object: SourceSelection): WorldEntity => {
    const visual = object.visualBounds ?? object;
    const entity: WorldEntity = {
      id: object.id, kind: object.kind, x: object.x * sx, y: object.y * sy,
      width: Math.max(4, object.width * sx), height: Math.max(4, object.height * sy), label: object.label,
      ...(object.targetId ? { targetId: object.targetId } : {}),
      artSource: { x: visual.x, y: visual.y, width: visual.width, height: visual.height },
      artNote: "Actual source artwork assembled into the playable scene; source selection remains available in the original image.",
    };
    artJobs.set(entity.id, { ...object, x:visual.x, y:visual.y, width:visual.width, height:visual.height }); return entity;
  };
  entities.push({ id: introducedId("source-atmosphere"), kind: "decoration", x: 0, y: 0, width, height,
    art: imageData(source), artMethod: "crop", artSource: { x: 0, y: 0, width: 1000, height: 1000 },
    label: "Original image", artNote: "Full original image used as the world backdrop; generated gameplay is separate." });
  const surfaces = sourceSurfaces.map(object => fromSource(object) as Surface).filter(surface => surface.width >= 70 && surface.height >= 8);
  if (surfaces.length < 2) return reject("The recognized surfaces are too narrow for the character to land on.");
  // Source ledges use a one-way landing lip. Keep the complete painted object
  // separate from that collision shape, so editing later moves its underside
  // too without turning it into a tall wall that blocks upward jumps.
  for (const surface of surfaces) {
    surface.height = Math.min(surface.height, 24);
    if (artJobs.get(surface.id)?.visualBounds)
      surface.sourcePlacement = { x:surface.x, y:surface.y, width:surface.width, height:surface.height };
  }
  entities.push(...surfaces);
  const gates = options.objects.filter(object => object.kind === "gate").map(fromSource);
  entities.push(...gates);
  const hero = fromSource(actor); hero.kind = "player";
  const actorScale = Math.min(1, 160 / Math.max(hero.width, hero.height));
  hero.width = Math.max(12, hero.width * actorScale);
  hero.height = Math.max(12, hero.height * actorScale);
  const bodyWidth = hero.width * .66, bodyHeight = hero.height * .69, half = bodyWidth / 2;
  const stance = (surface: Surface, x: number) => ({ x: x - half, y: surface.y - bodyHeight - 1, width: bodyWidth, height: bodyHeight });
  const sourceSolids = () => [...surfaces, ...gates];
  const stanceClear = (surface: Surface, x: number) => sourceSolids().every(solid => solid.id === surface.id || !overlaps(stance(surface, x), solid));
  const landingXs = (surface: Surface) => {
    const left = surface.x + half + 6, right = surface.x + surface.width - half - 6;
    return left <= right ? [left, (left + right) / 2, right] : [];
  };
  // Start beside the actual subject, not an approximate semantic waypoint
  // that can move it to the far end of its own ledge.
  const startPoint = { x: (actor.x + actor.width / 2) * sx, y: (actor.y + actor.height) * sy };
  const starting = surfaces.flatMap(surface => landingXs(surface).filter(x => stanceClear(surface, x)).map(x => ({
    surface, x, score: Math.hypot((x - startPoint.x) * .7, surface.y - startPoint.y),
  }))).sort((a, b) => a.score - b.score)[0];
  if (!starting) return reject("No clear starting position was found on the recognized surfaces. Check that scenery and pillar shafts are not marked as solid platforms.");
  const start = starting.surface;
  const anchors = new Map<string, Surface>();
  const nearestSurface = (x: number, y: number) => [...surfaces].sort((a, b) => {
    const ax = clamp(x, a.x + half + 6, a.x + a.width - half - 6), bx = clamp(x, b.x + half + 6, b.x + b.width - half - 6);
    return Math.hypot((ax - x) * 1.5, a.y - 55 - y) - Math.hypot((bx - x) * 1.5, b.y - 55 - y);
  })[0];
  let unsupportedTarget: string | undefined;
  const placeObject = (object: SourceSelection, _maximum: number) => {
    // Preserve source size and position. Moving a distant coin onto the nearest
    // platform changes the illustration's composition and can merge targets.
    const entity = fromSource(object);
    const originalX = entity.x + entity.width / 2;
    const foot = entity.y + entity.height;
    const canTouchFrom = (candidate: Surface) => {
      if (!landingXs(candidate).length) return false;
      const xs = [...landingXs(candidate), clamp(originalX, candidate.x + half + 6, candidate.x + candidate.width - half - 6)];
      return xs.some(x => {
        if (!stanceClear(candidate, x)) return false;
        for (let step = 0; step <= 24; step++) {
          const t = step / 24 * (2 * 650 / 1450);
          const body = { x: x - half, y: candidate.y - 650 * t + .5 * 1450 * t * t - bodyHeight, width: bodyWidth, height: bodyHeight };
          if (overlaps(body, entity) && sourceSolids().every(solid => solid.id === candidate.id ||
            solid.height <= 40 && solid.kind !== "gate" || !overlaps(body, solid))) return true;
        }
        return false;
      });
    };
    let surface = surfaces.filter(canTouchFrom)
      .sort((a, b) => Math.hypot(center(a) - originalX, a.y - foot) - Math.hypot(center(b) - originalX, b.y - foot))[0];
    if (!surface) {
      const connectorWidth = Math.max(90, bodyWidth + 24);
      let foothold: Surface | undefined;
      for (const below of [0, 24, 52, 84]) for (const shift of [0, -connectorWidth / 2, connectorWidth / 2]) {
        const candidate: Surface = { id: "candidate-target-foothold", kind: "bridge",
          x: clamp(originalX - connectorWidth / 2 + shift, 0, width - connectorWidth),
          y: Math.min(height - 24, foot + below), width: connectorWidth, height: 16,
          label: `Approach ${object.label}`.slice(0, 80),
          artNote: "Introduced foothold beneath an actual source interaction; its original position and artwork are unchanged." };
        if (!foothold && sourceSolids().every(solid => !overlaps(candidate, solid) && !overlaps(stance(candidate, center(candidate)), solid)) && canTouchFrom(candidate)) foothold = candidate;
      }
      if (foothold) {
        foothold.id = introducedId(`foothold-${object.id}`);
        surfaces.push(foothold); entities.push(foothold); surface = foothold;
      } else {
        unsupportedTarget = object.label || object.id;
        surface = nearestSurface(originalX, foot);
      }
    }
    anchors.set(entity.id, surface);
    entities.push(entity); return entity;
  };
  const coins = options.objects.filter(object => object.kind === "coin" && object.id !== actor.id).map(object => placeObject(object, 46));
  const levers = options.objects.filter(object => object.kind === "lever").map(object => placeObject(object, 54));
  // Do not invent a source switch's causal partner or accept an unopenable
  // claimed link as a faithful scene. The introduced adaptation can handle it.
  if (levers.some(lever => !lever.targetId || !gates.some(gate => gate.id === lever.targetId))) return reject("Choose the pictured gate each switch opens, or change its role.");
  const goals = options.objects.filter(object => object.kind === "goal").map(object => {
    const sameSource = coins.find(coin => coin.artSource && Math.abs(coin.artSource.x - object.x) < 2 && Math.abs(coin.artSource.y - object.y) < 2 &&
      Math.abs(coin.artSource.width - object.width) < 2 && Math.abs(coin.artSource.height - object.height) < 2);
    if (sameSource) {
      const goal = fromSource(object); Object.assign(goal, { x: sameSource.x, y: sameSource.y, width: sameSource.width, height: sameSource.height });
      // The same pictured star can be both collectible and finishing location,
      // but must not be rendered twice as two allegedly distinct source items.
      artJobs.delete(goal.id);
      delete goal.artSource;
      goal.artNote = "Introduced finish region at a source collectible; no second pictured object is implied.";
      anchors.set(goal.id, anchors.get(sameSource.id)!); entities.push(goal); return goal;
    }
    return placeObject(object, 92);
  });
  if (!goals.length) {
    const finishSurface = [...surfaces].sort((a, b) => b.x + b.width - a.x - a.width)[0];
    const goal: WorldEntity = { id: introducedId("finish"), kind: "goal", x: finishSurface.x + finishSurface.width - 65,
      y: finishSurface.y - 92, width: 54, height: 92, label: plan.destinationLabel,
      artNote: "Introduced finish marker on a real source surface; not a detected pictured destination." };
    anchors.set(goal.id, finishSurface); goals.push(goal); entities.push(goal);
  }
  if (unsupportedTarget) return reject(`The original position of ${unsupportedTarget} cannot be reached from a clear supporting surface. Adjust its selection or nearby platform.`);
  const goalRules = options.finishRules(entities, {
    requiredCollectedIds: plan.objective === "collect" ? coins.map(coin => coin.id) : [],
    requiredActivatedIds: plan.objective === "activate" ? levers.map(lever => lever.id) : [],
  });
  const jump = (a: Surface, b: Surface, closed: Set<string>, extras: Surface[] = []) => {
    if (a.id === b.id) return true;
    const rise = a.y - b.y;
    if (rise > 132 || b.y - a.y > 420) return false;
    const discriminant = 650 ** 2 - 2 * 1450 * rise;
    if (discriminant <= 0) return false;
    const duration = (650 + Math.sqrt(discriminant)) / 1450;
    const blockers = [...surfaces, ...extras, ...gates.filter(gate => closed.has(gate.id))];
    for (const from of landingXs(a)) for (const to of landingXs(b)) {
      if (Math.abs(to - from) > 310 * Math.max(0, duration - .08)) continue;
      let clear = true;
      for (let step = 1; step < 25 && clear; step++) {
        const t = duration * step / 25, foot = a.y - 650 * t + .5 * 1450 * t * t;
        const body = { x: from + (to - from) * t / duration - half, y: foot - bodyHeight, width: bodyWidth, height: bodyHeight };
        const ascending = -650 + 1450 * t < 0;
        clear = blockers.every(solid => {
          if (solid.height <= 40 && solid.kind !== "gate" && (ascending || foot - 8 > solid.y)) return true;
          return !overlaps(body, solid);
        });
      }
      if (clear) return true;
    }
    return false;
  };
  const reachable = (origin: Surface = start) => {
    const closed = new Set(gates.map(gate => gate.id));
    let reached = new Set<string>(), changed: boolean;
    do {
      reached = new Set([origin.id]);
      const queue = [origin];
      for (let head = 0; head < queue.length; head++) for (const candidate of surfaces)
        if (!reached.has(candidate.id) && jump(queue[head], candidate, closed)) { reached.add(candidate.id); queue.push(candidate); }
      changed = false;
      for (const lever of levers) if (closed.has(lever.targetId!) && reached.has(anchors.get(lever.id)!.id)) { closed.delete(lever.targetId!); changed = true; }
    } while (changed);
    return { reached, closed };
  };
  const requiredIds = new Set([...goalRules.requiredCollectedIds, ...goalRules.requiredActivatedIds]);
  const targets = [...entities.filter(entity => requiredIds.has(entity.id)), ...goals, ...coins.filter(coin => !requiredIds.has(coin.id))];
  // Check return routes too: a collectible on a one-way drop must not strand
  // the player with the other required objects or the finish still unreachable.
  const missionOrigins = () => [start, ...entities.filter(entity => requiredIds.has(entity.id)).map(entity => anchors.get(entity.id)!)];
  const missingConnection = () => {
    for (const origin of missionOrigins()) {
      const route = reachable(origin);
      const target = targets.find(entity => !route.reached.has(anchors.get(entity.id)!.id));
      if (target) return { route, target };
    }
  };
  for (let count = 0; count < 16; count++) {
    signal.throwIfAborted();
    const missing = missingConnection();
    if (!missing) break;
    const { target, route } = missing;
    const destination = anchors.get(target.id)!;
    const distance = (surface: Surface) => Math.abs(center(surface) - center(destination)) * .7 + Math.abs(surface.y - destination.y) * 1.4;
    let best: { surface: Surface; score: number } | undefined;
    const connectorWidth = Math.max(80, bodyWidth + 24);
    for (const origin of surfaces.filter(surface => route.reached.has(surface.id))) {
      for (const dx of [-220, -160, -100, 0, 100, 160, 220]) for (const dy of [-100, -75, -45, 0, 75]) {
        const x = clamp(center(origin) + dx, connectorWidth / 2 + 8, width - connectorWidth / 2 - 8);
        const y = origin.y + dy;
        if (y < bodyHeight + 30 || y > height - 30) continue;
        const candidate: Surface = { id: "candidate-connector", kind: "bridge", x: x - connectorWidth / 2, y, width: connectorWidth, height: 16 };
        if (!sourceSolids().every(solid => !overlaps(candidate, solid) && !overlaps(stance(candidate, x), solid))) continue;
        if (!jump(origin, candidate, route.closed, [candidate])) continue;
        const gain = distance(origin) - distance(candidate);
        const linksTarget = jump(candidate, destination, route.closed, [candidate]);
        if (!linksTarget && gain < 24) continue;
        const score = (linksTarget ? 10_000 : 0) + gain - Math.abs(dx) * .08;
        if (!best || score > best.score) best = { surface: candidate, score };
      }
    }
    if (!best) return reject(`The original route cannot yet reach ${target.label || "a required object"}. Check its supporting surface and any blocking scenery.`);
    const connector = best.surface;
    connector.id = introducedId(`connector-${count + 1}`);
    connector.label = `Connection toward ${target.label || "the next source surface"}`.slice(0, 80);
    connector.artNote = "Introduced connector between real source surfaces after a bounded jump-clearance check; not detected source artwork.";
    surfaces.push(connector); entities.push(connector);
  }
  if (missingConnection()) return reject("The original route needs too many added connections to preserve its composition. Adjust the source platforms before playing.");
  const spawnCandidates = [...surfaces].sort((a,b) => Math.hypot(center(a)-startPoint.x,a.y-startPoint.y) - Math.hypot(center(b)-startPoint.x,b.y-startPoint.y));
  let spawn: { surface: Surface; x: number } | undefined;
  for (const surface of spawnCandidates) {
    const positions = Array.from({ length: 21 }, (_, index) => surface.x + half + 8 + (surface.width - bodyWidth - 16) * index / 20)
      .filter(x => stanceClear(surface, x)).filter(x => entities.filter(entity => ["coin", "goal"].includes(entity.kind)).every(entity => !overlaps(stance(surface, x), entity)))
      .sort((a,b) => Math.abs(a - startPoint.x) - Math.abs(b - startPoint.x));
    if (!positions.length) continue;
    const route = reachable(surface);
    if (targets.some(entity => !route.reached.has(anchors.get(entity.id)!.id))) continue;
    spawn = { surface, x: positions[0] }; break;
  }
  if (!spawn) return reject("There is no clear reachable starting position outside collectibles and the destination. Move a nearby source selection before playing.");
  hero.x = spawn.x - hero.width / 2;
  hero.y = spawn.surface.y - hero.height * .93 - 2;
  hero.artNote = "Actual source subject scaled proportionally and started on a real source surface; this assembled stage preserves the original separately.";
  entities.push(hero);
  // Stationary objects remain in the backdrop. Moving actors and linked gates
  // are masked out below; a later source-layer edit prepares its own backdrop.
  for (const object of options.objects.filter(object => object.kind === "decoration" && object.id !== actor.id)) entities.push(fromSource(object));
  const world: WorldDefinition = { id: randomUUID(), name: options.name.slice(0, 80), description: options.description.slice(0, 500),
    theme: options.theme, width, height, source: "meta", sourceImage: imageData(source), inputKind, revision: 1, entities, goalRules,
    gameplay: { movement: "platform", objectiveTitle: plan.objectiveTitle, instructions: plan.instructions, clues: plan.clues } };
  const placement = setupFeedback(world);
  if (placement.errors.length) return reject(placement.errors.join(" "));
  for (const entity of entities) {
    const object = artJobs.get(entity.id); if (!object) continue;
    signal.throwIfAborted();
    if (object.artwork) { Object.assign(entity, object.artwork); continue; }
    try { entity.art = await cropArtwork(source, object, inputKind !== "picture"); entity.artMethod = inputKind === "picture" ? "crop" : "paper"; }
    catch { signal.throwIfAborted(); entity.art = await cropArtwork(source, object, false); entity.artMethod = "crop";
      entity.artNote = "Original source crop with its background retained; a precise outline was unavailable."; }
  }
  if (options.segmentation.enabled && segmentationConfigured(options.segmentation)) {
    const sourceArt = entities.filter(entity => artJobs.has(entity.id) && !artJobs.get(entity.id)?.artwork &&
      (entity.kind === "player" || entity.kind === "terrain" || entity.kind === "bridge" ||
        entity.kind === "gate" && entities.some(other => other.kind === "lever" && other.targetId === entity.id)));
    const artwork = await extractArtwork(source, sourceArt.map(entity => ({ id: entity.id, ...entity.artSource! })), options.segmentation, signal, options.transport, inputKind);
    for (const entity of sourceArt) Object.assign(entity, artwork.get(entity.id));
  }
  const backdrop = entities[0];
  backdrop.art = await sourceScenery(source, entities);
  backdrop.artNote = SOURCE_SCENERY_NOTE;
  signal.throwIfAborted();
  return world;
}
