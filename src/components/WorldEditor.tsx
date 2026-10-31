import { useMemo, useState, type PointerEvent } from "react";
import {
  ArrowUpRight,
  Check,
  ImagePlus,
  Move,
  Plus,
  Trash2,
  Undo2,
} from "lucide-react";
import { Modal } from "./Modal";
import { SketchPad } from "./SketchPad";
import { ArtworkReview } from "./ArtworkReview";
import { extractSketchInk } from "../lib/ink";
import { applyWorldPatch, type WorldPatch } from "../../shared/revisions";
import type { PaperProposal } from "../../shared/amendments";
import type {
  EntityKind,
  PlayState,
  WorldDefinition,
  WorldEntity,
} from "../../shared/world";

const tools = [
  {
    kind: "bridge",
    label: "Bridge",
    hint: "A new way across.",
    width: 220,
    height: 24,
  },
  {
    kind: "terrain",
    label: "Platform",
    hint: "Somewhere new to stand.",
    width: 150,
    height: 28,
  },
  {
    kind: "coin",
    label: "Sunseed",
    hint: "A little light to find.",
    width: 35,
    height: 40,
  },
  {
    kind: "lever",
    label: "Lever",
    hint: "Choose the gate it will wake.",
    width: 53,
    height: 65,
  },
  {
    kind: "gate",
    label: "Gate",
    hint: "A new door to possibility.",
    width: 45,
    height: 150,
  },
] as const;
type Tool = (typeof tools)[number]["kind"] | "move";
const limit = (v: number, low: number, high: number) =>
  Math.min(high, Math.max(low, v));
const title = (e: WorldEntity) =>
  e.label || `${e.kind} · ${Math.round(e.x)}, ${Math.round(e.y)}`;

export function WorldEditor({
  world,
  state,
  onApply,
  onClose,
  proposal,
  initialAdditions,
  revisedImage,
  onBack,
}: {
  world: WorldDefinition;
  state: PlayState;
  onApply: (patch: WorldPatch) => void;
  onClose: () => void;
  proposal?: PaperProposal;
  initialAdditions?: WorldEntity[];
  revisedImage?: string;
  onBack?: () => void;
}) {
  const [additions, setAdditions] = useState<WorldEntity[]>(() =>
    structuredClone(proposal?.patch.additions ?? initialAdditions ?? []),
  );
  const [tool, setTool] = useState<Tool>("bridge");
  const [selected, setSelected] = useState<string | null>(
    proposal?.patch.additions[0]?.id ?? initialAdditions?.[0]?.id ?? null,
  );
  const [reviewed, setReviewed] = useState(false);
  const [paperVisible, setPaperVisible] = useState(Boolean(revisedImage));
  const [drag, setDrag] = useState<{
    x: number;
    y: number;
    currentX: number;
    currentY: number;
    id?: string;
    original?: WorldEntity;
  } | null>(null);
  const [error, setError] = useState("");
  const [drawing, setDrawing] = useState(false);
  const [customArt, setCustomArt] = useState<string | null>(null);
  const item = additions.find((e) => e.id === selected);
  const gates = [...world.entities, ...additions].filter(
    (e) => e.kind === "gate",
  );
  const openGates = new Set(
    world.entities
      .filter((e) => e.kind === "lever" && state.activated.includes(e.id))
      .map((e) => e.targetId),
  );
  const patch = useMemo<WorldPatch>(
    () => ({
      id: crypto.randomUUID(),
      worldId: proposal?.patch.worldId ?? world.id,
      baseRevision: proposal?.patch.baseRevision ?? world.revision,
      origin: proposal ? "meta" : "manual",
      ...(revisedImage ? { sourceImage: revisedImage } : {}),
      additions,
    }),
    [world.id, world.revision, additions, proposal, revisedImage],
  );
  let problem = "";
  if (additions.length) {
    try {
      applyWorldPatch(world, state, patch);
    } catch (e) {
      problem =
        e instanceof Error ? e.message : "This change needs another look.";
    }
  }

  function point(e: PointerEvent<SVGSVGElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    return {
      x: limit(((e.clientX - r.left) * 1440) / r.width, 0, 1440),
      y: limit(((e.clientY - r.top) * 820) / r.height, 0, 820),
    };
  }
  function down(e: PointerEvent<SVGSVGElement>) {
    if (e.button !== 0) return;
    const p = point(e);
    e.currentTarget.setPointerCapture(e.pointerId);
    setError("");
    setReviewed(false);
    const hit = [...additions]
      .reverse()
      .find(
        (a) =>
          p.x >= a.x &&
          p.x <= a.x + a.width &&
          p.y >= a.y &&
          p.y <= a.y + a.height,
      );
    if (hit) {
      setSelected(hit.id);
      setDrag({
        ...p,
        currentX: p.x,
        currentY: p.y,
        id: hit.id,
        original: { ...hit },
      });
      return;
    }
    if (tool === "move") {
      setSelected(null);
      return;
    }
    setDrag({ ...p, currentX: p.x, currentY: p.y });
  }
  function move(e: PointerEvent<SVGSVGElement>) {
    if (!drag) return;
    const p = point(e);
    if (drag.id && drag.original) {
      const original = drag.original;
      setAdditions((items) =>
        items.map((a) =>
          a.id === drag.id
            ? {
                ...a,
                x: limit(original.x + p.x - drag.x, 0, 1440 - a.width),
                y: limit(original.y + p.y - drag.y, 0, 820 - a.height),
              }
            : a,
        ),
      );
    }
    setDrag({ ...drag, currentX: p.x, currentY: p.y });
  }
  function up(e: PointerEvent<SVGSVGElement>) {
    if (!drag) return;
    const p = point(e);
    if (!drag.id && tool !== "move") {
      const config = tools.find((t) => t.kind === tool)!;
      const isClick = Math.hypot(p.x - drag.x, p.y - drag.y) < 12;
      const width = limit(
          isClick ? config.width : Math.abs(p.x - drag.x),
          12,
          800,
        ),
        height = limit(
          isClick ? config.height : Math.abs(p.y - drag.y),
          12,
          300,
        );
      const entity: WorldEntity = {
        id: `drawn-${crypto.randomUUID()}`,
        kind: tool,
        x: limit(
          isClick ? p.x - width / 2 : Math.min(p.x, drag.x),
          0,
          1440 - width,
        ),
        y: limit(
          isClick ? p.y - height / 2 : Math.min(p.y, drag.y),
          0,
          820 - height,
        ),
        width,
        height,
        label: `New ${config.label.toLowerCase()}`,
        ...(tool === "coin" ? { art: "/art/seed.svg" } : {}),
        ...(customArt ? { art: customArt } : {}),
        ...(tool === "lever" && gates.length === 1
          ? { targetId: gates[0].id }
          : {}),
      };
      setAdditions((items) => [...items, entity]);
      setSelected(entity.id);
      setCustomArt(null);
    }
    setDrag(null);
  }
  function update(change: Partial<WorldEntity>) {
    setReviewed(false);
    setAdditions((items) =>
      items.map((e) => (e.id === selected ? { ...e, ...change } : e)),
    );
    setError("");
  }
  function removeSelected() {
    setReviewed(false);
    setAdditions((items) => items.filter((e) => e.id !== selected));
    setSelected(null);
    setError("");
  }
  function apply() {
    try {
      if (revisedImage && !reviewed)
        throw new Error(
          "Check your additions and connections before applying.",
        );
      applyWorldPatch(world, state, patch);
      onApply(patch);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Your current world is safe. Try adjusting the change.",
      );
    }
  }
  const colors =
    world.theme === "moon"
      ? ["#ede9f3", "#c6b9d7", "#9a8baa"]
      : world.theme === "sunset"
        ? ["#f7ebdf", "#dfc2a7", "#b48d73"]
        : ["#f0f1e3", "#c4d0b1", "#8f9f7a"];

  function object(e: WorldEntity, isNew = false) {
    const hero = e.kind === "player",
      x = hero && state.player ? state.player.x - e.width / 2 : e.x,
      y = hero && state.player ? state.player.y - e.height / 2 : e.y;
    const hidden =
      (e.kind === "coin" && state.collected.includes(e.id)) ||
      (e.kind === "gate" && openGates.has(e.id));
    return (
      <g
        key={e.id}
        opacity={hidden ? 0.14 : 1}
        transform={`translate(${x} ${y})`}
        className={isNew ? "editor-new-object" : ""}
      >
        <title>
          {isNew ? "New: " : "Kept: "}
          {title(e)}
        </title>
        {e.art ? (
          <image
            href={e.art}
            width={e.width}
            height={e.height}
            preserveAspectRatio="none"
          />
        ) : e.kind === "lever" ? (
          <g>
            <rect
              x="0"
              y={e.height - 12}
              width={e.width}
              height="12"
              rx="4"
              fill="#93846e"
            />
            <path
              d={`M${e.width / 2} ${e.height - 7}L8 12`}
              stroke="#69634f"
              strokeWidth="5"
            />
            <circle cx="8" cy="12" r="9" fill="#e2bd75" stroke="#9f8558" />
          </g>
        ) : (
          <rect
            width={e.width}
            height={e.height}
            rx={e.kind === "gate" ? 12 : 4}
            fill={
              e.kind === "gate"
                ? "#baa6cd"
                : e.kind === "bridge"
                  ? "#c6a677"
                  : "#ddcfb0"
            }
            stroke={e.kind === "gate" ? "#92809f" : "#8a9675"}
            strokeWidth="3"
          />
        )}
        {isNew && (
          <rect
            x="-5"
            y="-5"
            width={e.width + 10}
            height={e.height + 10}
            rx="6"
            fill="none"
            stroke={e.id === selected ? "#596d49" : "#93a57e"}
            strokeWidth={e.id === selected ? 4 : 2}
            strokeDasharray={e.id === selected ? undefined : "8 5"}
          />
        )}
      </g>
    );
  }
  return (
    <>
      <Modal
        title="Keep the world. Change the possibilities."
        onClose={onClose}
        wide
      >
        <div className="editor-intro">
          <p>
            Make a new path, a new challenge, a new little reason to explore.
            Your character and everything you’ve earned stay with you.
          </p>
          <span className="editor-origin">
            {proposal
              ? `${proposal.provider} · proposed additions`
              : "Manual world edit · preview"}
          </span>
        </div>
        {revisedImage && (
          <div className="paper-review-header">
            <div>
              <strong>
                {proposal?.summary ||
                  "Place the new marks into your existing world."}
              </strong>
              <p>
                Existing objects stay fixed. Correct new shapes, sizes, and gate
                connections here.
              </p>
            </div>
            <button
              className="secondary-button"
              aria-pressed={paperVisible}
              onClick={() => setPaperVisible(!paperVisible)}
            >
              {paperVisible ? "Show world view" : "Show revised page"}
            </button>
            {onBack && (
              <button className="text-button" onClick={onBack}>
                Back to page
              </button>
            )}
          </div>
        )}
        <div className="editor-tools" role="group" aria-label="Objects to add">
          {tools.map((t) => (
            <button
              key={t.kind}
              aria-pressed={tool === t.kind}
              onClick={() => {
                setTool(t.kind);
                setSelected(null);
              }}
            >
              <Plus size={13} />
              {t.label}
            </button>
          ))}
          <button
            aria-label="Select and move new objects"
            aria-pressed={tool === "move"}
            onClick={() => setTool("move")}
          >
            <Move size={15} />
          </button>
        </div>
        <div className="editor-canvas-wrap">
          <svg
            className="editor-canvas"
            viewBox="0 0 1440 820"
            aria-label="World edit canvas. Select an object type, then drag on the world to place it. Existing objects are kept."
            onPointerDown={down}
            onPointerMove={move}
            onPointerUp={up}
            onPointerCancel={() => setDrag(null)}
          >
            <rect width="1440" height="820" fill={colors[0]} />
            <circle cx="1120" cy="175" r="76" fill="#f0dba5" opacity=".6" />
            <path
              d="M0 550Q300 300 670 500T1440 470V820H0Z"
              fill={colors[1]}
              opacity=".6"
            />
            <path
              d="M0 650Q600 390 1440 650V820H0Z"
              fill={colors[2]}
              opacity=".45"
            />
            {paperVisible && revisedImage && (
              <image
                href={revisedImage}
                width="1440"
                height="820"
                preserveAspectRatio="none"
              />
            )}
            <g opacity={paperVisible ? 0.25 : 1}>
              {world.entities.map((e) => object(e))}
            </g>
            {additions.map((e) => object(e, true))}
            {drag && !drag.id && (
              <rect
                x={Math.min(drag.x, drag.currentX)}
                y={Math.min(drag.y, drag.currentY)}
                width={Math.max(4, Math.abs(drag.currentX - drag.x))}
                height={Math.max(4, Math.abs(drag.currentY - drag.y))}
                fill="#9cac7d50"
                stroke="#647953"
                strokeWidth="3"
                strokeDasharray="8 5"
              />
            )}
          </svg>
          <span className="editor-canvas-caption">
            {tool === "move"
              ? "Drag a new object to move it. Existing objects stay put."
              : `${tools.find((t) => t.kind === tool)?.hint} Click to place, or drag to choose its size.`}
          </span>
        </div>
        <div className="editor-bottom">
          <section
            className="editor-properties"
            aria-label="Selected object settings"
          >
            {item ? (
              <>
                <div className="editor-selection-heading">
                  <strong>
                    {tools.find((t) => t.kind === item.kind)?.label ??
                      item.kind}
                  </strong>
                  <button
                    className="icon-button"
                    aria-label="Remove selected new object"
                    onClick={removeSelected}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
                <label>
                  Object role
                  <select
                    aria-label="Selected object role"
                    value={item.kind}
                    onChange={(e) =>
                      update({
                        kind: e.target.value as EntityKind,
                        targetId: undefined,
                      })
                    }
                  >
                    {[
                      ["bridge", "Bridge"],
                      ["terrain", "Platform"],
                      ["coin", "Sunseed"],
                      ["lever", "Lever"],
                      ["gate", "Gate"],
                      ["goal", "Destination"],
                      ["decoration", "Decoration"],
                    ].map(([kind, label]) => (
                      <option key={kind} value={kind}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Give it a name
                  <input
                    aria-label="New object name"
                    value={item.label ?? ""}
                    maxLength={60}
                    onChange={(e) => update({ label: e.target.value })}
                  />
                </label>
                <div className="editor-dimensions">
                  {(["x", "y", "width", "height"] as const).map((key) => (
                    <label key={key}>
                      {key === "width"
                        ? "Width"
                        : key === "height"
                          ? "Height"
                          : key.toUpperCase()}
                      <input
                        aria-label={`Object ${key}`}
                        type="number"
                        value={Math.round(item[key])}
                        min={key === "width" || key === "height" ? 12 : 0}
                        max={
                          key === "x"
                            ? 1440 - item.width
                            : key === "y"
                              ? 820 - item.height
                              : key === "width"
                                ? 1440 - item.x
                                : 820 - item.y
                        }
                        onChange={(e) => {
                          const n = Number(e.target.value);
                          if (Number.isFinite(n))
                            update({
                              [key]: limit(
                                n,
                                key === "width" || key === "height" ? 12 : 0,
                                key === "x"
                                  ? 1440 - item.width
                                  : key === "y"
                                    ? 820 - item.height
                                    : key === "width"
                                      ? 1440 - item.x
                                      : 820 - item.y,
                              ),
                            });
                        }}
                      />
                    </label>
                  ))}
                </div>
                {item.kind === "lever" && (
                  <label>
                    Which gate should it wake?
                    <select
                      aria-label="Gate controlled by this lever"
                      value={item.targetId ?? ""}
                      onChange={(e) =>
                        update({ targetId: e.target.value || undefined })
                      }
                    >
                      <option value="">Choose a gate…</option>
                      {gates.map((g) => (
                        <option key={g.id} value={g.id}>
                          {title(g)}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </>
            ) : (
              <div className="editor-empty-selection">
                <Move size={22} />
                <p>
                  Choose an object above, then place it in the world. Select any
                  new object to fine-tune it.
                </p>
              </div>
            )}
          </section>
          <section className="editor-summary">
            <ArtworkReview entities={additions} />
            {proposal && (
              <div className="paper-evidence">
                <strong>What the model saw</strong>
                {proposal.evidence
                  .filter((e) => additions.some((a) => a.id === e.id))
                  .map((e) => (
                    <p key={e.id}>
                      <span>
                        {e.confidence === "review"
                          ? "Needs your review"
                          : "Proposed"}
                      </span>{" "}
                      {e.reason}
                    </p>
                  ))}
                {proposal.warnings.map((warning, i) => (
                  <p key={i}>{warning}</p>
                ))}
              </div>
            )}
            <h3>
              <Check size={16} /> Your adventure comes with you
            </h3>
            <p>
              {state.collected.length} collected{" "}
              {state.collected.length === 1 ? "sunseed" : "sunseeds"} ·{" "}
              {state.activated.length} used{" "}
              {state.activated.length === 1 ? "lever" : "levers"} · character
              position kept
            </p>
            <div className="editor-art-action">
              <button
                className="secondary-button"
                onClick={() => setDrawing(true)}
              >
                <ImagePlus size={15} /> Draw your own object
              </button>
              {customArt && (
                <span>
                  Your drawing is ready for the next object you place.
                </span>
              )}
            </div>
            <p className="editor-scope">
              Original objects are protected. This edit adds {additions.length}{" "}
              new {additions.length === 1 ? "object" : "objects"} to version{" "}
              {world.revision}.
            </p>
            {(problem || error) && (
              <p className="editor-error" role="alert">
                {error || problem}
              </p>
            )}
            {revisedImage && (
              <label className="paper-review-confirm">
                <input
                  type="checkbox"
                  checked={reviewed}
                  onChange={(e) => setReviewed(e.target.checked)}
                />
                I checked the new objects, their placement, and lever
                connections.
              </label>
            )}
            <div className="editor-apply-actions">
              <button
                className="text-button"
                disabled={!additions.length}
                onClick={() => {
                  setReviewed(false);
                  setAdditions((items) => items.slice(0, -1));
                  setSelected(null);
                  setError("");
                }}
              >
                <Undo2 size={15} /> Remove last
              </button>
              <button
                className="primary-button"
                disabled={
                  !additions.length ||
                  Boolean(problem) ||
                  (Boolean(revisedImage) && !reviewed)
                }
                onClick={apply}
              >
                Apply & keep playing <ArrowUpRight size={17} />
              </button>
            </div>
          </section>
        </div>
      </Modal>
      {drawing && (
        <SketchPad
          onClose={() => setDrawing(false)}
          onUse={(image) => {
            void extractSketchInk(image)
              .then((ink) => {
                if (item)
                  update({
                    art: ink,
                    artMethod: undefined,
                    artNote: undefined,
                  });
                else setCustomArt(ink);
                setDrawing(false);
              })
              .catch((e) => {
                setError(
                  e instanceof Error
                    ? e.message
                    : "Your object could not be read.",
                );
                setDrawing(false);
              });
          }}
        />
      )}
    </>
  );
}
