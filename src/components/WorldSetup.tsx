import { useEffect, useRef, useState, type PointerEvent } from "react";
import { ArrowUpRight, LoaderCircle, Plus, Trash2 } from "lucide-react";
import { Modal } from "./Modal";
import { prepareSourceArtwork } from "../lib/source-art";
import { setupFeedback } from "../../shared/setup";
import { validateRecognitionReview, type RecognitionReview } from "../../shared/recognition-review";
import { validateWorld } from "../../shared/world";
import "./WorldSetupRules.css";
import "./WorldSetup.css";
import type {
  ArtworkBox,
  EntityKind,
  InputKind,
  GoalRules,
  WorldDefinition,
  WorldEntity,
} from "../../shared/world";

const roles: { kind: EntityKind; name: string; help: string }[] = [
  {
    kind: "player",
    name: "Character",
    help: "The one you move and jump with.",
  },
  { kind: "terrain", name: "Platform", help: "A surface you can stand on." },
  { kind: "bridge", name: "Bridge", help: "A way across a gap." },
  {
    kind: "coin",
    name: "Collectible",
    help: "Something to find on the journey.",
  },
  {
    kind: "goal",
    name: "Destination",
    help: "Somewhere to finish the adventure.",
  },
  { kind: "lever", name: "Switch", help: "Choose which gate it opens." },
  { kind: "gate", name: "Gate", help: "A door opened by a switch." },
  {
    kind: "decoration",
    name: "Scenery",
    help: "A visible detail, without collisions.",
  },
];
const clamp = (v: number, min: number, max: number) =>
  Math.min(max, Math.max(min, v));
function emptyWorld(
  image: string,
  inputKind: InputKind,
  intent: string,
): WorldDefinition {
  return {
    id: crypto.randomUUID(),
    name: "My little adventure",
    description: intent || "An adventure assembled by you.",
    theme: "grove",
    width: 1440,
    height: 820,
    source: "manual",
    inputKind,
    sourceImage: image,
    entities: [],
    revision: 1,
  };
}
export function WorldSetup({
  image,
  inputKind,
  initial,
  recovery,
  resume,
  intent = "",
  onUse,
  onPause,
  onClose,
}: {
  image: string;
  inputKind: InputKind;
  initial?: WorldDefinition;
  recovery?: RecognitionReview;
  /** Unsaved review edits only; this may not yet satisfy the playable-world contract. */
  resume?: WorldDefinition;
  intent?: string;
  onUse: (world: WorldDefinition) => void;
  onPause?: (world: WorldDefinition) => void;
  onClose: () => void;
}) {
  const [world, setWorld] = useState(() =>
    resume
      ? structuredClone(resume)
      : recovery
        ? structuredClone(recovery.draft)
        : initial
          ? structuredClone(initial)
          : emptyWorld(image, inputKind, intent),
  );
  const [tool, setTool] = useState<EntityKind>("player"),
    [selected, setSelected] = useState(
      resume?.entities[0]?.id ||
        recovery?.issues.find(issue => issue.objectId)?.objectId ||
        recovery?.draft.entities[0]?.id ||
        initial?.entities[0]?.id ||
        "",
    );
  const [selection, setSelection] = useState<ArtworkBox | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [sourceAspect, setSourceAspect] = useState(1440 / 820);
  const [reviewNotes, setReviewNotes] = useState(recovery);
  const [rulesConfirmed, setRulesConfirmed] = useState(
    !recovery?.rulesNeedConfirmation,
  );
  const checks = useRef<HTMLDetailsElement>(null);
  const start = useRef<{ x: number; y: number } | null>(null),
    request = useRef<AbortController | null>(null);
  const move = useRef<{
    id: string;
    x: number;
    y: number;
    left: number;
    top: number;
  } | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  useEffect(() => {
    const img = new Image();
    img.onload = () => setSourceAspect(img.naturalWidth / img.naturalHeight);
    img.src = image;
    return () => {
      img.onload = null;
    };
  }, [image]);
  const item = world.entities.find((e) => e.id === selected);
  const feedback = setupFeedback(world);
  const goalRules = world.goalRules ?? {
    requiredCollectedIds: [],
    requiredActivatedIds: [],
  };
  const requiredActionCount = goalRules.requiredCollectedIds.length + goalRules.requiredActivatedIds.length + (goalRules.requiredInteractionIds?.length ?? 0) + (goalRules.requiredResourceIds?.length ?? 0) + (goalRules.requiredChoiceGroupIds?.length ?? 0);
  const hasDestination = world.entities.some((entity) => entity.kind === "goal");
  function toggleRule(key: "requiredCollectedIds" | "requiredActivatedIds" | "requiredInteractionIds" | "requiredResourceIds" | "requiredChoiceGroupIds", id: string) {
    setWorld((current) => {
      const rules = current.goalRules ?? {
        requiredCollectedIds: [],
        requiredActivatedIds: [],
      };
      return {
        ...current,
        goalRules: {
          ...rules,
          [key]: (rules[key] ?? []).includes(id)
            ? (rules[key] ?? []).filter((value) => value !== id)
            : [...(rules[key] ?? []), id],
        },
      };
    });
    if (recovery?.rulesNeedConfirmation) setRulesConfirmed(false);
    setError("");
  }
  function ruleChoices(key: "requiredCollectedIds" | "requiredActivatedIds", kind: "coin" | "lever") {
    const choices = world.entities.filter((entity) => entity.kind === kind);
    const unavailable = goalRules[key].filter(
      (id) => !choices.some((entity) => entity.id === id),
    );
    return (
      <fieldset className="setup-rule-group">
        <legend>
          {kind === "coin"
            ? "Collect before finishing"
            : "Activate before finishing"}
        </legend>
        {!choices.length && !unavailable.length && (
          <p>
            No {kind === "coin" ? "collectibles" : "switches"} selected yet.
          </p>
        )}
        {choices.map((entity) => (
          <label key={entity.id}>
            <input
              type="checkbox"
              checked={goalRules[key].includes(entity.id)}
              onChange={() => toggleRule(key, entity.id)}
            />
            <span>
              {entity.label || (kind === "coin" ? "Collectible" : "Switch")}
            </span>
          </label>
        ))}
        {unavailable.map((id) => (
          <label key={id} className="setup-rule-unavailable">
            <input
              type="checkbox"
              checked
              onChange={() => toggleRule(key, id)}
            />
            <span>
              Unavailable {kind === "coin" ? "collectible" : "switch"}: {id}.
              Uncheck it or restore its role.
            </span>
          </label>
        ))}
      </fieldset>
    );
  }
  function update(change: Partial<WorldEntity>) {
    setWorld((w) => ({
      ...w,
      entities: w.entities.map((e) =>
        e.id === selected ? { ...e, ...change } : e,
      ),
    }));
    setError("");
  }
  function add(crop?: ArtworkBox) {
    if (world.entities.length >= 24) {
      setError("Keep this first adventure to 24 objects or fewer.");
      return;
    }
    if (!crop && ["player", "decoration"].includes(tool)) {
      setError("Mark this object in the picture first.");
      return;
    }
    const id = crypto.randomUUID(),
      name = roles.find((r) => r.kind === tool)!.name;
    const dimensions =
      tool === "player"
        ? {
            x: 120,
            y: 580,
            width: clamp(
              Math.round((crop!.width / crop!.height) * sourceAspect * 96),
              40,
              150,
            ),
            height: 96,
          }
        : tool === "terrain"
          ? crop
            ? {
                x: crop.x * 1.44,
                y: crop.y * 0.82,
                width: crop.width * 1.44,
                height: crop.height * 0.82,
              }
            : { x: 0, y: 690, width: 1440, height: 130 }
          : tool === "bridge"
            ? { x: 500, y: 650, width: 220, height: 24 }
            : tool === "goal"
              ? { x: 1260, y: 543, width: 132, height: 147 }
              : tool === "coin"
                ? { x: 620, y: 600, width: 36, height: 40 }
                : tool === "gate"
                  ? { x: 1100, y: 536, width: 48, height: 154 }
                  : tool === "lever"
                    ? { x: 850, y: 625, width: 53, height: 65 }
                    : { x: 400, y: 450, width: 120, height: 120 };
    const entity: WorldEntity = {
      id,
      kind: tool,
      ...dimensions,
      label: `${crop ? "Picture" : "Added"} ${name.toLowerCase()}`,
      ...(crop
        ? { artSource: crop }
        : tool === "goal"
          ? { art: "/art/home.svg" }
          : tool === "coin"
            ? { art: "/art/seed.svg" }
            : {}),
    };
    setWorld((w) => ({ ...w, entities: [...w.entities, entity] }));
    setSelected(id);
    setError("");
  }
  function point(e: PointerEvent<SVGSVGElement>, width = 1000, height = 1000) {
    const r = e.currentTarget.getBoundingClientRect();
    return {
      x: clamp(((e.clientX - r.left) / r.width) * width, 0, width),
      y: clamp(((e.clientY - r.top) / r.height) * height, 0, height),
    };
  }
  function finish(e: PointerEvent<SVGSVGElement>) {
    if (!start.current) return;
    const p = point(e),
      a = start.current;
    start.current = null;
    setSelection(null);
    const crop = {
      x: Math.round(Math.min(a.x, p.x)),
      y: Math.round(Math.min(a.y, p.y)),
      width: Math.round(Math.abs(a.x - p.x)),
      height: Math.round(Math.abs(a.y - p.y)),
    };
    if (crop.width >= 5 && crop.height >= 5) add(crop);
    else
      setError(
        "Drag a box around the whole object, or use the selection fields below.",
      );
  }
  async function prepare() {
    if (!rulesConfirmed) {
      setError(
        "Confirm the finishing requirements before preparing your world.",
      );
      return;
    }
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setError("");
    try {
      let ready: WorldDefinition;
      if (world.source === "meta" && world.gameplay?.movement === "discover" && world.interactions) {
        const response = await fetch("/api/source-review", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ world }), signal: controller.signal,
        });
        const result = await response.json().catch(() => ({error: "Source preparation could not be reached. Your selections are kept; try again."}));
        controller.signal.throwIfAborted();
        if (!response.ok) {
          if (result.recovery) {
            const next = validateRecognitionReview(result.recovery);
            setReviewNotes(next); setWorld(next.draft);
            if (next.rulesNeedConfirmation) setRulesConfirmed(false);
            const first = next.issues.find(issue => issue.objectId);
            if (first?.objectId) setSelected(first.objectId);
          }
          throw new Error(result.error || "Adjust the highlighted object and try again.");
        }
        ready = validateWorld(result.world);
      } else {
        ready = await prepareSourceArtwork(world, controller.signal);
      }
      if (!controller.signal.aborted) onUse(ready);
    } catch (e) {
      if (!controller.signal.aborted)
        setError(
          e instanceof Error
            ? e.message
            : "This preview could not be prepared.",
        );
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  function cropChange(key: keyof ArtworkBox, value: number) {
    if (!item?.artSource) return;
    const crop = { ...item.artSource, [key]: value * 10 };
    crop.x = clamp(crop.x, 0, 995);
    crop.y = clamp(crop.y, 0, 995);
    crop.width = clamp(crop.width, 5, 1000 - crop.x);
    crop.height = clamp(crop.height, 5, 1000 - crop.y);
    update({
      artSource: crop,
      art: undefined,
      artMethod: undefined,
      artNote: undefined,
    });
  }
  return (
    <Modal
      wide
      title="Arrange your world"
      className="world-setup-modal"
      footer={
        <div className="setup-footer">
          <div className="setup-footer-status">
            {error ? <span className="setup-error" role="alert">{error}</span> : <span>{world.entities.length} / 24 objects</span>}
            {feedback.errors.length > 0 ? (
              <button className="text-button" onClick={() => {
                if (checks.current) {
                  checks.current.open = true;
                  checks.current.scrollIntoView({ block: "nearest" });
                  checks.current.querySelector("summary")?.focus();
                }
              }}>
                {feedback.errors.length} {feedback.errors.length === 1 ? "check" : "checks"} to resolve
              </button>
            ) : <span>{rulesConfirmed ? "Ready to preview" : "Confirm finishing requirements"}</span>}
          </div>
          <button
            className="primary-button"
            disabled={busy || feedback.errors.length > 0 || !rulesConfirmed}
            onClick={() => void prepare()}
          >
            {busy ? <LoaderCircle size={17} className="spin" /> : <ArrowUpRight size={17} />}
            {busy ? "Preparing preview…" : "Prepare preview"}
          </button>
        </div>
      }
      onClose={() => {
        request.current?.abort();
        onPause?.(structuredClone(world));
        onClose();
      }}
    >
      <span className="setup-context-note" title={world.source === "manual" ? "Selected and arranged by you" : "Meta interpretation with your adjustments"}>
        {world.source === "manual" ? "Manual" : "Meta interpretation"}
      </span>
      {reviewNotes && (
        <details className="setup-disclosure setup-recovery">
          <summary>Recognition notes · {reviewNotes.issues.length} to review</summary>
          <p className="small-note">
            Adjust the selections below, then prepare your world again.
          </p>
          {reviewNotes.issues.map((issue) => (
            <div key={issue.id}>
              <p>
                <strong>{issue.label}</strong> · {issue.message}
              </p>
              {issue.objectId &&
                world.entities.some((e) => e.id === issue.objectId) && (
                  <button
                    className="text-button"
                    onClick={() => setSelected(issue.objectId!)}
                  >
                    Adjust {issue.label || "selection"}
                  </button>
                )}
            </div>
          ))}
        </details>
      )}
      <fieldset disabled={busy} inert={busy} className="setup-fieldset">
        <div
          className="setup-roles"
          role="group"
          aria-label="Role for the next picture selection"
        >
          {roles.map((r) => (
            <button
              key={r.kind}
              className={tool === r.kind ? "selected" : ""}
              aria-pressed={tool === r.kind}
              onClick={() => setTool(r.kind)}
            >
              {r.name}
            </button>
          ))}
        </div>
        <div className="setup-tool-guidance">
        <p className="setup-instruction">
          <strong>{roles.find((r) => r.kind === tool)!.name}.</strong> {roles.find((r) => r.kind === tool)!.help} Drag around it in the source image.
        </p>
          <button
            className="text-button"
            onClick={() => add({ x: 100, y: 100, width: 200, height: 200 })}
          >
            <Plus size={14} /> Add selection
          </button>
        </div>
        <div className="setup-canvases">
          <section>
            <h3>Source image <span>Select artwork</span></h3>
            <div className="setup-artboard">
            <div
              className="setup-source-wrap"
              style={{
                aspectRatio: sourceAspect,
                maxWidth: `min(100%, calc(var(--setup-canvas-height) * ${sourceAspect}))`,
              }}
            >
              <svg
                viewBox="0 0 1000 1000"
                preserveAspectRatio="none"
                role="img"
                aria-label="Picture selection canvas. Drag to mark the selected object role."
                onPointerDown={(e) => {
                  e.currentTarget.setPointerCapture(e.pointerId);
                  start.current = point(e);
                  setSelection(null);
                }}
                onPointerMove={(e) => {
                  if (start.current) {
                    const p = point(e),
                      a = start.current;
                    setSelection({
                      x: Math.min(a.x, p.x),
                      y: Math.min(a.y, p.y),
                      width: Math.abs(a.x - p.x),
                      height: Math.abs(a.y - p.y),
                    });
                  }
                }}
                onPointerUp={finish}
                onPointerCancel={() => {
                  start.current = null;
                  setSelection(null);
                }}
              >
                <image
                  href={image}
                  width="1000"
                  height="1000"
                  preserveAspectRatio="none"
                />
                {world.entities
                  .filter((e) => e.artSource)
                  .map((e) => (
                    <rect
                      key={e.id}
                      {...e.artSource}
                      fill={e.id === selected ? "#3458d426" : "#fff0"}
                      stroke={e.id === selected ? "#3458d4" : "#6b7688"}
                      strokeWidth="4"
                      vectorEffect="non-scaling-stroke"
                      pointerEvents="none"
                    />
                  ))}
                {selection && (
                  <rect
                    {...selection}
                    fill="#ffffff44"
                    stroke="#3458d4"
                    strokeWidth="4"
                    vectorEffect="non-scaling-stroke"
                  />
                )}
              </svg>
            </div>
            </div>
            <details className="setup-crop-note">
              <summary>About artwork crops</summary>
              <p>Crops retain their background unless a precise cutout is available.</p>
            </details>
          </section>
          <section>
            <h3>Game layout <span>Drag objects to place</span></h3>
            <div className="setup-artboard setup-layout-artboard">
            <svg
              className="setup-game"
              viewBox="0 0 1440 820"
              role="img"
              aria-label="Game layout preview. Select and drag objects to place them."
              onPointerMove={(e) => {
                if (!move.current) return;
                const p = point(e, 1440, 820),
                  m = move.current;
                setWorld((w) => ({
                  ...w,
                  entities: w.entities.map((o) =>
                    o.id === m.id
                      ? {
                          ...o,
                          x: Math.round(
                            clamp(m.left + p.x - m.x, 0, 1440 - o.width),
                          ),
                          y: Math.round(
                            clamp(m.top + p.y - m.y, 0, 820 - o.height),
                          ),
                        }
                      : o,
                  ),
                }));
              }}
              onPointerUp={() => {
                move.current = null;
              }}
              onPointerCancel={() => {
                move.current = null;
              }}
            >
              <rect
                width="1440"
                height="820"
                fill="var(--field)"
              />
              {world.entities.map((e) => (
                <g
                  key={e.id}
                  onPointerDown={(event) => {
                    event.stopPropagation();
                    const svg = event.currentTarget.ownerSVGElement!,
                      r = svg.getBoundingClientRect();
                    svg.setPointerCapture(event.pointerId);
                    const p = {
                      x: ((event.clientX - r.left) / r.width) * 1440,
                      y: ((event.clientY - r.top) / r.height) * 820,
                    };
                    move.current = {
                      id: e.id,
                      x: p.x,
                      y: p.y,
                      left: e.x,
                      top: e.y,
                    };
                    setSelected(e.id);
                  }}
                >
                  {e.art ? (
                    <image
                      href={e.art}
                      x={e.x}
                      y={e.y}
                      width={e.width}
                      height={e.height}
                      preserveAspectRatio="none"
                    />
                  ) : e.artSource ? (
                    <svg
                      x={e.x}
                      y={e.y}
                      width={e.width}
                      height={e.height}
                      viewBox={`${e.artSource.x} ${e.artSource.y} ${e.artSource.width} ${e.artSource.height}`}
                      preserveAspectRatio="none"
                    >
                      <defs>
                        <clipPath id={`setup-oval-${e.id}`}>
                          <ellipse
                            cx={e.artSource.x + e.artSource.width / 2}
                            cy={e.artSource.y + e.artSource.height / 2}
                            rx={e.artSource.width / 2}
                            ry={e.artSource.height / 2}
                          />
                        </clipPath>
                      </defs>
                      <image
                        href={image}
                        width="1000"
                        height="1000"
                        preserveAspectRatio="none"
                        clipPath={
                          e.artShape === "ellipse"
                            ? `url(#setup-oval-${e.id})`
                            : undefined
                        }
                      />
                    </svg>
                  ) : (
                    <rect
                      x={e.x}
                      y={e.y}
                      width={e.width}
                      height={e.height}
                      rx="8"
                      fill={e.kind === "gate" ? "#aab6d0" : "#b5bfcd"}
                    />
                  )}
                  <rect
                    x={e.x}
                    y={e.y}
                    width={e.width}
                    height={e.height}
                    fill="transparent"
                    stroke={e.id === selected ? "#3458d4" : "#6b7688"}
                    strokeWidth={e.id === selected ? 5 : 2}
                  />
                  <text
                    x={e.x + 3}
                    y={Math.max(20, e.y - 9)}
                    fontSize="21"
                    fill="var(--ink)"
                  >
                    {e.label || e.kind}
                  </text>
                </g>
              ))}
            </svg>
            {!world.entities.length && <span className="setup-empty-layout">Select artwork to start arranging</span>}
            </div>
            <div className="setup-add-object">
            {tool !== "player" && tool !== "decoration" && <button className="secondary-button" onClick={() => add()}>
              <Plus size={15} />
              Add {roles.find((r) => r.kind === tool)!.name.toLowerCase()}
            </button>}
            <p className="small-note">
              {tool === "player" || tool === "decoration" ? "Source artwork required" : "Without source artwork"}
            </p>
            </div>
          </section>
        </div>
        <div
          className="setup-object-list"
          aria-label="Objects in your first world"
        >
          {world.entities.map((e) => (
            <button
              key={e.id}
              aria-pressed={selected === e.id}
              onClick={() => setSelected(e.id)}
            >
              {e.label || e.kind}
            </button>
          ))}
        </div>
        {item && (
          <section className="setup-inspector">
            <div className="setup-inspector-heading">
              <h3>Selected object</h3>
              <button
                className="text-button"
                onClick={() => {
                  const member = world.interactions?.actions.find(action =>
                    (action.toolId === selected || action.targetId === selected || action.effects?.some(effect => "entityId" in effect && effect.entityId === selected))
                    && world.interactions?.choiceGroups?.some(group => group.actionIds.includes(action.id)));
                  if (member) { setError("This object belongs to a player choice. Edit or remove that choice before removing the object."); return; }
                  setWorld((w) => ({
                    ...w,
                    entities: w.entities.filter((e) => e.id !== selected),
                  }));
                  setSelected("");
                }}
              >
                <Trash2 size={15} />
                Remove object
              </button>
            </div>
            <div className="setup-title-fields">
              <label>
                Object name
                <textarea
                  rows={2}
                  value={item.label || ""}
                  maxLength={80}
                  onChange={(e) => update({ label: e.target.value })}
                />
              </label>
              <label>
                Game role
                <select
                  value={item.kind}
                  onChange={(e) =>
                    update({
                      kind: e.target.value as EntityKind,
                      targetId: undefined,
                    })
                  }
                >
                  {roles.map((r) => (
                    <option key={r.kind} value={r.kind}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="setup-number-fields">
              {(["x", "y", "width", "height"] as const).map((key) => (
                <label key={key}>
                  {`Game ${key}`}
                  <input
                    type="number"
                    aria-label={`Game ${key}`}
                    value={Math.round(item[key])}
                    min={key === "width" || key === "height" ? 4 : 0}
                    max={key === "x" || key === "width" ? 1440 : 820}
                    onChange={(e) => {
                      if (e.target.value !== "")
                        update({
                          [key]: clamp(
                            Number(e.target.value),
                            key === "width" || key === "height" ? 4 : 0,
                            key === "x" || key === "width" ? 1440 : 820,
                          ),
                        });
                    }}
                  />
                </label>
              ))}
            </div>
            {item.artSource && (
              <>
                <h4>Selection in the picture (%)</h4>
                {world.inputKind === "picture" && (
                  <label>
                    Selection shape
                    <select
                      value={item.artShape ?? "box"}
                      onChange={(e) =>
                        update({
                          artShape: e.target.value as "box" | "ellipse",
                          art: undefined,
                          artMethod: undefined,
                          artNote: undefined,
                        })
                      }
                    >
                      <option value="box">
                        Rectangle · keep the selected area
                      </option>
                      <option value="ellipse">
                        Oval · trim corners yourself
                      </option>
                    </select>
                  </label>
                )}
                <div className="setup-number-fields">
                  {(["x", "y", "width", "height"] as const).map((key) => (
                    <label key={key}>
                      {`Selection ${key}`}
                      <input
                        type="number"
                        aria-label={`Selection ${key}`}
                        value={Math.round(item.artSource![key]) / 10}
                        min={0}
                        max={100}
                        step={0.1}
                        onChange={(e) => {
                          if (e.target.value !== "")
                            cropChange(key, Number(e.target.value));
                        }}
                      />
                    </label>
                  ))}
                </div>
              </>
            )}
            {item.kind === "lever" && (
              <label>
                Gate opened by this switch
                <select
                  value={item.targetId || ""}
                  onChange={(e) =>
                    update({ targetId: e.target.value || undefined })
                  }
                >
                  <option value="">Choose a gate…</option>
                  {world.entities
                    .filter((e) => e.kind === "gate")
                    .map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.label || "Gate"} · {Math.round(e.x)},{" "}
                        {Math.round(e.y)}
                      </option>
                    ))}
                </select>
              </label>
            )}
          </section>
        )}
        <details className="setup-disclosure setup-world-details">
          <summary>World details <span>{world.name}</span></summary>
        <div className="setup-title-fields">
          <label>
            World name
            <textarea
              rows={2}
              value={world.name}
              maxLength={80}
              onChange={(e) =>
                setWorld((w) => ({ ...w, name: e.target.value }))
              }
            />
          </label>
          <label>
            Atmosphere
            <select
              value={world.theme}
              onChange={(e) =>
                setWorld((w) => ({
                  ...w,
                  theme: e.target.value as WorldDefinition["theme"],
                }))
              }
            >
              <option value="grove">Quiet grove</option>
              <option value="moon">Moonlit</option>
              <option value="sunset">Warm afternoon</option>
            </select>
          </label>
        </div>
        <label>
          Adventure
          <textarea
            rows={2}
            value={world.description}
            maxLength={500}
            onChange={(e) =>
              setWorld((w) => ({ ...w, description: e.target.value }))
            }
          />
        </label>
        </details>
      </fieldset>
      <details className="setup-disclosure setup-finishing" open={recovery?.rulesNeedConfirmation || undefined}>
      <summary>Finishing requirements <span>{requiredActionCount} requirements</span></summary>
      <fieldset className="setup-rules" disabled={busy}>
        <legend className="sr-only">Finishing requirements</legend>
        <p>Choose what must be achieved to finish.</p>
        {recovery?.rulesNeedConfirmation && (
          <p className="setup-rule-attention">
            Meta could not confirm every part of your objective. Check these
            choices, then confirm them. Leaving every box unchecked makes the
            actions optional.
          </p>
        )}
        <div className="setup-rule-columns">
          {ruleChoices("requiredCollectedIds", "coin")}
          {ruleChoices("requiredActivatedIds", "lever")}
          {world.interactions?.actions.some(action => !world.interactions?.choiceGroups?.some(group => group.actionIds.includes(action.id)) || goalRules.requiredInteractionIds?.includes(action.id)) && <fieldset className="setup-rule-group">
            <legend>Object actions</legend>
            {world.interactions!.actions.filter(action => !world.interactions?.choiceGroups?.some(group => group.actionIds.includes(action.id)) || goalRules.requiredInteractionIds?.includes(action.id)).map((action) => <label key={action.id}>
              <input type="checkbox" checked={(goalRules.requiredInteractionIds ?? []).includes(action.id)} onChange={() => toggleRule("requiredInteractionIds", action.id)} />
              <span>{world.interactions?.choiceGroups?.some(group => group.actionIds.includes(action.id)) ? `Must choose ${action.label}` : action.label}</span>
            </label>)}
          </fieldset>}
          {Boolean(world.interactions?.choiceGroups?.length) && <fieldset className="setup-rule-group">
            <legend>Choose one to finish</legend>
            {world.interactions!.choiceGroups!.map(group => <label key={group.id}>
              <input type="checkbox" checked={(goalRules.requiredChoiceGroupIds ?? []).includes(group.id)} onChange={() => toggleRule("requiredChoiceGroupIds", group.id)} />
              <span>{group.label} · {group.actionIds.map(id => world.interactions!.actions.find(action => action.id === id)?.label ?? id).join(" or ")}</span>
            </label>)}
          </fieldset>}
          {world.interactions?.objects.some(object => object.resource) && <fieldset className="setup-rule-group">
            <legend>Fill to finish</legend>
            {world.interactions.objects.filter(object => object.resource).map(object => <label key={object.entityId}>
              <input type="checkbox" checked={(goalRules.requiredResourceIds ?? []).includes(object.entityId)} onChange={() => toggleRule("requiredResourceIds", object.entityId)} />
              <span>{world.entities.find(entity => entity.id === object.entityId)?.label || "Object"} · {object.resource!.capacity} {object.resource!.type.replaceAll("-", " ")}</span>
            </label>)}
          </fieldset>}
        </div>
        <p className="setup-rule-summary">
          {!hasDestination && !world.interactions
            ? "Explore freely. Add a destination to give this world a finish."
            : requiredActionCount
            ? `${requiredActionCount} requirements${hasDestination ? ", then reach a destination" : " to finish"}.`
            : hasDestination ? "Reach a destination. All actions are optional." : "Explore freely. All actions are optional."}
        </p>
        {recovery?.rulesNeedConfirmation && (
          <label className="setup-rule-confirm">
            <input
              type="checkbox"
              checked={rulesConfirmed}
              disabled={feedback.errors.length > 0}
              onChange={(event) => setRulesConfirmed(event.target.checked)}
            />
            <span>I confirm these finishing requirements.</span>
          </label>
        )}
      </fieldset>
      </details>
      <details ref={checks} className="setup-disclosure setup-checks">
        <summary>Placement checks <span>{feedback.errors.length ? `${feedback.errors.length} to resolve` : "No blocking issues"}</span></summary>
      <div className="setup-feedback" aria-live="polite">
        {feedback.errors.map((m) => (
          <p className="setup-error" key={m}>
            {m}
          </p>
        ))}
        {feedback.warnings.map((m) => (
          <p key={m}>{m}</p>
        ))}
      </div>
      </details>
    </Modal>
  );
}
