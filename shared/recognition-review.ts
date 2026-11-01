import {
  validateWorld,
  type WorldDefinition,
  type GoalRules,
  type WorldEntity,
} from "./world.js";

/** Review data is not a playable world. Only WorldSetup's validated output may enter the engine. */
export interface RecognitionReview {
  kind: "recognition-review";
  version: 1;
  draft: WorldDefinition;
  issues: RecognitionIssue[];
  rulesNeedConfirmation?: boolean;
}
export interface RecognitionIssue {
  id: string;
  objectId?: string;
  label: string;
  message: string;
}

/** Keep only grounded requirement IDs; callers must quarantine every reported issue. */
export function reviewGoalRules(
  value: unknown,
  entities: WorldEntity[],
  requireDestination = true,
): { rules: GoalRules; issues: string[] } {
  const rules: GoalRules = {
    requiredCollectedIds: [],
    requiredActivatedIds: [],
  };
  const issues: string[] = [];
  if (value === undefined) return { rules, issues };
  if (!value || typeof value !== "object" || Array.isArray(value))
    return {
      rules,
      issues: [
        "The finishing requirements were unreadable. Choose the required actions below.",
      ],
    };
  const input = value as Record<string, unknown>;
  for (const [key, kind] of [
    ["requiredCollectedIds", "coin"],
    ["requiredActivatedIds", "lever"],
  ] as const) {
    const values = input[key] === undefined ? [] : input[key];
    if (!Array.isArray(values) || values.length > 160) {
      issues.push(
        `Choose valid ${kind === "coin" ? "collectibles" : "switches"} for the finishing requirements.`,
      );
      continue;
    }
    const seen = new Set<string>();
    for (const id of values) {
      if (
        typeof id !== "string" ||
        !/^[\w-]{1,60}$/.test(id) ||
        !entities.some((entity) => entity.id === id && entity.kind === kind)
      ) {
        issues.push(
          `A required ${kind === "coin" ? "collectible" : "switch"} could not be matched to its recognized object. Choose it below rather than guessing.`,
        );
        continue;
      }
      if (seen.has(id)) {
        issues.push(
          "A finishing requirement was repeated. Confirm the intended actions below.",
        );
        continue;
      }
      seen.add(id);
      rules[key].push(id);
    }
  }
  if (
    requireDestination &&
    (rules.requiredCollectedIds.length || rules.requiredActivatedIds.length) &&
    !entities.some((entity) => entity.kind === "goal")
  )
    issues.push(
      "Add a destination before requiring these actions to finish, or make the actions optional.",
    );
  return { rules, issues: [...new Set(issues)] };
}

export function validateRecognitionReview(value: unknown): RecognitionReview {
  if (!value || typeof value !== "object")
    throw new Error("The repair draft could not be read.");
  const review = value as RecognitionReview;
  const draft = review.draft;
  if (
    review.kind !== "recognition-review" ||
    review.version !== 1 ||
    (review.rulesNeedConfirmation !== undefined &&
      typeof review.rulesNeedConfirmation !== "boolean") ||
    !draft ||
    draft.source !== "meta" ||
    draft.width !== 1440 ||
    draft.height !== 820 ||
    !Array.isArray(draft.entities) ||
    draft.entities.length < 1 ||
    draft.entities.length > 24 ||
    !Array.isArray(review.issues) ||
    review.issues.length < 1 ||
    review.issues.length > 80
  )
    throw new Error("The repair draft could not be read.");
  if (reviewGoalRules(draft.goalRules, draft.entities, false).issues.length)
    throw new Error("The repair draft has unmatched finishing requirements.");
  for (const entity of draft.entities) {
    if (
      !entity ||
      typeof entity !== "object" ||
      ![
        "player",
        "terrain",
        "bridge",
        "coin",
        "lever",
        "gate",
        "goal",
        "decoration",
      ].includes(entity.kind) ||
      (entity.label !== undefined &&
        (typeof entity.label !== "string" || entity.label.length > 80)) ||
      (entity.targetId !== undefined &&
        (typeof entity.targetId !== "string" ||
          !/^[\w-]{1,60}$/.test(entity.targetId))) ||
      entity.x < 0 ||
      entity.y < 0 ||
      entity.x + entity.width > draft.width ||
      entity.y + entity.height > draft.height
    )
      throw new Error("An object in the repair draft could not be read.");
  }
  // Exercise the ordinary world contract without pretending the missing player,
  // support or gate relationships have been repaired. The extra objects exist
  // only in this validation copy; they never enter the returned review data.
  const ids = new Set(draft.entities.map((e) => e.id));
  let prefix = "review-validation";
  while (ids.has(`${prefix}-player`) || ids.has(`${prefix}-terrain`))
    prefix += "x";
  validateWorld({
    ...draft,
    goalRules: undefined,
    entities: [
      ...draft.entities.map((e) => ({
        ...e,
        kind: e.kind === "player" || e.kind === "lever" ? "decoration" : e.kind,
      })),
      {
        id: `${prefix}-player`,
        kind: "player",
        x: 0,
        y: 0,
        width: 4,
        height: 4,
      },
      {
        id: `${prefix}-terrain`,
        kind: "terrain",
        x: 0,
        y: 4,
        width: 4,
        height: 4,
      },
    ],
  });
  const issueIds = new Set<string>();
  for (const issue of review.issues) {
    if (
      !issue ||
      typeof issue !== "object" ||
      typeof issue.id !== "string" ||
      !/^[\w-]{1,80}$/.test(issue.id) ||
      issueIds.has(issue.id) ||
      typeof issue.label !== "string" ||
      issue.label.length > 80 ||
      typeof issue.message !== "string" ||
      !issue.message.trim() ||
      issue.message.length > 320 ||
      (issue.objectId !== undefined &&
        (typeof issue.objectId !== "string" || !ids.has(issue.objectId)))
    )
      throw new Error("The repair notes could not be read.");
    issueIds.add(issue.id);
  }
  return structuredClone(review);
}
