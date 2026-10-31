import { validateWorld, type WorldDefinition } from "./world.js";

/** Review data is not a playable world. Only WorldSetup's validated output may enter the engine. */
export interface RecognitionReview {
  kind: "recognition-review";
  version: 1;
  draft: WorldDefinition;
  issues: RecognitionIssue[];
}
export interface RecognitionIssue {
  id: string;
  objectId?: string;
  label: string;
  message: string;
}

export function validateRecognitionReview(value: unknown): RecognitionReview {
  if (!value || typeof value !== "object")
    throw new Error("The repair draft could not be read.");
  const review = value as RecognitionReview;
  const draft = review.draft;
  if (
    review.kind !== "recognition-review" ||
    review.version !== 1 ||
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
