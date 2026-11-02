import {
  useMemo,
  useEffect,
  useRef,
  useState,
  type PointerEvent,
  type KeyboardEvent,
} from "react";
import {
  ArrowUpRight,
  Check,
  ChevronDown,
  ImagePlus,
  Hand,
  Focus,
  ZoomIn,
  ZoomOut,
  Move,
  Plus,
  Trash2,
  Undo2,
  Crop,
  LoaderCircle,
} from "lucide-react";
import { Modal } from "./Modal";
import "./editor-viewport.css";
import {
  editorFitScale,
  editorView,
  editorPoint,
  editorCenter,
} from "../lib/editorViewport";
import { SketchPad } from "./SketchPad";
import { ArtworkReview } from "./ArtworkReview";
import { extractSketchInk } from "../lib/ink";
import { prepareSourceArtwork } from "../lib/source-art";
import { applyWorldPatch, type WorldPatch } from "../../shared/revisions";
import type { PaperProposal } from "../../shared/amendments";
import {
  movementMode,
  type EntityKind,
  type PlayState,
  type WorldDefinition,
  type WorldEntity,
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
    label: "Collectible",
    hint: "A little light to find.",
    width: 35,
    height: 40,
  },
  {
    kind: "goal",
    label: "Destination",
    hint: "Where this adventure ends.",
    width: 110,
    height: 140,
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
  const mode = movementMode(world);
  const hero = world.entities.find((entity) => entity.kind === "player");
  const sourceBackdrop = world.entities.find(
    (entity) =>
      entity.kind === "decoration" &&
      entity.artNote ===
        "Full original image used as the world backdrop; generated gameplay is separate.",
  );
  const editorTools = tools
    .filter(
      (config) =>
        mode === "platform" ||
        (mode === "roam"
          ? config.kind !== "bridge"
          : ["coin", "lever", "goal"].includes(config.kind)),
    )
    .map((config) => ({
      ...config,
      label:
        mode === "discover"
          ? config.kind === "coin"
            ? "Findable region"
            : config.kind === "lever"
              ? "Interactive region"
              : "Final region"
          : mode === "roam" && config.kind === "terrain"
            ? "Obstacle"
            : config.label,
      hint:
        mode === "discover"
          ? "Place a region over a detail in the original image."
          : mode === "roam" && config.kind === "terrain"
            ? "An obstacle to move around."
            : config.kind === "lever" && mode !== "platform"
              ? "An interaction, with an optional gate connection."
              : config.hint,
    }));
  const [bounds, setBounds] = useState({
    width: world.width,
    height: world.height,
  });
  const expanded =
    bounds.width !== world.width || bounds.height !== world.height;
  const [additions, setAdditions] = useState<WorldEntity[]>(() =>
    structuredClone(proposal?.patch.additions ?? initialAdditions ?? []),
  );
  const [modified, setModified] = useState<Record<string, WorldEntity>>({});
  const currentEntities = world.entities.map(entity => modified[entity.id] ?? entity);
  const editableEntities = [...currentEntities.filter(entity => entity.id !== sourceBackdrop?.id), ...additions];
  const changedCount = Object.keys(modified).length;
  const [tool, setTool] = useState<Tool>("move");
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
  const [preparingArtwork, setPreparingArtwork] = useState(false);
  const artworkRequest = useRef<AbortController | null>(null);
  const selectedNow = useRef(selected);
  selectedNow.current = selected;
  const pageNow = useRef({
    image: revisedImage,
    worldId: world.id,
    revision: world.revision,
  });
  pageNow.current = {
    image: revisedImage,
    worldId: world.id,
    revision: world.revision,
  };
  useEffect(() => () => artworkRequest.current?.abort(), []);
  const canvas = useRef<SVGSVGElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const [viewportSize, setViewportSize] = useState({ width: 800, height: 360 });
  const [detailScale, setDetailScale] = useState<number | null>(null);
  const [center, setCenter] = useState({
    x: world.width / 2,
    y: world.height / 2,
  });
  const [panMode, setPanMode] = useState(false);
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [panning, setPanning] = useState(false);
  const pan = useRef<{
    x: number;
    y: number;
    center: { x: number; y: number };
  } | null>(null);
  const fitScale = editorFitScale(bounds, viewportSize);
  const scale =
    detailScale === null ? fitScale : limit(detailScale, fitScale, 2);
  const view = editorView(
    bounds,
    viewportSize,
    scale,
    detailScale === null
      ? { x: bounds.width / 2, y: bounds.height / 2 }
      : center,
  );
  useEffect(() => {
    const node = viewport.current;
    if (!node) return;
    const observer = new ResizeObserver(() => {
      const { width, height } = node.getBoundingClientRect();
      if (width > 0 && height > 0) setViewportSize({ width, height });
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  function zoomTo(value: number) {
    setCenter(editorCenter(view));
    setDetailScale(limit(value, fitScale, 2));
  }
  function fitWorld() {
    setDetailScale(null);
    setPanMode(false);
  }
  function focusObject(entity: WorldEntity) {
    const nextScale = Math.min(
      2,
      Math.max(
        fitScale,
        Math.min(
          viewportSize.width / (entity.width + 160),
          viewportSize.height / (entity.height + 160),
        ),
      ),
    );
    setCenter({
      x: entity.x + entity.width / 2,
      y: entity.y + entity.height / 2,
    });
    setDetailScale(nextScale);
  }
  function stopPointer() {
    pan.current = null;
    setPanning(false);
    setDrag(null);
  }
  const item = editableEntities.find((e) => e.id === selected);
  const existingSelected = Boolean(item && world.entities.some(entity => entity.id === item.id));
  function changeEntity(id: string, change: Partial<WorldEntity>) {
    const original = world.entities.find(entity => entity.id === id);
    if (original) {
      setModified(items => ({...items, [id]: {...(items[id] ?? original), ...change, id: original.id, kind: original.kind}}));
    } else setAdditions(items => items.map(entity => entity.id === id ? {...entity, ...change} : entity));
  }
  function cancelArtwork() {
    artworkRequest.current?.abort();
    artworkRequest.current = null;
    setPreparingArtwork(false);
  }
  function selectObject(id: string | null) {
    if (id !== selectedNow.current) cancelArtwork();
    selectedNow.current = id;
    setSelected(id);
  }
  useEffect(() => {
    cancelArtwork();
  }, [revisedImage, world.id, world.revision]);
  async function usePageArtwork() {
    if (!item || !revisedImage || artworkRequest.current) return;
    const snapshot = { ...item },
      image = revisedImage;
    if (
      snapshot.x < 0 ||
      snapshot.y < 0 ||
      snapshot.width <= 0 ||
      snapshot.height <= 0 ||
      snapshot.x + snapshot.width > 1440 ||
      snapshot.y + snapshot.height > 820
    ) {
      setError(
        "This selection is outside the revised page's 1440 × 820 area. Move its box over the complete page mark before cropping. Artwork is unchanged.",
      );
      return;
    }
    const source = {
      x: snapshot.x / 1.44,
      y: snapshot.y / 0.82,
      width: snapshot.width / 1.44,
      height: snapshot.height / 0.82,
    };
    const controller = new AbortController();
    artworkRequest.current = controller;
    setPreparingArtwork(true);
    setReviewed(false);
    setError("");
    const worldId = world.id,
      revision = world.revision;
    try {
      const prepared = await prepareSourceArtwork(
        {
          ...world,
          sourceImage: image,
          entities: [
            ...world.entities.map((entity) => ({
              ...entity,
              artSource: undefined,
            })),
            {
              ...snapshot,
              // Role-independent cropping must also work before a new lever is connected.
              kind: "decoration",
              art: undefined,
              artMethod: undefined,
              artNote: undefined,
              artSource: source,
              artShape: "box",
            },
          ],
        },
        controller.signal,
      );
      if (
        controller.signal.aborted ||
        artworkRequest.current !== controller ||
        selectedNow.current !== snapshot.id ||
        pageNow.current.image !== image ||
        pageNow.current.worldId !== worldId ||
        pageNow.current.revision !== revision
      )
        return;
      const crop = prepared.entities.find(
        (entity) => entity.id === snapshot.id,
      );
      if (!crop?.art)
        throw new Error(
          "The selected page artwork could not be prepared. Artwork is unchanged.",
        );
      setAdditions((items) =>
        items.map((entity) =>
          entity.id === snapshot.id &&
          (["x", "y", "width", "height"] as const).every(
            (key) => entity[key] === snapshot[key],
          )
            ? {
                ...entity,
                art: crop.art,
                artSource: source,
                artShape: "box",
                artMethod: crop.artMethod,
                artNote:
                  world.inputKind === "picture"
                    ? "Selected by you from the revised picture. Background inside this crop is included."
                    : "Selected by you from the revised page with paper-background removal. Check the complete outline.",
              }
            : entity,
        ),
      );
    } catch (reason) {
      if (!controller.signal.aborted && artworkRequest.current === controller)
        setError(
          `${reason instanceof Error ? reason.message : "The page artwork could not be prepared."} Artwork is unchanged.`,
        );
    } finally {
      if (artworkRequest.current === controller) {
        artworkRequest.current = null;
        if (!controller.signal.aborted) setPreparingArtwork(false);
      }
    }
  }
  const gates = [...currentEntities, ...additions].filter(
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
      origin: changedCount ? "manual" : proposal ? "meta" : "manual",
      ...(revisedImage ? { sourceImage: revisedImage } : {}),
      additions,
      ...(changedCount ? { updates: Object.values(modified).map(entity => ({id: entity.id, x: entity.x, y: entity.y, width: entity.width, height: entity.height, label: entity.label, targetId: entity.targetId ?? null})) } : {}),
      ...(expanded ? { bounds } : {}),
    }),
    [
      world.id,
      world.revision,
      additions,
      modified,
      changedCount,
      proposal,
      revisedImage,
      bounds,
      expanded,
    ],
  );
  let problem = "";
  if (additions.length || changedCount || expanded) {
    try {
      applyWorldPatch(world, state, patch);
    } catch (e) {
      problem =
        e instanceof Error ? e.message : "This change needs another look.";
    }
  }

  function point(e: PointerEvent<SVGSVGElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    const p = editorPoint(
      view,
      { width: r.width, height: r.height },
      { x: e.clientX - r.left, y: e.clientY - r.top },
    );
    return {
      x: limit(p.x, 0, bounds.width),
      y: limit(p.y, 0, bounds.height),
      inside:
        p.x >= 0 && p.x <= bounds.width && p.y >= 0 && p.y <= bounds.height,
    };
  }
  function down(e: PointerEvent<SVGSVGElement>) {
    if (e.button !== 0 && e.button !== 1) return;
    e.preventDefault();
    e.currentTarget.focus();
    e.currentTarget.setPointerCapture(e.pointerId);
    if (panMode || spaceHeld || e.button === 1) {
      pan.current = { x: e.clientX, y: e.clientY, center: editorCenter(view) };
      setPanning(true);
      return;
    }
    const p = point(e);
    if (!p.inside) return;
    setError("");
    setReviewed(false);
    const hit = [...editableEntities]
      .reverse()
      .find(
        (a) =>
          p.x >= a.x &&
          p.x <= a.x + a.width &&
          p.y >= a.y &&
          p.y <= a.y + a.height,
      );
    if (hit) {
      selectObject(hit.id);
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
      selectObject(null);
      return;
    }
    if (world.entities.length + additions.length >= 160) {
      setError("This world has reached its 160-object limit.");
      return;
    }
    setDrag({ ...p, currentX: p.x, currentY: p.y });
  }
  function move(e: PointerEvent<SVGSVGElement>) {
    if (pan.current) {
      const initial = pan.current;
      const next = editorView(bounds, viewportSize, scale, {
        x: initial.center.x - (e.clientX - initial.x) / scale,
        y: initial.center.y - (e.clientY - initial.y) / scale,
      });
      setCenter(editorCenter(next));
      setDetailScale(scale);
      return;
    }
    if (!drag) return;
    const p = point(e);
    if (drag.id && drag.original) {
      cancelArtwork();
      const original = drag.original;
      changeEntity(drag.id, {
        x: limit(original.x + p.x - drag.x, 0, bounds.width - original.width),
        y: limit(original.y + p.y - drag.y, 0, bounds.height - original.height),
      });
    }
    setDrag({ ...drag, currentX: p.x, currentY: p.y });
  }
  function up(e: PointerEvent<SVGSVGElement>) {
    if (pan.current) {
      stopPointer();
      return;
    }
    if (!drag) return;
    const p = point(e);
    if (!drag.id && tool !== "move") {
      const config = editorTools.find((t) => t.kind === tool)!;
      const isClick = Math.hypot(p.x - drag.x, p.y - drag.y) * scale < 6;
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
          bounds.width - width,
        ),
        y: limit(
          isClick ? p.y - height / 2 : Math.min(p.y, drag.y),
          0,
          bounds.height - height,
        ),
        width,
        height,
        label: `New ${config.label.toLowerCase()}`,
        ...(tool === "coin" && mode === "platform"
          ? { art: "/art/seed.svg" }
          : {}),
        ...(customArt ? { art: customArt } : {}),
        ...(tool === "lever" && gates.length === 1
          ? { targetId: gates[0].id }
          : {}),
      };
      setAdditions((items) => [...items, entity]);
      selectObject(entity.id);
      setCustomArt(null);
    }
    setDrag(null);
  }
  function update(change: Partial<WorldEntity>) {
    cancelArtwork();
    setReviewed(false);
    if (selected) changeEntity(selected, change);
    setError("");
  }
  function insertAtCenter() {
    if (tool === "move") return;
    const config = editorTools.find((t) => t.kind === tool)!;
    const entity: WorldEntity = {
      id: `drawn-${crypto.randomUUID()}`,
      kind: tool,
      x: Math.round(
        limit(
          view.x + view.width / 2 - config.width / 2,
          0,
          bounds.width - config.width,
        ),
      ),
      y: Math.round(
        limit(
          view.y + view.height / 2 - config.height / 2,
          0,
          bounds.height - config.height,
        ),
      ),
      width: config.width,
      height: config.height,
      label: `New ${config.label.toLowerCase()}`,
      ...(tool === "coin" && mode === "platform"
        ? { art: "/art/seed.svg" }
        : {}),
      ...(customArt ? { art: customArt } : {}),
      ...(tool === "lever" && gates.length === 1
        ? { targetId: gates[0].id }
        : {}),
    };
    setAdditions((items) => [...items, entity]);
    selectObject(entity.id);
    setCustomArt(null);
    setReviewed(false);
    setError("");
    requestAnimationFrame(() => canvas.current?.focus());
  }
  function canvasKey(event: KeyboardEvent<SVGSVGElement>) {
    if (event.key === " ") {
      event.preventDefault();
      setSpaceHeld(true);
      return;
    }
    if (event.key === "+" || event.key === "=") {
      event.preventDefault();
      zoomTo(scale * 1.5);
      return;
    }
    if (event.key === "-") {
      event.preventDefault();
      zoomTo(scale / 1.5);
      return;
    }
    if (event.key === "0") {
      event.preventDefault();
      fitWorld();
      return;
    }
    if (event.key.toLowerCase() === "f" && item) {
      event.preventDefault();
      focusObject(item);
      return;
    }
    if (panMode || !item) {
      const shifts: Record<string, [number, number]> = {
        ArrowLeft: [-1, 0],
        ArrowRight: [1, 0],
        ArrowUp: [0, -1],
        ArrowDown: [0, 1],
      };
      const delta = shifts[event.key];
      if (delta) {
        event.preventDefault();
        const current = editorCenter(view);
        const next = editorView(bounds, viewportSize, scale, {
          x: current.x + (delta[0] * view.width) / 4,
          y: current.y + (delta[1] * view.height) / 4,
        });
        setCenter(editorCenter(next));
        setDetailScale(scale);
      }
      return;
    }
    const step = event.shiftKey ? 1 : 10;
    const movement: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    const delta = movement[event.key];
    if (delta) {
      event.preventDefault();
      const moved = {
        ...item,
        x: limit(item.x + delta[0], 0, bounds.width - item.width),
        y: limit(item.y + delta[1], 0, bounds.height - item.height),
      };
      update({ x: moved.x, y: moved.y });
      if (
        moved.x < view.x ||
        moved.x + moved.width > view.x + view.width ||
        moved.y < view.y ||
        moved.y + moved.height > view.y + view.height
      ) {
        setCenter({
          x: moved.x + moved.width / 2,
          y: moved.y + moved.height / 2,
        });
        setDetailScale(scale);
      }
    }
    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      removeSelected();
    }
  }
  function removeSelected() {
    setReviewed(false);
    if (existingSelected && selected) {
      setModified(items => { const next = {...items}; delete next[selected]; return next; });
    } else { setAdditions(items => items.filter(entity => entity.id !== selected)); selectObject(null); }
    setError("");
  }
  function apply() {
    if (preparingArtwork || artworkRequest.current) return;
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
    const x = e.x, y = e.y;
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
          {isNew ? "New: " : ""}
          {title(e)}
        </title>
        {mode === "discover" && ["coin", "lever", "goal"].includes(e.kind) ? (
          <rect
            width={e.width}
            height={e.height}
            rx="3"
            fill="#66864a"
            fillOpacity="0.10"
            stroke="#55763d"
            strokeWidth="1.5"
            vectorEffect="non-scaling-stroke"
          />
        ) : e.art ? (
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
        {(isNew || e.id === selected) && (
          <rect
            x="-5"
            y="-5"
            width={e.width + 10}
            height={e.height + 10}
            rx="6"
            fill="none"
            stroke={e.id === selected ? "var(--selection)" : "var(--selection-muted)"}
            strokeWidth={e.id === selected ? 2 : 1}
            vectorEffect="non-scaling-stroke"
            strokeDasharray={e.id === selected ? undefined : "8 5"}
          />
        )}
      </g>
    );
  }
  return (
    <>
      <Modal title="Edit world" onClose={onClose} wide className="world-editor-modal" footer={<div className="editor-footer">
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
                {mode === "discover"
                  ? "I checked the regions and their placement in the image."
                  : "I checked the new objects, their placement, and interactions."}
              </label>
            )}
            <div className="editor-apply-actions">
              <button
                className="text-button"
                disabled={!additions.length}
                onClick={() => {
                  setReviewed(false);
                  setAdditions((items) => items.slice(0, -1));
                  selectObject(null);
                  setError("");
                }}
              >
                <Undo2 size={15} /> Remove last
              </button>
              <button
                className="primary-button"
                disabled={
                  (!additions.length && !changedCount && !expanded) ||
                  preparingArtwork ||
                  Boolean(problem) ||
                  (Boolean(revisedImage) && !reviewed)
                }
                onClick={apply}
              >
                Apply changes <ArrowUpRight size={17} />
              </button>
            </div>
</div>}>
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
          {mode !== "discover" && (
            <button
              onClick={() => {
                setBounds((b) => ({
                  ...b,
                  width: Math.min(12000, b.width + 1440),
                }));
                setReviewed(false);
              }}
              disabled={bounds.width >= 12000}
              aria-label="Extend world to the right"
            >
              <Plus size={13} /> Add space
            </button>
          )}
          <label className="editor-tool-picker">
            Tool
            <select aria-label="Placement tool" value={tool} onChange={(event) => {
              setTool(event.target.value as typeof tool);
              setPanMode(false);
              if (event.target.value !== "move") selectObject(null);
            }}>
              <option value="move">Select & move</option>
              {editorTools.map((entry) => <option key={entry.kind} value={entry.kind}>Add {entry.label.toLowerCase()}</option>)}
            </select>
          </label>            {mode !== "discover" && (
              <div className="editor-art-action">
                <button
                  className="secondary-button"
                  onClick={() => { selectObject(null); setDrawing(true); }}
                >
                  <ImagePlus size={15} /> Draw your own object
                </button>
                {customArt && (
                  <span>
                    Your drawing is ready for the next object you place.
                  </span>
                )}
              </div>
            )}

        </div>
        <div className="editor-keyboard-controls">
          {tool !== "move" && <button
            className="secondary-button"
            disabled={world.entities.length + additions.length >= 160}
            onClick={insertAtCenter}
          >
            Add{" "}
            {editorTools.find((t) => t.kind === tool)?.label.toLowerCase() ??
              "object"}{" "}
            at center
          </button>}
          {editableEntities.length > 0 && (
            <label>
              Object{" "}
              <select
                aria-label="Select an object"
                value={selected ?? ""}
                onChange={(e) => {
                  selectObject(e.target.value || null);
                  const next = editableEntities.find((a) => a.id === e.target.value);
                  if (next) focusObject(next);
                }}
              >
                <option value="">Choose an object…</option>
                {editableEntities.map((e) => (
                  <option key={e.id} value={e.id}>
                    {title(e)}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        {world.entities.length + additions.length >= 160 && (
          <p className="modal-copy" role="status">
            This world has reached its 160-object limit.
          </p>
        )}
        <div className="editor-workbench">
        <div className="editor-canvas-wrap">
          <div
            className="editor-viewport-toolbar"
            role="group"
            aria-label="World view controls"
          >
            <button
              aria-label="Zoom out"
              disabled={scale <= fitScale}
              onClick={() => zoomTo(scale / 1.5)}
            >
              <ZoomOut size={16} />
            </button>
            <label className="editor-zoom-control">
              <input
                aria-label="World zoom"
                type="range"
                min={Math.floor(fitScale * 1000)}
                max="2000"
                step="1"
                value={Math.round(scale * 1000)}
                onChange={(e) => zoomTo(Number(e.target.value) / 1000)}
              />
              <output aria-live="off">{Math.round(scale * 100)}%</output>
            </label>
            <button
              aria-label="Zoom in"
              disabled={scale >= 2}
              onClick={() => zoomTo(scale * 1.5)}
            >
              <ZoomIn size={16} />
            </button>
            <button aria-pressed={detailScale === null} onClick={fitWorld}>
              Fit world
            </button>

            <button
              aria-pressed={panMode}
              onClick={() => {
                setPanMode(!panMode);
                setDrag(null);
              }}
            >
              <Hand size={16} /> Pan
            </button>

            <details className="editor-view-options">
              <summary>View <ChevronDown size={14} aria-hidden="true" /></summary>
              <div>
                <button onClick={() => zoomTo(1)}>Actual size · 100%</button>
                {hero && <button onClick={() => focusObject({ ...hero, ...(state.player ? { x: state.player.x - hero.width / 2, y: state.player.y - hero.height / 2 } : {}) })}><Focus size={16} /> Character</button>}
                <button disabled={!item} onClick={() => item && focusObject(item)}><Focus size={16} /> Selection</button>
              </div>
            </details>
          </div>
          <div
            ref={viewport}
            className="editor-detail-viewport"
            data-pan={panMode || spaceHeld}
            data-panning={panning}
          >
            <svg
              ref={canvas}
              tabIndex={0}
              role="group"
              className="editor-canvas"
              viewBox={`${view.x} ${view.y} ${view.width} ${view.height}`}
              preserveAspectRatio="none"
              aria-label="World edit canvas. Arrows move the selected object by ten units, Shift and arrows by one. Delete removes it. Pan mode or holding Space drags the view. Plus and minus zoom, zero fits the world, F focuses selection. Object identities and earned progress are kept."
              onKeyDown={canvasKey}
              onKeyUp={(e) => {
                if (e.key === " ") setSpaceHeld(false);
              }}
              onBlur={() => {
                setSpaceHeld(false);
                stopPointer();
              }}
              onPointerDown={down}
              onPointerMove={move}
              onPointerUp={up}
              onPointerCancel={stopPointer}
              onLostPointerCapture={stopPointer}
            >
              <rect
                width={bounds.width}
                height={bounds.height}
                fill={colors[0]}
              />
              {mode === "platform" && !sourceBackdrop && (
                <>
                  <circle
                    cx="1120"
                    cy="175"
                    r="76"
                    fill="#f0dba5"
                    opacity=".6"
                  />
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
                </>
              )}
              {paperVisible && revisedImage && (
                <image
                  href={revisedImage}
                  width="1440"
                  height="820"
                  preserveAspectRatio="none"
                />
              )}
              <g opacity={paperVisible ? 0.25 : 1}>
                {sourceBackdrop && mode !== "platform" && object(sourceBackdrop)}
                {currentEntities
                  .filter((entity) => entity.id !== sourceBackdrop?.id)
                  .map((e) => object(e))}
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
            <span className="editor-viewport-position" aria-hidden="true">
              {Math.round(Math.max(0, view.x))},{" "}
              {Math.round(Math.max(0, view.y))} ·{" "}
              {bounds.width.toLocaleString()} × {bounds.height.toLocaleString()}
            </span>
          </div>
          <span className="editor-canvas-caption">
            {panMode
              ? "Drag to explore the world, or focus the canvas and use arrow keys. Fit world restores the overview."
              : item
                ? "Arrows move · Shift for precision · Space to pan · F to focus"
                : tool === "move"
                  ? "Select an object to move it, or add a new one."
                  : `${editorTools.find((t) => t.kind === tool)?.hint} Click to place, or drag to choose its size.`}
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
                    {item.kind === "player" ? "Character" : editorTools.find((t) => t.kind === item.kind)?.label ?? item.kind}
                  </strong>
                  <button
                    className="icon-button"
                    aria-label={existingSelected ? "Reset selected object changes" : "Remove selected object"}
                    onClick={removeSelected}
                  >
                    {existingSelected ? <Undo2 size={16} /> : <Trash2 size={16} />}
                  </button>
                </div>
                {item.art && mode !== "discover" && (
                  <div className="editor-inspected-art">
                    <img src={item.art} alt={`${title(item)} artwork`} />
                    <span>
                      {item.artSource
                        ? "Source-page artwork"
                        : item.art.startsWith("/art/")
                          ? "Built-in artwork"
                          : "Custom artwork"}
                      <br />
                      {Math.round(item.width)} × {Math.round(item.height)} world
                      units
                    </span>
                  </div>
                )}
                {!existingSelected && <label>
                  Object role
                  <select
                    aria-label="Selected object role"
                    disabled={existingSelected}
                    title={existingSelected ? "This role is referenced by the world rules." : undefined}
                    value={item.kind}
                    onChange={(e) =>
                      update({
                        kind: e.target.value as EntityKind,
                        targetId: undefined,
                      })
                    }
                  >
                    {[
                      ...editorTools.map((config) => [
                        config.kind,
                        config.label,
                      ]),
                      ["decoration", "Decoration"],
                      ...(editorTools.some(
                        (config) => config.kind === item.kind,
                      ) || item.kind === "decoration"
                        ? []
                        : [[item.kind, item.kind]]),
                    ].map(([kind, label]) => (
                      <option key={kind} value={kind}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>}
                <label>
                  Name
                  <input
                    aria-label="Object name"
                    value={item.label ?? ""}
                    maxLength={60}
                    onChange={(e) => update({ label: e.target.value })}
                  />
                </label>
                {item.kind === "player" && <p className="editor-scope">Starting position · current run unchanged</p>}
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
                            ? bounds.width - item.width
                            : key === "y"
                              ? bounds.height - item.height
                              : key === "width"
                                ? bounds.width - item.x
                                : bounds.height - item.y
                        }
                        onChange={(e) => {
                          const n = Number(e.target.value);
                          if (Number.isFinite(n))
                            update({
                              [key]: limit(
                                n,
                                key === "width" || key === "height" ? 12 : 0,
                                key === "x"
                                  ? bounds.width - item.width
                                  : key === "y"
                                    ? bounds.height - item.height
                                    : key === "width"
                                      ? bounds.width - item.x
                                      : bounds.height - item.y,
                              ),
                            });
                        }}
                      />
                    </label>
                  ))}
                </div>
                {revisedImage && mode !== "discover" && !existingSelected && (
                  <div className="editor-page-art">
                    <button
                      className="secondary-button"
                      disabled={preparingArtwork}
                      aria-busy={preparingArtwork}
                      onClick={() => void usePageArtwork()}
                    >
                      {preparingArtwork ? (
                        <LoaderCircle size={16} className="spin" />
                      ) : (
                        <Crop size={16} />
                      )}
                      {preparingArtwork
                        ? "Preparing artwork…"
                        : "Use page artwork"}
                    </button>
                    <p>
                      {item.artSource &&
                      item.artNote?.startsWith(
                        "Selected by you from the revised",
                      )
                        ? item.artNote
                        : "Crops this box from your revised page. Include the complete mark before applying."}
                    </p>
                  </div>
                )}
                {item.kind === "lever" && (
                  <label>
                    {mode === "platform"
                      ? "Gate opened by this lever"
                      : "Gate connection (optional)"}
                    <select
                      aria-label="Gate controlled by this lever"
                      value={item.targetId ?? ""}
                      onChange={(e) =>
                        update({ targetId: e.target.value || undefined })
                      }
                    >
                      <option value="">
                        {mode === "platform"
                          ? "Choose a gate…"
                          : "Activate without a gate"}
                      </option>
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
                  Select an object in the image or the object list.
                </p>
              </div>
            )}
          </section>
          {(proposal || additions.length > 0 || expanded || changedCount > 0) && <section className="editor-summary">
            {mode !== "discover" && <ArtworkReview entities={additions} />}
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

            <p className="editor-scope">
              {expanded
                ? `World extends to ${bounds.width.toLocaleString()} × ${bounds.height.toLocaleString()}. `
                : ""}
              {additions.length > 0
                ? `${additions.length} new ${additions.length === 1 ? "object" : "objects"}. `
                : ""}
              {changedCount > 0 ? `${changedCount} changed ${changedCount === 1 ? "object" : "objects"}.` : ""}
            </p>

          </section>}
        </div>
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
