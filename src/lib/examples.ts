import { validateWorld, type WorldDefinition, type WorldEntity } from "../../shared/world";

import rooftopRun from "../../public/art/showcase/rooftop-run.json";
import rooftopSprings from "../../public/art/showcase/rooftop-springs.json";
import rover from "../../public/art/showcase/rover.json";
import patioCare from "../../public/art/showcase/patio-care.json";
import catalog from "../../public/art/showcase/catalog.json";

const ground = (
  id: string,
  x: number,
  width: number,
  y = 690,
  height = 130,
): WorldEntity => ({ id, kind: "terrain", x, y, width, height });
const seed = (
  id: string,
  x: number,
  y: number,
  label: string,
): WorldEntity => ({
  id,
  kind: "coin",
  x,
  y,
  width: 35,
  height: 40,
  art: "/art/seed.svg",
  label,
});

export const EXAMPLES: WorldDefinition[] = [
  {
    id: "willow-grove",
    name: "The wandering grove",
    description:
      "Bring the Trail seed and River seed home. The Sky seed is an optional climb; the Garden switch opens its upper gate.",
    theme: "grove",
    width: 1440,
    height: 820,
    source: "example",
    sourceImage: "/art/grove-challenge-map.svg",
    goalRules: {
      requiredCollectedIds: ["sunseed-one", "sunseed-two"],
      requiredActivatedIds: [],
    },
    revision: 1,
    entities: [
      ground("west-bank", 0, 490),
      ground("east-bank", 720, 720),
      {
        id: "woven-bridge",
        kind: "bridge",
        x: 482,
        y: 684,
        width: 246,
        height: 25,
      },
      {
        id: "moss-shelf",
        kind: "terrain",
        x: 880,
        y: 586,
        width: 180,
        height: 28,
        label: "Garden step",
      },
      { ...ground("garden-shelf", 1040, 220, 482, 28), label: "Sky garden" },
      {
        id: "pip",
        kind: "player",
        x: 137,
        y: 587,
        width: 79,
        height: 95,
        art: "/art/pip.svg",
        label: "Pip",
      },
      seed("sunseed-one", 348, 630, "Trail seed"),
      seed("sunseed-two", 770, 630, "River seed"),
      seed("sunseed-three", 1190, 421, "Sky seed"),
      {
        id: "willow-lever",
        kind: "lever",
        x: 929,
        y: 521,
        width: 53,
        height: 65,
        targetId: "willow-gate",
        label: "Garden switch",
      },
      {
        id: "willow-gate",
        kind: "gate",
        x: 1130,
        y: 330,
        width: 48,
        height: 152,
        label: "Garden gate",
      },
      {
        id: "pip-home",
        kind: "goal",
        x: 1255,
        y: 543,
        width: 132,
        height: 147,
        art: "/art/home.svg",
        label: "Pip's home",
      },
    ],
  },
  {
    id: "moon-mail",
    name: "A letter to the moon",
    description:
      "Climb to the Summit switch to open the Observatory gate, then deliver Miso's letter. The three stars are optional detours.",
    theme: "moon",
    width: 1440,
    height: 820,
    source: "example",
    sourceImage: "/art/moon-challenge-map.svg",
    goalRules: {
      requiredCollectedIds: [],
      requiredActivatedIds: ["telescope-switch"],
    },
    revision: 1,
    entities: [
      ground("moon-floor", 0, 1440),
      {
        ...ground("moon-step-one", 285, 180, 602, 28),
        label: "First moon ledge",
      },
      { ...ground("moon-step-two", 555, 180, 514, 28), label: "Summit ledge" },
      {
        id: "miso",
        kind: "player",
        x: 100,
        y: 586,
        width: 75,
        height: 98,
        art: "/art/miso.svg",
        label: "Miso",
      },
      seed("star-one", 333, 543, "Ledge star"),
      seed("star-two", 690, 455, "Summit star"),
      seed("star-three", 980, 630, "Gate star"),
      {
        id: "telescope-switch",
        kind: "lever",
        x: 600,
        y: 449,
        width: 53,
        height: 65,
        targetId: "observatory-gate",
        label: "Summit switch",
      },
      {
        id: "observatory-gate",
        kind: "gate",
        x: 1100,
        y: 486,
        width: 48,
        height: 204,
        label: "Observatory gate",
      },
      {
        id: "observatory",
        kind: "goal",
        x: 1260,
        y: 543,
        width: 132,
        height: 147,
        art: "/art/moon-home.svg",
        label: "Observatory",
      },
    ],
  },
  {
    id: "little-orbit",
    name: "The open canyon",
    description:
      "Take the canyon trail, or build a bridge to make your own route. All three sparks are optional; reach Bo's workshop.",
    theme: "sunset",
    width: 1440,
    height: 1100,
    source: "example",
    sourceImage: "/art/canyon-challenge-map.svg",
    revision: 1,
    entities: [
      ground("canyon-left", 0, 450, 690, 410),
      ground("canyon-right", 1000, 440, 690, 410),
      {
        ...ground("canyon-trail", 450, 550, 990, 110),
        label: "Lower canyon trail",
      },
      {
        ...ground("canyon-return-one", 800, 110, 890, 26),
        label: "First return step",
      },
      {
        ...ground("canyon-return-two", 910, 90, 790, 26),
        label: "Second return step",
      },
      { ...ground("warm-step", 180, 160, 601, 26), label: "Lookout" },
      {
        id: "bo",
        kind: "player",
        x: 70,
        y: 587,
        width: 82,
        height: 95,
        art: "/art/bo.svg",
        label: "Bo",
      },
      seed("spark-one", 236, 541, "Lookout spark"),
      seed("spark-two", 640, 930, "Canyon spark"),
      seed("spark-three", 945, 730, "Return spark"),
      {
        id: "bo-home",
        kind: "goal",
        x: 1255,
        y: 543,
        width: 132,
        height: 147,
        art: "/art/home.svg",
        label: "Bo's workshop",
      },
    ],
  },
];

EXAMPLES.push(...[rooftopRun, rooftopSprings, rover, patioCare].map(world => validateWorld({...world, source: "example"})));

/** Presentation order only; uploaded images always use the general creation pipeline. */
export const PRESENTED_EXAMPLES = [...EXAMPLES].sort((a,b) => {
  const rank=(w:WorldDefinition)=>{const i=catalog.examples.findIndex(e=>e.id===(w.exampleId??w.id));return i<0?100:i;};
  return rank(a)-rank(b);
});

export function freshExample(id: string): WorldDefinition {
  const template = EXAMPLES.find((w) => w.id === id) ?? EXAMPLES[0];
  return {
    ...structuredClone(template),
    id: crypto.randomUUID(),
    exampleId: template.id,
  };
}
