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
import type { InteractionPlan } from "../../shared/interactions";
import { ObjectBehaviorEditor, clearObjectAbilityDrafts, pendingObjectAbilities, removeObjectAbilityDraft } from "./ObjectBehaviorEditor";
import { Modal } from "./Modal";
import { isSourceBackdrop, isSourceAlignedScenery, sourceLayerForEdit, sourceLayerArtworkBounds } from "../../shared/source-scenery";
import { WrappingTextarea } from "./WrappingTextarea";
import { ZoomPercent } from "./ZoomPercent";
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
  { kind: "decoration", label: "Object", hint: "Give your creation a purpose.", width: 80, height: 80 },
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

type EditorRecovery = { action: "reset" | "remove"; entity: WorldEntity; index?: number; interactionsBefore?: InteractionPlan };

type EditorDraft = {
  bounds: { width: number; height: number };
  additions: WorldEntity[];
  modified: Record<string, WorldEntity>;
  selected: string | null;
  customArt: string | null;
  customArtAspect?: number;
  sketchDraft: string | undefined;
  recovery?: EditorRecovery | null;
  interactions?: InteractionPlan;
};
// Session drafts never cross a world revision or a proposed image update.
const editorDrafts = new Map<string, EditorDraft>();
function draftKey(props: { world: WorldDefinition; proposal?: PaperProposal; initialAdditions?: WorldEntity[]; revisedImage?: string }) {
  return JSON.stringify([props.world.id, props.world.revision, props.proposal?.patch.id ?? null,
    props.initialAdditions?.map(item => item.id) ?? [], props.revisedImage ?? null]);
}
export function WorldEditor(props: Parameters<typeof WorldEditorSession>[0]) {
  return <WorldEditorSession key={draftKey(props)} {...props} />;
}
function WorldEditorSession({
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
  const cacheKey = draftKey({ world, proposal, initialAdditions, revisedImage });
  const savedDraft = useRef(editorDrafts.get(cacheKey)).current;
  const mode = movementMode(world);
  const hero = world.entities.find((entity) => entity.kind === "player");
  const sourceBackdrop = world.entities.find(isSourceBackdrop);
  const sourcePageSize = isSourceAlignedScenery(sourceBackdrop) && sourceBackdrop
    ? sourceBackdrop : { width: 1440, height: 820 };
  const editorTools = tools
    .filter(
      (config) =>
        config.kind === "decoration" || mode === "platform" ||
        (mode === "roam"
          ? config.kind !== "bridge"
          : ["coin", "lever", "goal"].includes(config.kind)),
    )
    .map((config) => ({
      ...config,
      label:
        mode === "discover" && config.kind !== "decoration"
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
  const [bounds, setBounds] = useState(savedDraft?.bounds ?? {
    width: world.width,
    height: world.height,
  });
  const expanded =
    bounds.width !== world.width || bounds.height !== world.height;
  const [additions, setAdditions] = useState<WorldEntity[]>(() =>
    structuredClone(savedDraft?.additions ?? proposal?.patch.additions ?? initialAdditions ?? []),
  );
  const [modified, setModified] = useState<Record<string, WorldEntity>>(savedDraft?.modified ?? {});
  const currentEntities = world.entities.map(entity => modified[entity.id] ?? entity);
  const editableEntities = [...currentEntities.filter(entity => entity.id !== sourceBackdrop?.id), ...additions];
  const [interactions, setInteractions] = useState<InteractionPlan | undefined>(() => structuredClone(savedDraft ? savedDraft.interactions : proposal?.patch.interactions !== undefined ? proposal.patch.interactions ?? undefined : world.interactions));
  const interactionsChanged = JSON.stringify(interactions) !== JSON.stringify(world.interactions);
  const changedCount = Object.keys(modified).length;
  const [tool, setTool] = useState<Tool>("move");
  const [abilityDraftDirty, setAbilityDraftDirty] = useState(false);
  const [abilityFormReset, setAbilityFormReset] = useState(0);
  const [destinationPick, setDestinationPick] = useState<{
    target: WorldEntity;
    point: {x: number; y: number};
    choose: (point: {x: number; y: number}) => void;
  }>();
  const [selected, setSelected] = useState<string | null>(
    savedDraft ? savedDraft.selected : proposal?.patch.additions[0]?.id ?? initialAdditions?.[0]?.id ?? null,
  );
  const [recovery, setRecovery] = useState<EditorRecovery | null>(savedDraft?.recovery ?? null);
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
  const [customArt, setCustomArt] = useState<string | null>(savedDraft?.customArt ?? null);
  const [customArtAspect, setCustomArtAspect] = useState(savedDraft?.customArtAspect ?? 1);
  const [sketchDraft, setSketchDraft] = useState<string | undefined>(savedDraft?.sketchDraft);
  useEffect(() => {
    if (!additions.length && !Object.keys(modified).length && !expanded && !interactionsChanged && !abilityDraftDirty && !customArt && !sketchDraft && !proposal && !initialAdditions?.length && !revisedImage && !recovery) {
      editorDrafts.delete(cacheKey);
      return;
    }
    editorDrafts.set(cacheKey, { bounds, additions, modified, selected, customArt, customArtAspect, sketchDraft, recovery, interactions });
    if (editorDrafts.size > 12) editorDrafts.delete(editorDrafts.keys().next().value!);
  }, [cacheKey, bounds, additions, modified, selected, customArt, customArtAspect, sketchDraft, expanded, proposal, initialAdditions, revisedImage, recovery, interactions, interactionsChanged, abilityDraftDirty]);
  const [preparingArtwork, setPreparingArtwork] = useState(false);
  const artworkRequest = useRef<AbortController | null>(null);
  type PreparedScene = Pick<WorldPatch, "sourceScenery" | "sourceLayers">;
  const preparedScenes = useRef(new Map<string, PreparedScene>());
  const sceneRequest = useRef<{ key: string; promise: Promise<PreparedScene>; controller: AbortController } | null>(null);
  const [scenePreparing, setScenePreparing] = useState(false);
  const [, setSceneVersion] = useState(0);
  const sceneAlive = useRef(true);
  useEffect(() => { sceneAlive.current = true; return () => { sceneAlive.current = false; sceneRequest.current?.controller.abort(); }; }, []);
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
    // Reset recovery must never overwrite a newer edit to the same object.
    setRecovery(previous => previous?.action === "reset" && previous.entity.id === id ? null : previous);
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
    setDestinationPick(undefined);
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
      snapshot.x + snapshot.width > sourcePageSize.width ||
      snapshot.y + snapshot.height > sourcePageSize.height
    ) {
      setError(
        "This selection is outside the revised page. Move its box over the complete page mark before cropping. Artwork is unchanged.",
      );
      return;
    }
    const source = {
      x: snapshot.x / sourcePageSize.width * 1000,
      y: snapshot.y / sourcePageSize.height * 1000,
      width: snapshot.width / sourcePageSize.width * 1000,
      height: snapshot.height / sourcePageSize.height * 1000,
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
      ...(proposal?.patch.sourceScenery ? { sourceScenery: proposal.patch.sourceScenery } : {}),
      additions,
      ...(proposal?.patch.goalRules ? { goalRules: proposal.patch.goalRules } : {}),
      ...(proposal?.patch.gameplay ? { gameplay: proposal.patch.gameplay } : {}),
      ...(changedCount ? { updates: Object.values(modified).map(entity => ({id: entity.id, x: entity.x, y: entity.y, width: entity.width, height: entity.height, label: entity.label, targetId: entity.targetId ?? null})) } : {}),
      ...(expanded ? { bounds } : {}),
      ...(interactionsChanged && interactions && !interactions.actions.length && mode === "discover" ? {
        gameplay: { ...world.gameplay!, objectiveTitle: "Explore your world", instructions: "Select an object to pick it up. Q puts it back." },
      } : {}),
      ...(interactionsChanged ? { interactions: interactions ?? null,
        goalRules: { ...(proposal?.patch.goalRules ?? world.goalRules ?? { requiredCollectedIds: [], requiredActivatedIds: [] }),
          requiredInteractionIds: (proposal?.patch.goalRules?.requiredInteractionIds ?? world.goalRules?.requiredInteractionIds ?? []).filter(id => interactions?.actions.some(action => action.id === id)),
          requiredResourceIds: (proposal?.patch.goalRules?.requiredResourceIds ?? world.goalRules?.requiredResourceIds ?? []).filter(id => interactions?.objects.some(object => object.entityId === id && object.resource)) } } : {}),
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
      interactions,
      interactionsChanged,
      world.goalRules,
      world.gameplay,
      mode,
    ],
  );
  const patchNow = useRef(patch);
  patchNow.current = patch;
  const derivedScenery = isSourceAlignedScenery(sourceBackdrop);
  const detachedIds = (patch.updates ?? []).flatMap(update => {
    const original = world.entities.find(entity => entity.id === update.id);
    return original && !original.sourceLayer && sourceLayerForEdit(world, original, update) ? [original.id] : [];
  }).sort();
  const gateLinks = (entities: WorldEntity[], plan?: InteractionPlan) => [...new Set([
    ...entities.filter(entity => entity.kind === "lever" && entity.targetId).map(entity => entity.targetId),
    ...(plan?.actions.flatMap(action => (action.effects ?? []).flatMap(effect => effect.kind === "openGate" || effect.kind === "moveObject" ? [effect.entityId] : [])) ?? []),
  ])].sort();
  const nextLinks = gateLinks([...currentEntities, ...additions], interactions);
  const gateLinksChanged = JSON.stringify(nextLinks) !== JSON.stringify(gateLinks(world.entities, world.interactions));
  const needsSourceScene = derivedScenery && Boolean(revisedImage || detachedIds.length || gateLinksChanged);
  const sceneKey = needsSourceScene ? JSON.stringify([detachedIds, nextLinks]) : "";
  const preparedScene = sceneKey ? preparedScenes.current.get(sceneKey) : undefined;
  let problem = "";
  if (additions.length || changedCount || expanded || interactionsChanged) {
    try {
      // Validate placement locally; the actual image update gets freshly
      // reconstructed scenery before it can be committed below.
      const validationPatch = needsSourceScene && sourceBackdrop
        ? { ...patch, sourceScenery: { id: sourceBackdrop.id, art: sourceBackdrop.art ?? world.sourceImage } } : patch;
      applyWorldPatch(world, state, validationPatch);
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
    if (destinationPick) {
      destinationPick.choose({
        x: Math.round(limit(p.x - destinationPick.target.width / 2, 0, bounds.width - destinationPick.target.width)),
        y: Math.round(limit(p.y - destinationPick.target.height / 2, 0, bounds.height - destinationPick.target.height)),
      });
      setDestinationPick(undefined);
      return;
    }
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
    if (destinationPick && !pan.current) {
      const p = point(e);
      setDestinationPick(current => current ? {...current, point: {
        x: Math.round(limit(p.x - current.target.width / 2, 0, bounds.width - current.target.width)),
        y: Math.round(limit(p.y - current.target.height / 2, 0, bounds.height - current.target.height)),
      }} : current);
      return;
    }
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
  function placementSize(config: {width: number; height: number}) {
    if (!customArt) return config;
    const ratio = Math.max(.04, Math.min(25, customArtAspect));
    const height = Math.max(12, Math.round(180 / Math.max(1, ratio)));
    return {width: Math.max(12, Math.round(height * ratio)), height};
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
      const size = placementSize(config);
      const isClick = Math.hypot(p.x - drag.x, p.y - drag.y) * scale < 6;
      const width = limit(
          isClick ? size.width : Math.abs(p.x - drag.x),
          12,
          800,
        ),
        height = limit(
          isClick ? size.height : Math.abs(p.y - drag.y),
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
    const size = placementSize(config);
    const entity: WorldEntity = {
      id: `drawn-${crypto.randomUUID()}`,
      kind: tool,
      x: Math.round(
        limit(
          view.x + view.width / 2 - size.width / 2,
          0,
          bounds.width - size.width,
        ),
      ),
      y: Math.round(
        limit(
          view.y + view.height / 2 - size.height / 2,
          0,
          bounds.height - size.height,
        ),
      ),
      width: size.width,
      height: size.height,
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
    if (destinationPick) {
      const shift: Record<string, [number, number]> = {ArrowLeft: [-1,0], ArrowRight: [1,0], ArrowUp: [0,-1], ArrowDown: [0,1]};
      const delta = shift[event.key];
      if (delta) {
        event.preventDefault();
        const amount = event.shiftKey ? 1 : 10;
        setDestinationPick(current => current ? {...current, point: {
          x: limit(current.point.x + delta[0] * amount, 0, bounds.width - current.target.width),
          y: limit(current.point.y + delta[1] * amount, 0, bounds.height - current.target.height),
        }} : current);
        return;
      }
      if (event.key === "Enter" || event.key === "Escape") {
        event.preventDefault(); event.stopPropagation();
        if (event.key === "Enter") destinationPick.choose(destinationPick.point);
        setDestinationPick(undefined); return;
      }
    }
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
    if (!item) return;
    if (existingSelected) {
      setError("Existing objects stay in this world. Use Reset changes to undo your edits.");
      return;
    }
    removeAddition(item.id);
  }
  function removeAddition(id: string) {
    const index = additions.findIndex(entity => entity.id === id);
    const entity = additions[index];
    if (!entity) return;
    if (world.goalRules?.requiredResourceIds?.includes(id)) { setError("Remove this object's completion requirement before deleting it."); return; }
    const linkedAction = interactions?.actions.find(action => action.toolId === id || action.targetId === id || action.requiresResourceIds?.includes(id) || action.effects?.some(effect => (effect.kind === "openGate" || effect.kind === "moveObject") && effect.entityId === id));
    if (linkedAction) { setError(`Remove the ability “${linkedAction.label}” before deleting ${title(entity)}.`); return; }
    const linked = editableEntities.find(other => other.targetId === id);
    if (linked) {
      setError(`Disconnect ${title(linked)} before deleting ${title(entity)}.`);
      return;
    }
    cancelArtwork();
    setRecovery({ action: "remove", entity, index, interactionsBefore: structuredClone(interactions) });
    setReviewed(false);
    setAdditions(items => items.filter(other => other.id !== id));
    removeObjectAbilityDraft(world.id, world.revision, id);
    setAbilityDraftDirty(pendingObjectAbilities(world.id, world.revision).length > 0);
    if (interactions?.objects.some(object => object.entityId === id)) setInteractions(plan => plan ? { ...plan, objects: plan.objects.filter(object => object.entityId !== id) } : undefined);
    if (selected === id) selectObject(null);
    setError("");
  }
  function resetSelected() {
    if (!selected || !modified[selected]) return;
    cancelArtwork();
    setRecovery({ action: "reset", entity: modified[selected] });
    setModified(items => { const next = { ...items }; delete next[selected]; return next; });
    setReviewed(false);
    setError("");
  }
  function undoObjectAction() {
    if (!recovery) return;
    cancelArtwork();
    if (recovery.action === "reset") {
      setModified(items => ({ ...items, [recovery.entity.id]: recovery.entity }));
    } else {
      setInteractions(structuredClone(recovery.interactionsBefore));
      setAdditions(items => {
        if (items.some(entity => entity.id === recovery.entity.id)) return items;
        const next = [...items];
        next.splice(Math.min(recovery.index ?? next.length, next.length), 0, recovery.entity);
        return next;
      });
    }
    selectObject(recovery.entity.id);
    setRecovery(null);
    setReviewed(false);
    setError("");
  }
  async function prepareScene(key: string, submitted: WorldPatch): Promise<PreparedScene> {
    const cached = preparedScenes.current.get(key);
    if (cached) return cached;
    const previous = sceneRequest.current;
    if (previous?.key === key) return previous.promise;
    if (previous) { try { await previous.promise; } catch { /* A changed draft can prepare independently. */ } }
    const completed = preparedScenes.current.get(key);
    if (completed) return completed;
    if (sceneRequest.current && sceneRequest.current !== previous)
      return prepareScene(key, submitted);
    if (!sceneAlive.current) throw new DOMException("Editor closed", "AbortError");
    const controller = new AbortController();
    const promise = (async () => {
      setScenePreparing(true);
      const context = { ...world, entities: world.entities.map(entity => {
        const update = submitted.updates?.find(item => item.id === entity.id);
        if (entity.kind === "player" || entity.kind === "gate" || entity.sourceLayer ||
            update && sourceLayerForEdit(world, entity, update)) return entity;
        const { art, ...rest } = entity; return rest;
      }) };
      const response = await fetch("/api/source-scenery", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ world: context, image: revisedImage || world.sourceImage,
          additions: submitted.additions, updates: submitted.updates, bounds: submitted.bounds, interactions: submitted.interactions, goalRules: submitted.goalRules }),
        signal: controller.signal,
      });
      const result = await response.json().catch(() => ({error: "Artwork preparation could not be reached. Your draft is kept; try applying again."}));
      if (!response.ok) throw new Error(result.error || "The source artwork could not be prepared. Your draft is kept.");
      controller.signal.throwIfAborted();
      const prepared: PreparedScene = { sourceScenery: result.sourceScenery, ...(result.sourceLayers ? { sourceLayers: result.sourceLayers } : {}) };
      applyWorldPatch(world, state, { ...submitted, ...prepared });
      preparedScenes.current.set(key, prepared);
      if (preparedScenes.current.size > 6) preparedScenes.current.delete(preparedScenes.current.keys().next().value!);
      if (sceneAlive.current) { setSceneVersion(version => version + 1); setError(""); }
      return prepared;
    })();
    sceneRequest.current = { key, promise, controller };
    try { return await promise; }
    finally {
      if (sceneRequest.current?.controller === controller) {
        sceneRequest.current = null;
        if (sceneAlive.current) setScenePreparing(false);
      }
    }
  }
  // A source mask depends on which objects leave the page, not each drag pixel.
  // Prepare once after a gesture, then reuse it for preview, further edits and Apply.
  useEffect(() => {
    if (!sceneKey || preparedScenes.current.has(sceneKey) || drag || problem || preparingArtwork) return;
    const timer = window.setTimeout(() => {
      void prepareScene(sceneKey, patchNow.current).catch(error => {
        if (sceneAlive.current && error?.name !== "AbortError") setError(error instanceof Error ? error.message : "The source artwork could not be prepared. Your draft is kept.");
      });
    }, 650);
    return () => window.clearTimeout(timer);
  }, [sceneKey, Boolean(drag), Boolean(problem), preparingArtwork]);

  async function apply() {
    if (preparingArtwork || artworkRequest.current) return;
    if (abilityDraftDirty) { setError("Add your pending ability before applying, or discard the draft."); return; }
    const submitted = patch;
    try {
      if (revisedImage && !reviewed) throw new Error("Check your additions and connections before applying.");
      setPreparingArtwork(true); setError("");
      const prepared = needsSourceScene ? await prepareScene(sceneKey, submitted) : {};
      if (patchNow.current !== submitted) throw new Error("Your draft changed while the image was being prepared. Apply again to include your latest changes.");
      const readyPatch = { ...submitted, ...prepared };
      applyWorldPatch(world, state, readyPatch);
      onApply(readyPatch);
      editorDrafts.delete(cacheKey);
      clearObjectAbilityDrafts(world.id, world.revision);
    } catch (error) {
      if (sceneAlive.current && !(error instanceof DOMException && error.name === "AbortError")) setError(error instanceof Error ? error.message : "Your current world is safe. Try adjusting the change.");
    } finally { if (sceneAlive.current) setPreparingArtwork(false); }
  }

  const colors = world.theme === "moon" ? ["#ede9f3", "#c6b9d7", "#9a8baa"]
    : world.theme === "sunset" ? ["#f7ebdf", "#dfc2a7", "#b48d73"]
      : ["#f0f1e3", "#c4d0b1", "#8f9f7a"];

  function object(e: WorldEntity, isNew = false) {
    const original = world.entities.find(entity => entity.id === e.id);
    const layer = preparedScene?.sourceLayers?.find(entity => entity.id === e.id);
    const baseline = e.sourceLayer ?? (original ? sourceLayerForEdit(world, original, e) : undefined);
    const previewEntity = { ...e, ...(baseline ? { sourceLayer: baseline } : {}), ...layer };
    const artBox = derivedScenery && sourceBackdrop && previewEntity.sourceLayer
      ? sourceLayerArtworkBounds(previewEntity, sourceBackdrop) : undefined;
    const sourceStationary = derivedScenery && e.artSource && !isSourceBackdrop(e) && e.kind !== "player" && e.kind !== "gate";
    const awaitingLayer = Boolean(baseline && !e.sourceLayer && !preparedScene);
    const x = e.x, y = e.y;
    const hidden =
      (e.kind === "coin" && state.collected.includes(e.id)) ||
      (e.kind === "gate" && openGates.has(e.id));
    return (
      <g
        key={e.id}
        transform={`translate(${x} ${y})`}
        className={isNew ? "editor-new-object" : ""}
      >
        <title>
          {isNew ? "New: " : ""}
          {title(e)}
        </title>
        <g opacity={hidden ? 0.14 : 1}>
        {paperVisible && revisedImage ? (
          <rect width={e.width} height={e.height} rx="2" fill="#2457e6" fillOpacity={isNew ? .1 : .025}
            stroke="#2457e6" strokeWidth={isNew || e.id === selected ? 2 : 1} strokeDasharray={isNew ? "6 3" : undefined}
            vectorEffect="non-scaling-stroke" />
        ) : mode === "discover" && ["coin", "lever", "goal"].includes(e.kind) ? (
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
        ) : sourceStationary && (!artBox || awaitingLayer) ? null : e.art ? (
          <image
            href={isSourceBackdrop(e) && preparedScene?.sourceScenery ? preparedScene.sourceScenery.art : previewEntity.art}
            x={artBox ? artBox.x - e.x : 0}
            y={artBox ? artBox.y - e.y : 0}
            width={artBox?.width ?? e.width}
            height={artBox?.height ?? e.height}
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
        </g>
        {(isNew || e.id === selected) && (
          <g pointerEvents="none">
          {e.id === selected && <rect x="-5" y="-5" width={e.width + 10} height={e.height + 10} rx="6" fill="none" stroke="#fff" strokeWidth="5" vectorEffect="non-scaling-stroke" />}
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
          {e.id === selected && <rect x="-8" y="-8" width="6" height="6" fill="var(--selection)" stroke="#fff" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />}
          </g>
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
                  disabled={preparingArtwork}
                  onChange={(e) => setReviewed(e.target.checked)}
                />
                {mode === "discover"
                  ? "I checked the regions and their placement in the image."
                  : "I checked the new objects, their placement, and interactions."}
              </label>
            )}
            {(additions.length > 0 || changedCount > 0 || expanded || interactionsChanged || sketchDraft || abilityDraftDirty) && <p className="editor-draft-note">{abilityDraftDirty ? "Add your pending ability before applying. Your draft is kept." : "Draft kept when you close. Apply to update your world."}</p>}
            {abilityDraftDirty && pendingObjectAbilities(world.id, world.revision).filter(id => id !== selected).map(id => <button key={id} className="text-button" onClick={() => selectObject(id)}>Finish ability for {editableEntities.find(entity => entity.id === id)?.label || "object"}</button>)}
            {recovery && <div className="editor-recovery" role="status">
              <span>{recovery.action === "reset" ? "Object changes reset." : "New object deleted."}</span>
              <button className="text-button" onClick={undoObjectAction}><Undo2 size={14} /> Undo</button>
            </div>}
            <div className="editor-apply-actions">
              <button
                className="text-button"
                disabled={!additions.length}
                onClick={() => { const last = additions.at(-1); if (last) removeAddition(last.id); }}
              >
                <Undo2 size={15} /> Remove last addition
              </button>
              <button className="text-button" disabled={!additions.length && !changedCount && !expanded && !interactionsChanged && !customArt && !sketchDraft && !abilityDraftDirty}
                onClick={(event) => {
                  cancelArtwork();
                  clearObjectAbilityDrafts(world.id, world.revision); setAbilityDraftDirty(false); setAbilityFormReset(value => value + 1);
                  setBounds({ width: world.width, height: world.height });
                  setAdditions([]); setModified({}); setInteractions(structuredClone(world.interactions)); setCustomArt(null); setSketchDraft(undefined); setRecovery(null);
                  setReviewed(false); selectObject(null); setError("");
                  editorDrafts.delete(cacheKey);
                  event.currentTarget.closest("dialog")?.querySelector<HTMLSelectElement>('select[aria-label="Select an object"]')?.focus({ preventScroll: true });
                }}>Discard draft</button>
              <button
                className="primary-button"
                disabled={
                  (!additions.length && !changedCount && !expanded && !interactionsChanged) ||
                  preparingArtwork ||
                  abilityDraftDirty ||
                  Boolean(problem) ||
                  (Boolean(revisedImage) && !reviewed)
                }
                onClick={() => void apply()}
              >
                {preparingArtwork || scenePreparing ? <>Preparing artwork <LoaderCircle size={17} className="spin" /></> : <>Apply changes <ArrowUpRight size={17} /></>}
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
          </label>            {(mode !== "discover" || world.interactions) && (
              <div className="editor-art-action">
                <button
                  className="secondary-button"
                  onClick={() => { selectObject(null); setDrawing(true); }}
                >
                  <ImagePlus size={15} /> Draw object
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
            <div className="editor-zoom-control">
              <input
                aria-label="World zoom"
                type="range"
                min={Math.floor(fitScale * 1000)}
                max="2000"
                step="1"
                value={Math.round(scale * 1000)}
                onChange={(e) => zoomTo(Number(e.target.value) / 1000)}
              />
              <ZoomPercent value={scale * 100} min={fitScale * 100} max={200} onChange={value => zoomTo(value / 100)} />
            </div>
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
            data-choosing-destination={Boolean(destinationPick)}
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
              aria-label="World edit canvas. Arrows move the selected object by ten units, Shift and arrows by one. Delete removes a new object; existing objects are kept. Reset changes is available in object settings. Pan mode or holding Space drags the view. Plus and minus zoom, zero fits the world, F focuses selection. Object identities and earned progress are kept."
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
                  width={sourcePageSize.width}
                  height={sourcePageSize.height}
                  preserveAspectRatio="none"
                />
              )}
              <g>
                {!paperVisible && sourceBackdrop && (mode !== "platform" || isSourceAlignedScenery(sourceBackdrop)) && object(sourceBackdrop)}
                {currentEntities
                  .filter((entity) => entity.id !== sourceBackdrop?.id)
                  .map((e) => object(e))}
              </g>
              {additions.map((e) => object(e, true))}
              {destinationPick && <g pointerEvents="none">
                <line x1={destinationPick.target.x + destinationPick.target.width / 2} y1={destinationPick.target.y + destinationPick.target.height / 2}
                  x2={destinationPick.point.x + destinationPick.target.width / 2} y2={destinationPick.point.y + destinationPick.target.height / 2}
                  stroke="#4459ce" strokeWidth={2 / scale} strokeDasharray={`${6 / scale} ${5 / scale}`} />
                <rect x={destinationPick.point.x} y={destinationPick.point.y} width={destinationPick.target.width} height={destinationPick.target.height}
                  fill="#4459ce18" stroke="#4459ce" strokeWidth={2 / scale} rx={6 / scale}/>
                {destinationPick.target.art && <image href={destinationPick.target.art} x={destinationPick.point.x} y={destinationPick.point.y}
                  width={destinationPick.target.width} height={destinationPick.target.height} opacity=".55" preserveAspectRatio="xMidYMid meet" />}
              </g>}
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
            {destinationPick
              ? "Choose a destination · Arrows to position · Enter to confirm · Esc to cancel"
              : panMode
              ? "Drag to explore the world, or focus the canvas and use arrow keys. Fit world restores the overview."
              : item
                ? "Arrows move · Shift for precision · Space to pan · F to focus"
                : tool === "move"
                  ? "Space to pan · + / − to zoom"
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
                    className="text-button editor-object-action"
                    disabled={preparingArtwork || (existingSelected && !modified[item.id])}
                    aria-label={existingSelected ? "Reset selected object changes" : "Delete selected new object"}
                    onClick={existingSelected ? resetSelected : removeSelected}
                  >
                    {existingSelected ? <><Undo2 size={15} /> Reset changes</> : <><Trash2 size={15} /> Delete</>}
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
                  <WrappingTextarea
                    rows={1}
                    aria-label="Object name"
                    value={item.label ?? ""}
                    maxLength={60}
                    onChange={(e) => update({ label: e.target.value })}
                  />
                </label>
                <ObjectBehaviorEditor key={`${item.id}:${abilityFormReset}`} world={{...world, ...bounds, entities: [...currentEntities, ...additions]}} item={item} plan={interactions} onChange={setInteractions} onDraw={!existingSelected ? () => setDrawing(true) : undefined}
                  onDraftChange={setAbilityDraftDirty} onCancelDestination={() => setDestinationPick(undefined)}
                  onPickDestination={(target, choose) => {
                    setPanMode(false); setTool("move"); setDrag(null);
                    setDestinationPick({target, choose, point: {x: limit(target.x + target.width * 1.5, 0, bounds.width - target.width), y: target.y}});
                    requestAnimationFrame(() => canvas.current?.focus({preventScroll: true}));
                  }} />
                {item.kind === "player" && <p className="editor-scope">Starting position · current run unchanged</p>}
                <details className="editor-precision" key={item.id}>
                  <summary>Position &amp; size</summary>
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
                </details>
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
                  Select an object to edit.
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
          title="Draw an object"
          resumeImage={sketchDraft}
          onPause={setSketchDraft}
          onClose={() => setDrawing(false)}
          onUse={(image) => {
            void extractSketchInk(image)
              .then((ink) => {
                if (item)
                  update({
                    art: ink.art,
                    artMethod: undefined,
                    artNote: undefined,
                  });
                else { setCustomArt(ink.art); setCustomArtAspect(ink.aspectRatio); setTool("decoration"); }
                setSketchDraft(undefined);
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
