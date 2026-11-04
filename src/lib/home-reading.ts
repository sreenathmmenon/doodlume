import type { WorldDefinition, WorldEntity } from "../../shared/world";

export type ReadBox = { id: string; name: string; verb: string; x: number; y: number; w: number; h: number };
export type ReadRelation = { from: string; to: string; label: string };
export type RuleSentence = { id: string; subject: string; object: string; verbs: { label: string; actionIds: string[] }[] };
export type CountBeat = { title: string; note: string; entityIds: string[] };

const POSITIONAL = new Set(["left", "right", "middle", "mid", "center", "centre", "top", "bottom", "upper", "lower", "front", "back", "first", "second", "third"]);
const MAX_BOXES = 6;
const MAX_SENTENCES = 3;

const actionsOf = (world: WorldDefinition) => world.interactions?.actions ?? [];
const area = (e: WorldEntity) => e.width * e.height;
const entityName = (e: WorldEntity) => e.label?.trim() || e.id;
const firstWord = (label: string) => label.trim().split(/\s+/)[0]?.toLowerCase() ?? "";

function isBackdrop(world: WorldDefinition, e: WorldEntity) {
  return /source|backdrop/i.test(e.id) || e.width >= world.width * 0.9 || e.height >= world.height * 0.9;
}

function visibleEntities(world: WorldDefinition) {
  return world.entities.filter(e => !isBackdrop(world, e));
}

function thirdPerson(verb: string) {
  if (/(s|sh|ch|x|z)$/.test(verb)) return `${verb}es`;
  if (/[^aeiou]y$/.test(verb)) return `${verb.slice(0, -1)}ies`;
  return `${verb}s`;
}

function plural(noun: string) {
  return /[^aeiou]y$/.test(noun) ? `${noun.slice(0, -1)}ies` : /(s|sh|ch|x|z)$/.test(noun) ? `${noun}es` : `${noun}s`;
}

function noun(e: WorldEntity) {
  const words = entityName(e).toLowerCase().split(/\s+/);
  while (words.length > 1 && POSITIONAL.has(words[0])) words.shift();
  return words.join(" ");
}

function verbFor(world: WorldDefinition, e: WorldEntity) {
  const actions = actionsOf(world);
  const asTool = actions.find(a => a.toolId === e.id);
  if (asTool) return thirdPerson(firstWord(asTool.label));
  const asTarget = actions.find(a => a.targetId === e.id);
  if (asTarget) {
    if (asTarget.kind === "attach") return "can wear it";
    const lead = firstWord(asTarget.label);
    return lead === "water" ? "is thirsty" : lead === "power" ? "needs power" : "is the target";
  }
  const byKind: Partial<Record<WorldEntity["kind"], string>> = {
    player: "is you", coin: "is wanted", goal: "is the goal", bridge: "reaches", terrain: "holds you up", decoration: "is a place",
  };
  return byKind[e.kind] ?? "is a place";
}

function priority(world: WorldDefinition, e: WorldEntity) {
  const actions = actionsOf(world);
  if (e.kind === "player") return 0;
  if (e.kind === "goal") return 1;
  if (e.kind === "coin") return 2;
  if (actions.some(a => a.toolId === e.id)) return 3;
  if (actions.some(a => a.targetId === e.id)) return 4;
  if (e.kind === "bridge") return 5;
  return e.kind === "decoration" ? 7 : 6;
}

const percent = (value: number, total: number) => Math.round(Math.min(100, Math.max(0, (value / total) * 100)) * 100) / 100;

export function readBoxes(world: WorldDefinition): ReadBox[] {
  return visibleEntities(world)
    .map((e, index) => ({ e, index, tier: priority(world, e) }))
    .sort((a, b) => a.tier - b.tier || (a.tier >= 6 ? area(b.e) - area(a.e) : 0) || a.index - b.index)
    .slice(0, MAX_BOXES)
    .map(({ e }) => {
      const x = percent(e.x, world.width);
      const y = percent(e.y, world.height);
      return {
        id: e.id,
        name: entityName(e),
        verb: verbFor(world, e),
        x,
        y,
        w: Math.min(percent(e.width, world.width), 100 - x),
        h: Math.min(percent(e.height, world.height), 100 - y),
      };
    });
}

export function readRelations(world: WorldDefinition): ReadRelation[] {
  const ids = new Set(visibleEntities(world).map(e => e.id));
  const seen = new Set<string>();
  const relations: ReadRelation[] = [];
  for (const a of actionsOf(world)) {
    const key = `${a.toolId}\n${a.targetId}`;
    if (!ids.has(a.toolId) || !ids.has(a.targetId) || seen.has(key)) continue;
    seen.add(key);
    relations.push({ from: a.toolId, to: a.targetId, label: firstWord(a.label) });
  }
  return relations;
}

export function ruleSentences(world: WorldDefinition): RuleSentence[] {
  const visible = new Map(visibleEntities(world).map(e => [e.id, e]));
  const groups = new Map<string, { object: string; subject: string; tools: Set<string>; verbs: Map<string, string[]> }>();
  for (const a of actionsOf(world)) {
    const tool = visible.get(a.toolId);
    const target = visible.get(a.targetId);
    if (!tool || !target) continue;
    const subject = noun(tool);
    const object = noun(target);
    const group = groups.get(`${subject}\n${object}`) ?? { subject, object, tools: new Set<string>(), verbs: new Map<string, string[]>() };
    group.tools.add(tool.id);
    const verb = firstWord(a.label);
    group.verbs.set(verb, [...(group.verbs.get(verb) ?? []), a.id]);
    groups.set(`${subject}\n${object}`, group);
  }
  return [...groups.values()].slice(0, MAX_SENTENCES).map(({ subject, object, tools, verbs }) => {
    const plain = tools.size > 1 ? plural(subject) : subject;
    const [first] = verbs.keys();
    return {
      id: `${plain}-${object}`.replace(/\s+/g, "-"),
      subject: plain,
      object,
      verbs: [
        { label: `can't ${first}`, actionIds: [] },
        ...[...verbs].map(([verb, actionIds]) => ({ label: `can ${verb}`, actionIds })),
      ],
    };
  });
}

export function countBeats(world: WorldDefinition): CountBeat[] {
  const visible = visibleEntities(world);
  const first = (kind: WorldEntity["kind"]) => visible.find(e => e.kind === kind);
  const player = first("player");
  const want = first("coin") ?? first("goal");
  const bridge = first("bridge");
  const name = (e: WorldEntity) => entityName(e).toLowerCase();
  const beats: CountBeat[] = [];
  if (player && want) beats.push({ title: `The ${name(player)} wants the ${name(want)}.`, note: "A need.", entityIds: [player.id, want.id] });
  if (want) beats.push({ title: `The ${name(want)} is somewhere else.`, note: "A goal.", entityIds: [want.id] });
  if (bridge) beats.push({ title: `The ${name(bridge)} gets a job.`, note: "A way.", entityIds: [bridge.id] });
  return beats;
}

export function goalTitle(world: WorldDefinition): string {
  return world.gameplay?.objectiveTitle ?? world.name;
}
