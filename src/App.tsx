import { useEffect, useRef, useState, type ChangeEvent } from "react";
import {
  ArrowDownToLine,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowUpRight,
  Check,
  ChevronRight,
  CircleHelp,
  FolderHeart,
  Flag,
  ImagePlus,
  Layers3,
  LoaderCircle,
  Maximize2,
  Map,
  Minimize2,
  Pause,
  Pencil,
  Play,
  Plus,
  RotateCcw,
  Settings2,
  Sparkles,
  Sprout,
  Smartphone,
  Crop,
  Undo2,
  Volume2,
  VolumeX,
  WandSparkles,
  X,
} from "lucide-react";
import { WorldCanvas, type WorldCanvasHandle } from "./components/WorldCanvas";
import { Modal } from "./components/Modal";
import { SketchPad } from "./components/SketchPad";
import { PhonePairing } from "./components/PhonePairing";
import { PageAlignment } from "./components/PageAlignment";
import { PaperUpdate } from "./components/PaperUpdate";
import type { PaperProposal } from "../shared/amendments";
import { readDrawingFile } from "./lib/drawing-file";
import { WorldEditor } from "./components/WorldEditor";
import { ArtworkReview } from "./components/ArtworkReview";
import { setupFeedback } from "../shared/setup";
import { WorldLibrary } from "./components/WorldLibrary";
import { SourceInspector } from "./components/SourceInspector";
import { GoalRules } from "./components/GoalRules";
import { WorldRulesSummary } from "./components/WorldRulesSummary";
import {
  recordCreationStarted,
  recordRecognitionReturned,
  recordReviewAccepted,
} from "./lib/runtime-diagnostics";
import {
  validateRecognitionReview,
  type RecognitionReview,
} from "../shared/recognition-review";
import { WorldSetup } from "./components/WorldSetup";
import {
  updateLibrary,
  validSavedWorlds,
  type SavedWorld,
} from "./lib/library";
import {
  applyWorldPatch,
  undoWorldPatch,
  type WorldPatch,
  type RevisionCheckpoint,
} from "../shared/revisions";
import { EXAMPLES, freshExample } from "./lib/examples";
import {
  emptyPlayState,
  goalProgress,
  continueExploration,
  retainPlayState,
  validateWorld,
  movementMode,
  type PlayState,
  type WorldDefinition,
  type WorldEntity,
  type InputKind,
} from "../shared/world";
import type { WorldTelemetry } from "./game/WorldScene";

type Connection = {
  configured: boolean;
  provider: "meta" | "baseten" | "fireworks";
  label: string;
  credential: string;
  enforcedSchema: boolean;
  model: string;
  requestsRemaining: number;
  segmentation?: { enabled: boolean; configured: boolean; model: string };
};
type Dialog =
  | "create"
  | "source"
  | "rules"
  | "draft-rules"
  | "discard-creation"
  | "review"
  | "sketch"
  | "worlds"
  | "help"
  | "settings"
  | "editor"
  | "paper"
  | "phone"
  | "align"
  | "setup"
  | null;
const storageKey = "doodlume.worlds.v1";
const originalBackdropNote =
  "Full original image used as the world backdrop; generated gameplay is separate.";
function isCreativeAdaptation(value: WorldDefinition) {
  return value.entities.some(
    (entity) =>
      entity.kind === "decoration" && entity.artNote === originalBackdropNote,
  );
}
function objectiveTelemetry(world: WorldDefinition, state: PlayState) {
  const progress = goalProgress(world, state);
  return {
    goalHint: progress.hint,
    requiredDone: progress.done,
    requiredTotal: progress.total,
  };
}
function savedWorlds(): SavedWorld[] {
  try {
    return validSavedWorlds(
      JSON.parse(localStorage.getItem(storageKey) ?? "[]"),
    );
  } catch {
    return [];
  }
}
const initialMetrics: WorldTelemetry = {
  collected: 0,
  total: 0,
  completed: false,
  exploring: false,
  goalHint: "",
  requiredDone: 0,
  requiredTotal: 0,
  nearLever: false,
  interactionHint: "",
  playerX: 0,
  playerY: 0,
};

export default function App() {
  const [world, setWorld] = useState(() => freshExample(EXAMPLES[0].id));
  const [initial, setInitial] = useState<PlayState>(emptyPlayState);
  const [source, setSource] = useState("");
  const [sourceName, setSourceName] = useState("Your drawing");
  const [customSource, setCustomSource] = useState(false);
  const [inputKind, setInputKind] = useState<InputKind>("drawing");
  const [intent, setIntent] = useState("");
  const [draftIntent, setDraftIntent] = useState("");
  const [sketchDraft, setSketchDraft] = useState<string | undefined>();
  const [sourceContext, setSourceContext] = useState<
    "creation" | "world" | "review"
  >("creation");
  const [settingsReturn, setSettingsReturn] = useState<Dialog>(null);
  const [playing, setPlaying] = useState(false);
  const [focusedPlay, setFocusedPlay] = useState(false);
  const [mapView, setMapView] = useState(false);
  const [started, setStarted] = useState(false);
  const [muted, setMuted] = useState(true);
  const [run, setRun] = useState(0);
  const [metrics, setMetrics] = useState(initialMetrics);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [saved, setSaved] = useState(savedWorlds);
  const [saving, setSaving] = useState(false);
  const [libraryError, setLibraryError] = useState("");
  const [connection, setConnection] = useState<Connection | null>(null);
  const [connectionError, setConnectionError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [worldError, setWorldError] = useState("");
  const [draft, setDraft] = useState<WorldDefinition | null>(null);
  const [recognitionReview, setRecognitionReview] =
    useState<RecognitionReview | null>(null);
  const [setupEdits, setSetupEdits] = useState<WorldDefinition | null>(null);
  const [editorState, setEditorState] = useState<PlayState>(emptyPlayState);
  const [paperProposal, setPaperProposal] = useState<
    PaperProposal | undefined
  >();
  const [tracedAdditions, setTracedAdditions] = useState<WorldEntity[]>([]);
  const [revisedPage, setRevisedPage] = useState<string | undefined>();
  const [paperIntent, setPaperIntent] = useState("");
  const [pendingPhoto, setPendingPhoto] = useState<string | undefined>();
  const [pendingPhotoName, setPendingPhotoName] = useState("Your drawing");
  const [history, setHistory] = useState<RevisionCheckpoint[]>([]);
  const worldNow = useRef(world);
  worldNow.current = world;
  const canvas = useRef<WorldCanvasHandle>(null);
  const file = useRef<HTMLInputElement>(null);
  const sourceInspect = useRef<HTMLButtonElement>(null);
  const worldSourceInspect = useRef<HTMLButtonElement>(null);
  const reviewSourceInspect = useRef<HTMLButtonElement>(null);
  const draftRulesAnchor = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const latestState = useRef<PlayState>(emptyPlayState());
  const request = useRef<AbortController | null>(null);
  const sourceVersion = useRef(0);
  const previousPlaying = useRef(false);
  const draftFeedback = draft ? setupFeedback(draft) : null;
  const mode = movementMode(world);
  const modeLabel =
    mode === "discover"
      ? "Discovery"
      : mode === "roam"
        ? "Exploration"
        : "Adventure";
  const hasCreationDraft = Boolean(
    source ||
      intent.trim() ||
      draft ||
      recognitionReview ||
      setupEdits ||
      sketchDraft,
  );
  function openCreation(entry: "create" | "sketch" | "upload" = "create") {
    setFocusedPlay(false);
    setDialog(entry === "sketch" ? "sketch" : "create");
    if (entry === "upload") file.current?.click();
  }
  function openDraftSetup() {
    // A prepared/paused result keeps the intent that produced it. Editing the
    // input field does not retroactively recompile that result's requirements.
    if (!draft && !recognitionReview && !setupEdits) setDraftIntent(intent);
    setDialog("setup");
  }
  function returnToDraftReview() {
    setDialog("review");
    requestAnimationFrame(() =>
      draftRulesAnchor.current
        ?.querySelector<HTMLButtonElement>("button")
        ?.focus(),
    );
  }
  function resetCreation() {
    sourceVersion.current++;
    if (request.current) recordRecognitionReturned("cancelled");
    request.current?.abort();
    request.current = null;
    setBusy(false);
    setSource("");
    setSourceName("Your drawing");
    setInputKind("drawing");
    setIntent("");
    setDraftIntent("");
    setCustomSource(false);
    setSketchDraft(undefined);
    setDraft(null);
    setRecognitionReview(null);
    setSetupEdits(null);
    setError("");
  }
  useEffect(() => {
    if (draft) setDialog("review");
  }, [draft]);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function checkConnection() {
    try {
      const response = await fetch("/api/status");
      if (!response.ok) throw new Error();
      const data = await response.json();
      setConnection(data);
      setConnectionError(false);
    } catch {
      setConnection(null);
      setConnectionError(true);
    }
  }
  useEffect(() => {
    void checkConnection();
    let active = true;
    void updateLibrary(savedWorlds())
      .then((entries) => {
        if (active) setSaved(entries);
      })
      .catch(() => {
        if (active)
          setLibraryError(
            "Saved worlds could not be loaded. Stored data has not been removed.",
          );
      });
    return () => {
      active = false;
      request.current?.abort();
      if (noticeTimer.current) clearTimeout(noticeTimer.current);
    };
  }, []);
  useEffect(() => {
    if (dialog) {
      previousPlaying.current = playing;
      setPlaying(false);
    } else if (previousPlaying.current) {
      setPlaying(true);
      previousPlaying.current = false;
    }
  }, [dialog]);
  useEffect(() => {
    function key(e: KeyboardEvent) {
      if (
        e.target instanceof Element &&
        e.target.closest('input,textarea,[contenteditable="true"]')
      )
        return;
      if (
        ["ArrowLeft", "ArrowRight", "ArrowUp", " ", "ArrowDown"].includes(
          e.key,
        ) &&
        playing &&
        !dialog
      )
        e.preventDefault();
      if (e.key === "Escape" && !dialog) {
        setPlaying(false);
        setFocusedPlay(false);
      }
    }
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [playing, dialog]);
  useEffect(() => {
    const pauseIfHidden = () => {
      if (document.hidden) setPlaying(false);
    };
    document.addEventListener("visibilitychange", pauseIfHidden);
    return () =>
      document.removeEventListener("visibilitychange", pauseIfHidden);
  }, []);
  useEffect(() => {
    if (metrics.completed && !metrics.exploring) setPlaying(false);
  }, [metrics.completed, metrics.exploring]);

  function tell(message: string) {
    setNotice(message);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(""), 5200);
  }
  function loadWorld(
    next: WorldDefinition,
    state = emptyPlayState(),
    checkpoints: RevisionCheckpoint[] = [],
  ) {
    sourceVersion.current++;
    if (request.current) recordRecognitionReturned("cancelled");
    request.current?.abort();
    request.current = null;
    setWorldError("");
    setPaperIntent("");
    setMapView(false);
    setBusy(false);
    setWorld(next);
    worldNow.current = next;
    setHistory(checkpoints);
    setInitial(state);
    latestState.current = state;
    setMetrics({
      ...initialMetrics,
      collected: state.collected.length,
      total: next.entities.filter((e) => e.kind === "coin").length,
      completed: state.completed,
      exploring: Boolean(state.exploring),
      ...objectiveTelemetry(next, state),
    });
    setRun((n) => n + 1);
    setStarted(false);
    setPlaying(false);
    setError("");
    previousPlaying.current = false;
  }
  function editableState() {
    const state = canvas.current?.snapshot() ?? latestState.current;
    if (!state.completed || state.exploring) return state;
    const next = canvas.current?.explore() ?? continueExploration(state);
    latestState.current = next;
    setInitial(next);
    setMetrics((m) => ({ ...m, exploring: true }));
    return next;
  }
  function continueWorld(build = false) {
    editableState();
    setStarted(true);
    if (build) openEditor();
    else start();
  }
  function openEditor() {
    setPaperIntent("");
    setPaperProposal(undefined);
    setRevisedPage(undefined);
    setTracedAdditions([]);
    setEditorState(editableState());
    setDialog("editor");
  }
  function openPaper() {
    setPaperIntent("");
    setEditorState(editableState());
    setPaperProposal(undefined);
    setRevisedPage(undefined);
    setTracedAdditions([]);
    setDialog("paper");
  }
  function keepRevision(next: WorldDefinition, state: PlayState) {
    setPaperIntent("");
    setWorldError("");
    worldNow.current = next;
    setWorld(next);
    setInitial(state);
    latestState.current = state;
    setMetrics({
      ...metrics,
      collected: state.collected.length,
      total: next.entities.filter((e) => e.kind === "coin").length,
      completed: state.completed,
      exploring: Boolean(state.exploring),
      ...objectiveTelemetry(next, state),
    });
    setRun((n) => n + 1);
    setStarted(true);
    previousPlaying.current = false;
    setDialog(null);
    setPlaying(!state.completed || Boolean(state.exploring));
    setError("");
    requestAnimationFrame(() => {
      framePlaySurface(focusedPlay);
      stage.current
        ?.querySelector<HTMLElement>(".world-canvas")
        ?.focus({ preventScroll: true });
    });
  }
  function applyEdit(patch: WorldPatch) {
    const result = applyWorldPatch(worldNow.current, editorState, patch);
    setHistory((items) => [...items, result.checkpoint].slice(-12));
    keepRevision(result.world, result.state);
    if (patch.goalRules) {
      tell("Destination rules updated. Your progress is kept.");
      return;
    }
    if (patch.bounds) {
      tell("World expanded. Your progress is kept.");
      return;
    }
    tell(
      `${patch.additions.length === 1 ? "A new possibility" : `${patch.additions.length} new possibilities`}. Same world. Your progress stayed with you.`,
    );
  }
  function undoEdit() {
    const checkpoint = history.at(-1);
    if (!checkpoint) return;
    try {
      const result = undoWorldPatch(
        worldNow.current,
        canvas.current?.snapshot() ?? latestState.current,
        checkpoint,
      );
      setHistory((items) => {
        const remaining = items.slice(0, -1);
        return remaining.map((entry, index) =>
          index === remaining.length - 1
            ? { ...entry, appliedRevision: result.world.revision }
            : entry,
        );
      });
      keepRevision(result.world, result.state);
      tell("Last world edit undone. Your surviving progress stays yours.");
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "This edit could not be undone safely.",
      );
    }
  }
  function framePlaySurface(focused: boolean, instant = false) {
    const behavior =
      instant || window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth";
    // Focus mode reserves the entire viewport, including its heading and toolbar.
    // Centering only the canvas would scroll those surrounding controls out of view.
    if (focused) window.scrollTo({ top: 0, behavior });
    else stage.current?.scrollIntoView({ block: "center", behavior });
  }
  function start() {
    if (worldError) return;
    setStarted(true);
    setPlaying(true);
    framePlaySurface(focusedPlay);
    stage.current
      ?.querySelector<HTMLElement>(".world-canvas")
      ?.focus({ preventScroll: true });
  }
  function restart() {
    setWorldError("");
    setInitial(emptyPlayState());
    latestState.current = emptyPlayState();
    setMetrics({
      ...initialMetrics,
      total: world.entities.filter((e) => e.kind === "coin").length,
    });
    setRun((n) => n + 1);
    setStarted(true);
    setPlaying(true);
    tell("A fresh start. Same world.");
  }
  async function save() {
    if (saving) return;
    const entry: SavedWorld = {
      world,
      state: canvas.current?.snapshot() ?? latestState.current,
      history,
      savedAt: new Date().toISOString(),
    };
    setSaving(true);
    setError("");
    try {
      const next = await updateLibrary(saved, entry);
      setSaved(next);
      tell("World saved on this device. Your progress is coming too.");
    } catch {
      setError(
        "This browser could not save the world. Your open world and earlier saves are unchanged.",
      );
    } finally {
      setSaving(false);
    }
  }
  async function upload(e: ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0];
    e.target.value = "";
    if (!selected) return;
    const version = ++sourceVersion.current;
    setError("");
    try {
      const image = await readDrawingFile(selected);
      if (version !== sourceVersion.current) return;
      useSource(image, selected.name);
    } catch (e) {
      if (version !== sourceVersion.current) return;
      setError(
        e instanceof Error ? e.message : "This image could not be opened.",
      );
    }
  }
  function useSource(
    image: string,
    name = "A drawing, made by you",
    kind = inputKind,
  ) {
    sourceVersion.current++;
    if (request.current) recordRecognitionReturned("cancelled");
    request.current?.abort();
    request.current = null;
    setBusy(false);
    setRecognitionReview(null);
    setSetupEdits(null);
    setSource(image);
    setSketchDraft(undefined);
    setInputKind(kind);
    setSourceName(name);
    setCustomSource(true);
    setDraft(null);
    setPlaying(false);
    setError("");
    setDialog("create");
    previousPlaying.current = false;
    tell(
      "Your image is ready. Tell us what should happen in it, or choose the objects yourself.",
    );
  }
  async function bringAlive() {
    setError("");
    if (!customSource) {
      tell("Draw or upload your own image to create a world.");
      return;
    }
    if (!connection?.configured) {
      setSettingsReturn("create");
      setDialog("settings");
      return;
    }
    const controller = new AbortController();
    const requestedIntent = intent;
    setSetupEdits(null);
    request.current = controller;
    setBusy(true);
    setPlaying(false);
    try {
      recordCreationStarted();
      const response = await fetch("/api/interpret", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image: source,
          intent: requestedIntent,
          inputKind,
        }),
        signal: controller.signal,
      });
      const result = await response.json();
      if (controller.signal.aborted || request.current !== controller) return;
      if (!response.ok && result.recovery) {
        const review = validateRecognitionReview(result.recovery);
        recordRecognitionReturned("repair");
        setRecognitionReview(review);
        setDraft(null);
        setDraftIntent(requestedIntent);
        setDialog("setup");
        tell(
          "Your recognized objects are kept for review. Correct the highlighted details before playing.",
        );
        return;
      }
      if (!response.ok) {
        recordRecognitionReturned(
          response.status === 422 ? "clarification" : "error",
        );
        throw new Error(
          result.error || "Your drawing could not be interpreted.",
        );
      }
      setDraft(validateWorld(result.world));
      setDraftIntent(requestedIntent);
      recordRecognitionReturned("accepted");
      setRecognitionReview(null);
      tell(
        "Your drawing has a first interpretation. Preview it before you play.",
      );
      void checkConnection();
    } catch (e) {
      if (request.current === controller)
        recordRecognitionReturned(
          e instanceof DOMException && e.name === "AbortError"
            ? "cancelled"
            : "error",
        );
      if (!(e instanceof DOMException && e.name === "AbortError"))
        setError(
          e instanceof Error
            ? e.message
            : "Something interrupted the request. Your drawing is safe.",
        );
    } finally {
      if (request.current === controller) {
        setBusy(false);
        request.current = null;
      }
    }
  }
  function cancelInterpretation() {
    recordRecognitionReturned("cancelled");
    request.current?.abort();
    setBusy(false);
    tell("Stopped. Your drawing is still here.");
  }
  async function fullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await stage.current?.requestFullscreen();
    } catch {
      tell("Your browser does not support full screen here.");
    }
  }
  const touch = (
    key: "left" | "right" | "up" | "down" | "jump" | "interact",
    value: boolean,
  ) => canvas.current?.touch(key, value);

  const draftRequiredCount =
    (draft?.goalRules?.requiredCollectedIds.length ?? 0) +
    (draft?.goalRules?.requiredActivatedIds.length ?? 0);
  const draftOptionalCount =
    (draft?.entities.filter(
      (entity) => entity.kind === "coin" || entity.kind === "lever",
    ).length ?? 0) - draftRequiredCount;
  const reviewActions = draft ? (
    <div className="review-footer">
      <p
        className="review-rule-count"
        aria-label="Completion requirements summary"
      >
        {draft.entities.some((entity) => entity.kind === "goal")
          ? `${draftRequiredCount} required · ${draftOptionalCount} optional · then reach a destination`
          : "Free exploration · no destination"}
      </p>
      <div className="review-actions">
        <button className="text-button" onClick={() => setDialog("create")}>
          Back
        </button>
        <button className="secondary-button" onClick={openDraftSetup}>
          <Pencil size={16} /> Edit objects
        </button>
        <button
          className="primary-button"
          disabled={Boolean(draftFeedback?.errors.length) || Boolean(error)}
          onClick={() => {
            recordReviewAccepted();
            loadWorld(draft);
            resetCreation();
            setDialog(null);
            setStarted(true);
            setPlaying(true);
            setFocusedPlay(true);
            requestAnimationFrame(() => {
              framePlaySurface(true, true);
              stage.current
                ?.querySelector<HTMLElement>(".world-canvas")
                ?.focus({ preventScroll: true });
            });
          }}
        >
          <Play size={16} fill="currentColor" /> Play this world
        </button>
      </div>
    </div>
  ) : undefined;

  const sourcePanel = (
    <aside className="paper-panel" aria-label="Your image and game idea">
      <div className="creation-source-column">
        <div className="panel-heading">
          <h2>
            <span className="creation-step-number">01</span> Start with an image
          </h2>
        </div>
        <div
          className="source-kind"
          role="group"
          aria-label="Source image type"
        >
          <button
            aria-pressed={inputKind === "drawing"}
            disabled={busy}
            onClick={() => {
              if (inputKind === "drawing") return;
              setInputKind("drawing");
              setDraft(null);
              setRecognitionReview(null);
              setSetupEdits(null);
            }}
          >
            Drawing
          </button>
          <button
            aria-pressed={inputKind === "picture"}
            disabled={busy}
            onClick={() => {
              if (inputKind === "picture") return;
              setInputKind("picture");
              setDraft(null);
              setRecognitionReview(null);
              setSetupEdits(null);
            }}
          >
            Photo or image
          </button>
        </div>
        {source ? (
          <button
            type="button"
            ref={sourceInspect}
            className={`paper-frame ${customSource ? "custom-paper" : ""}`}
            aria-label="Inspect original image"
            disabled={busy}
            onClick={() => {
              setSourceContext("creation");
              setDialog("source");
            }}
          >
            <span className="paper-tape" />
            <img src={source} alt={sourceName} />
            <span className="source-inspect-hint">
              Inspect image <Maximize2 size={12} />
            </span>
            <span className="source-caption">
              <span>
                {inputKind === "picture" ? "YOUR PICTURE" : "YOUR DRAWING"}
              </span>
              <span>↗</span>
            </span>
          </button>
        ) : (
          <div className="source-empty">
            <span className="creation-image-symbol">
              <ImagePlus size={29} />
            </span>
            <strong>Your image starts it.</strong>
            <p>A sketch, a photograph, an illustration. Make it yours.</p>
          </div>
        )}
        <div className="source-actions">
          <button
            className="secondary-button"
            onClick={() => file.current?.click()}
            disabled={busy}
          >
            <ImagePlus size={17} /> {source ? "Replace image" : "Upload image"}
          </button>
          <button
            className="secondary-button draw-button"
            aria-label={sketchDraft ? "Continue drawing" : "Draw here"}
            onClick={() => setDialog("sketch")}
            disabled={busy}
          >
            <Pencil size={17} />{" "}
            {sketchDraft ? "Continue drawing" : "Draw here"}
          </button>
        </div>
        <div className="capture-source-actions">
          <button
            className="text-button"
            disabled={busy}
            onClick={() => setDialog("phone")}
          >
            <Smartphone size={15} />
            Use phone camera
          </button>
          {customSource && (
            <button
              className="text-button"
              disabled={busy}
              onClick={() => {
                setPendingPhoto(source);
                setDialog("align");
              }}
            >
              <Crop size={15} />
              Align page
            </button>
          )}
        </div>
      </div>
      <div className="creation-intent-column">
        <div className="panel-heading">
          <h2>
            <span className="creation-step-number">02</span> Shape the
            experience
          </h2>
        </div>
        <label className="intent-label" htmlFor="world-intent">
          What do you imagine?
        </label>
        <p className="creation-intent-caption">
          Optional · Give it a mood, a goal or a challenge.
        </p>
        <div className="intent-box">
          <textarea
            id="world-intent"
            value={intent}
            maxLength={500}
            onChange={(e) => setIntent(e.target.value)}
            placeholder="Explore this scene, discover hidden lights, or take a character on a new journey…"
            disabled={busy}
          />
          <Sparkles size={15} aria-hidden="true" />
        </div>
        {error && (
          <p role="alert" className="source-error">
            {error}
          </p>
        )}
        {sketchDraft && sketchDraft !== source && (
          <p className="creation-draft-note">
            Your unfinished drawing is kept. Continue drawing to use your
            changes.
          </p>
        )}
        {draft && (
          <button
            className="secondary-button"
            disabled={busy}
            onClick={() => setDialog("review")}
          >
            Review current result
          </button>
        )}
        <button
          className="connection-note"
          onClick={() => {
            setSettingsReturn("create");
            setDialog("settings");
          }}
        >
          <span
            className={`status-dot ${connection?.configured ? "connected" : ""}`}
          />
          {connection?.configured
            ? `${connection.label} · key configured`
            : connectionError
              ? "Connection unavailable"
              : "Configure model access"}
          <ChevronRight size={13} />
        </button>
        {customSource && (
          <button
            className="secondary-button setup-source-button"
            disabled={busy}
            onClick={openDraftSetup}
          >
            <Pencil size={16} />
            {setupEdits
              ? "Continue arranging objects"
              : recognitionReview
                ? "Repair recognized objects"
                : draft
                  ? "Edit objects"
                  : "Arrange it myself"}
          </button>
        )}
      </div>
    </aside>
  );

  return (
    <div className={`app-shell studio-v2 ${focusedPlay ? "play-focused" : ""}`}>
      <input
        ref={file}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        hidden
        onChange={upload}
      />
      <header className="topbar">
        <a className="brand" href="#studio" aria-label="Doodlume studio">
          <img src="/art/favicon.svg" alt="" />
          <span>
            doodlume<span className="brand-dot">.</span>
          </span>
        </a>
        <nav aria-label="Main navigation">
          <a className="nav-current" href="#studio">
            Studio
          </a>
          <button onClick={() => setDialog("worlds")}>
            My worlds <span className="nav-count">{saved.length}</span>
          </button>
        </nav>
        <div className="top-actions">
          <button
            className="primary-button new-world-button"
            aria-label={
              hasCreationDraft ? "Resume draft" : "Create a new world"
            }
            onClick={() => openCreation()}
          >
            <Plus size={17} />
            <span className="new-world-full">
              {hasCreationDraft ? "Resume draft" : "New world"}
            </span>
            <span className="new-world-short" aria-hidden="true">
              {hasCreationDraft ? "Draft" : "New"}
            </span>
          </button>
          <button
            className="icon-button"
            aria-label="How to play"
            onClick={() => setDialog("help")}
          >
            <CircleHelp size={19} />
          </button>
          <button
            className="icon-button"
            aria-label="Studio settings"
            onClick={() => {
              setSettingsReturn(null);
              setDialog("settings");
            }}
          >
            <Settings2 size={19} />
          </button>
        </div>
      </header>
      <main id="studio">
        {world.source === "example" && !focusedPlay && (
          <section
            className="creation-invitation"
            aria-label="Make your own game"
          >
            <div>
              <h1>Your image. Your game.</h1>
              <p>
                Start with a sketch or photo. Play it, then keep shaping the
                same world.
              </p>
            </div>
            <div className="creation-invitation-actions">
              <button
                className="primary-button"
                onClick={() => openCreation("sketch")}
              >
                <Pencil size={17} /> Draw here
              </button>
              <button
                className="secondary-button"
                onClick={() => openCreation("upload")}
              >
                <ImagePlus size={17} /> Upload image
              </button>
            </div>
          </section>
        )}
        <div className="studio-workspace">
          <aside className="source-workspace" aria-label="Original artwork">
            <div className="source-workspace-heading">
              <span>Original image</span>
              <span className="source-origin">
                {world.source === "example" ? "Example" : "Yours"}
              </span>
            </div>
            <button
              ref={!focusedPlay ? worldSourceInspect : undefined}
              className="source-artwork-preview"
              aria-label={
                world.source === "example"
                  ? "Inspect example source artwork"
                  : "Inspect your world's source artwork"
              }
              onClick={() => {
                setSourceContext("world");
                setDialog("source");
              }}
            >
              <img
                src={world.sourceImage}
                alt="Original artwork used for this world"
              />
              <span>
                <Maximize2 size={13} /> Inspect original
              </span>
            </button>
            <div className="source-workspace-actions">
              <button
                className="secondary-button"
                onClick={openPaper}
                disabled={busy}
              >
                <ImagePlus size={16} /> Update image
              </button>
              <button
                className="primary-button"
                onClick={openEditor}
                disabled={busy}
              >
                <Pencil size={15} /> Edit world
              </button>
            </div>
          </aside>
          <section
            className={`world-panel ${focusedPlay ? "focused-play" : ""}`}
            aria-label="Your playable world"
          >
            <div className="world-heading">
              <button
                ref={focusedPlay ? worldSourceInspect : undefined}
                className="world-source-thumb"
                aria-label={
                  world.source === "example"
                    ? "Inspect example source artwork"
                    : "Inspect your world's source artwork"
                }
                onClick={() => {
                  setSourceContext("world");
                  setDialog("source");
                }}
              >
                <img src={world.sourceImage} alt="" />
                <Maximize2 size={12} />
              </button>
              <div className="world-title-block">
                <span className="world-stage-label">{modeLabel} world</span>
                <label className="world-name-label">
                  <span className="sr-only">World name</span>
                  <input
                    aria-label="World name"
                    value={world.name}
                    maxLength={80}
                    onChange={(e) =>
                      setWorld((w) => ({ ...w, name: e.target.value }))
                    }
                    onBlur={() => {
                      if (!world.name.trim())
                        setWorld((w) => ({
                          ...w,
                          name: "Untitled world",
                        }));
                    }}
                  />
                  <Pencil size={13} aria-hidden="true" />
                </label>
              </div>
              <div className="world-heading-actions">
                <span className="example-badge">
                  {world.source === "example"
                    ? world.revision > 1
                      ? "Edited example"
                      : "Playable example"
                    : world.source === "manual"
                      ? "Chosen by you"
                      : isCreativeAdaptation(world)
                        ? "Creative adaptation"
                        : world.inputKind === "picture"
                          ? "From your picture"
                          : "From your drawing"}
                </span>
                <button
                  className="secondary-button edit-world-button paper-update-button focus-only-action"
                  aria-label="Update this world's drawing"
                  onClick={openPaper}
                  disabled={busy}
                >
                  <ImagePlus size={16} />
                  <span>Update page</span>
                </button>
                <button
                  className="secondary-button edit-world-button focus-only-action"
                  aria-label="Keep creating in this world"
                  onClick={openEditor}
                  disabled={busy}
                >
                  <Pencil size={15} />
                  <span>Edit world</span>
                </button>
                <button
                  className="icon-button"
                  aria-label="Set destination rules"
                  title="Destination rules"
                  disabled={busy}
                  onClick={() => {
                    setEditorState(
                      canvas.current?.snapshot() ?? latestState.current,
                    );
                    setDialog("rules");
                  }}
                >
                  <Flag size={17} />
                </button>
                <button
                  className="icon-button"
                  aria-label="Undo last world edit"
                  title="Undo last world edit"
                  onClick={undoEdit}
                  disabled={!history.length || busy}
                >
                  <Undo2 size={17} />
                </button>
                <button
                  className="icon-button save-button"
                  aria-label="Save world on this device"
                  onClick={() => void save()}
                  disabled={saving}
                  aria-busy={saving}
                >
                  <ArrowDownToLine size={18} />
                </button>
              </div>
            </div>
            {world.revision > 1 && (
              <div className="revision-strip" role="status">
                <Check size={12} /> Version {world.revision} · Same world,
                progress kept{" "}
                <span>
                  {history.length} {history.length === 1 ? "edit" : "edits"} you
                  can undo
                </span>
              </div>
            )}
            {worldError && (
              <div className="world-error" role="alert">
                <p>{worldError}</p>
                <button
                  className="secondary-button"
                  onClick={() => {
                    setWorldError("");
                    setRun((n) => n + 1);
                    setPlaying(false);
                  }}
                >
                  Retry artwork
                </button>
                <button
                  className="secondary-button"
                  onClick={() => setDialog("worlds")}
                >
                  Open backups
                </button>
              </div>
            )}
            <div
              className={`game-stage ${mode === "discover" ? "discovery-stage" : ""}`}
              ref={stage}
            >
              {mode === "discover" && (
                <div className="discovery-clue-row">
                  <div>
                    <span>
                      {metrics.completed && !metrics.exploring
                        ? "DISCOVERY COMPLETE"
                        : metrics.exploring
                          ? "EXPLORING"
                          : started
                            ? "CURRENT CLUE"
                            : "DISCOVERY"}
                    </span>
                    <strong aria-live="polite">
                      {metrics.completed && !metrics.exploring
                        ? "Every required discovery complete."
                        : metrics.exploring
                          ? "Explore freely · achievement kept"
                          : started
                            ? metrics.interactionHint ||
                              metrics.goalHint ||
                              world.gameplay?.objectiveTitle ||
                              "Explore the image"
                            : world.gameplay?.objectiveTitle ||
                              "Explore the image"}
                    </strong>
                  </div>
                  {metrics.total > 0 && (
                    <span
                      className="discovery-found-count"
                      aria-label={`${metrics.collected} of ${metrics.total} discoveries found`}
                    >
                      <b>
                        {metrics.collected}/{metrics.total}
                      </b>{" "}
                      found
                    </span>
                  )}
                </div>
              )}
              <div className="game-surface">
                <WorldCanvas
                  ref={canvas}
                  onError={(message) => {
                    setWorldError(message);
                    setPlaying(false);
                  }}
                  world={world}
                  overview={mapView}
                  initial={initial}
                  playing={playing && !dialog && !busy}
                  muted={muted}
                  run={run}
                  onUpdate={(s, m) => {
                    latestState.current = s;
                    setMetrics(m);
                  }}
                  onMoment={tell}
                />
                {mode !== "discover" && metrics.total > 0 && (
                  <div className="game-top">
                    <span
                      className="seed-counter"
                      aria-label={`${metrics.collected} of ${metrics.total} collectibles found`}
                    >
                      <img
                        src={
                          world.entities.find((e) => e.kind === "coin")?.art ??
                          "/art/seed.svg"
                        }
                        alt=""
                      />
                      <b>{metrics.collected}</b>
                      <span>/ {metrics.total}</span>
                    </span>
                  </div>
                )}
                {!playing &&
                  !worldError &&
                  (!metrics.completed || metrics.exploring) &&
                  !busy && (
                    <div
                      className={`play-overlay ${started ? "paused-overlay" : ""}`}
                    >
                      <button
                        className="play-orb"
                        onClick={start}
                        aria-label={
                          metrics.exploring
                            ? "Continue exploring"
                            : started
                              ? `Resume ${modeLabel.toLowerCase()}`
                              : `Play ${modeLabel.toLowerCase()}`
                        }
                      >
                        <Play size={27} fill="currentColor" />
                      </button>

                      <span className="play-caption">
                        {started ? `${modeLabel} paused.` : world.name}
                      </span>
                      <span className="play-subcaption">
                        {metrics.exploring
                          ? "Achievement kept. Keep exploring or build something new."
                          : started
                            ? "Your progress is kept."
                            : world.gameplay?.instructions || world.description}
                      </span>
                    </div>
                  )}
                {metrics.completed && !metrics.exploring && (
                  <div className="completion-overlay">
                    <div className="completion-icon">
                      <Sparkles size={25} />
                    </div>
                    <span className="eyebrow">
                      {modeLabel.toUpperCase()} COMPLETE
                    </span>
                    <h2>{world.name}</h2>
                    <p>
                      {metrics.requiredTotal > 0
                        ? `${metrics.requiredTotal} required ${metrics.requiredTotal === 1 ? "action" : "actions"} complete`
                        : metrics.total > 0
                          ? `${metrics.collected} / ${metrics.total} optional discoveries found`
                          : "A world made yours."}
                    </p>
                    <div>
                      <button
                        className="primary-button"
                        onClick={() => continueWorld(true)}
                      >
                        Continue building <Pencil size={16} />
                      </button>
                      <button
                        className="secondary-button"
                        onClick={() => continueWorld()}
                      >
                        Keep exploring <Play size={16} />
                      </button>
                      <button className="text-button" onClick={restart}>
                        Replay from start <RotateCcw size={16} />
                      </button>
                      <button
                        className="text-button"
                        onClick={() => void save()}
                        disabled={saving}
                        aria-busy={saving}
                      >
                        <FolderHeart size={17} /> Save world
                      </button>
                    </div>
                  </div>
                )}
                {busy && (
                  <div className="reading-overlay">
                    <LoaderCircle size={30} className="spin" />
                    <h3>Creating your world.</h3>
                    <p>Your current adventure is kept.</p>
                    <button
                      className="text-button"
                      onClick={cancelInterpretation}
                    >
                      Cancel
                    </button>
                  </div>
                )}
                {mode !== "discover" &&
                  playing &&
                  (!metrics.completed || metrics.exploring) && (
                    <div className="quest-hud">
                      <span>
                        {metrics.exploring
                          ? "EXPLORING"
                          : metrics.requiredTotal > 0
                            ? "REQUIRED"
                            : "SUGGESTED"}
                      </span>
                      <strong>
                        {metrics.exploring
                          ? "Explore · achievement kept"
                          : world.gameplay
                            ? `${metrics.requiredTotal > 0 ? `${metrics.requiredDone}/${metrics.requiredTotal} · ` : ""}${world.gameplay.objectiveTitle}`
                            : metrics.requiredTotal > 0
                              ? `${metrics.requiredDone}/${metrics.requiredTotal} required · ${metrics.goalHint}`
                              : metrics.collected < metrics.total
                                ? `Optional items · ${metrics.total - metrics.collected} left`
                                : world.entities.some(
                                      (e) =>
                                        e.kind === "lever" &&
                                        !latestState.current.activated.includes(
                                          e.id,
                                        ),
                                    )
                                  ? "Use the switch · E"
                                  : world.entities.find(
                                        (e) => e.kind === "goal",
                                      )?.label
                                    ? `Reach ${world.entities.find((e) => e.kind === "goal")!.label}`
                                    : "Explore your world"}
                      </strong>
                    </div>
                  )}
              </div>
            </div>
            <div className="game-toolbar">
              <div className="play-controls">
                <button
                  className="icon-button play-control"
                  aria-label={
                    playing
                      ? `Pause ${modeLabel.toLowerCase()}`
                      : `Resume ${modeLabel.toLowerCase()}`
                  }
                  disabled={
                    (metrics.completed && !metrics.exploring) ||
                    busy ||
                    Boolean(worldError)
                  }
                  onClick={() => (playing ? setPlaying(false) : start())}
                >
                  {playing ? (
                    <Pause size={17} fill="currentColor" />
                  ) : (
                    <Play size={17} fill="currentColor" />
                  )}
                </button>
                <button
                  className="icon-button"
                  aria-label={`Restart ${modeLabel.toLowerCase()}`}
                  onClick={restart}
                  disabled={busy}
                >
                  <RotateCcw size={17} />
                </button>
                <span className="tool-divider" />
                <button
                  className="icon-button"
                  aria-label={muted ? "Turn sound on" : "Mute sound"}
                  aria-pressed={!muted}
                  onClick={() => setMuted(!muted)}
                >
                  {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
                </button>
              </div>
              <div className="keyboard-guide">
                {mode === "discover" ? (
                  <span>
                    <kbd>Tab</kbd> select <kbd>Enter</kbd> discover
                  </span>
                ) : mode === "roam" ? (
                  <span>
                    <kbd>W A S D</kbd> or arrows · move
                  </span>
                ) : (
                  <>
                    <span>
                      <kbd>←</kbd>
                      <kbd>→</kbd> move
                    </span>
                    <span>
                      <kbd>space</kbd> jump
                    </span>
                  </>
                )}
                {mode !== "discover" &&
                  world.entities.some((entity) => entity.kind === "lever") && (
                    <span>
                      <kbd>E</kbd> interact
                    </span>
                  )}
              </div>
              {mode !== "discover" && (
                <button
                  className="focus-play-button map-view-button"
                  aria-label={mapView ? "Follow character" : "Show whole world"}
                  title={mapView ? "Follow character" : "Show whole world"}
                  aria-pressed={mapView}
                  onClick={() => setMapView((value) => !value)}
                >
                  <Map size={17} />
                </button>
              )}
              <button
                className="focus-play-button"
                aria-pressed={focusedPlay}
                onClick={() => {
                  setFocusedPlay(!focusedPlay);
                  requestAnimationFrame(() => {
                    framePlaySurface(!focusedPlay, true);
                    stage.current
                      ?.querySelector<HTMLElement>(".world-canvas")
                      ?.focus({ preventScroll: true });
                  });
                }}
              >
                {focusedPlay ? (
                  <Minimize2 size={15} />
                ) : (
                  <Maximize2 size={15} />
                )}
                {focusedPlay ? "Back to studio" : "Focus on play"}
              </button>
              <button
                className="icon-button"
                aria-label="Full screen world"
                onClick={fullscreen}
              >
                <Maximize2 size={17} />
              </button>
            </div>
            {mode !== "discover" && (
              <div
                className={`touch-controls ${mode === "roam" ? "roam-touch-controls" : ""}`}
                aria-label="Touch game controls"
              >
                {(mode === "roam"
                  ? ([
                      ["left", ArrowLeft, "Move left"],
                      ["right", ArrowRight, "Move right"],
                      ["up", ArrowUp, "Move up"],
                      ["down", ArrowDown, "Move down"],
                      ["interact", WandSparkles, "Use lever"],
                    ] as const)
                  : ([
                      ["left", ArrowLeft, "Move left"],
                      ["right", ArrowRight, "Move right"],
                      ["jump", ArrowUp, "Jump"],
                      ["interact", WandSparkles, "Use lever"],
                    ] as const)
                )
                  .filter(
                    ([key]) =>
                      key !== "interact" ||
                      world.entities.some((entity) => entity.kind === "lever"),
                  )
                  .map(([key, Icon, label]) => (
                    <button
                      key={key}
                      data-control={key}
                      aria-label={
                        key === "interact"
                          ? metrics.interactionHint || "Use nearby switch"
                          : label
                      }
                      title={
                        key === "interact"
                          ? metrics.interactionHint || "Use nearby switch"
                          : label
                      }
                      onPointerDown={(e) => {
                        e.currentTarget.setPointerCapture(e.pointerId);
                        if (!started) start();
                        touch(key, true);
                      }}
                      onPointerUp={() => touch(key, false)}
                      onPointerCancel={() => touch(key, false)}
                      onLostPointerCapture={() => touch(key, false)}
                    >
                      <Icon size={20} />
                      {key === "interact" && <span>Use</span>}
                    </button>
                  ))}
              </div>
            )}
          </section>
        </div>
        {error && dialog !== "create" && (
          <div role="alert" className="error-notice">
            <span>{error}</span>
            <button
              className="icon-button"
              aria-label="Dismiss error"
              onClick={() => setError("")}
            >
              <X size={16} />
            </button>
          </div>
        )}
        <details className="example-section" aria-label="Example worlds">
          <summary className="example-intro">
            <span>Explore example worlds</span>
            <span className="example-disclosure-count">
              {EXAMPLES.length} worlds
            </span>
            <ChevronRight size={15} />
          </summary>
          <div className="example-grid">
            {EXAMPLES.map((example, i) => (
              <button
                key={example.id}
                className={`example-card example-${example.theme} ${(world.exampleId ?? world.id) === example.id ? "selected" : ""}`}
                disabled={busy}
                onClick={() => {
                  loadWorld(freshExample(example.id));
                  tell(`${example.name} is ready to explore.`);
                }}
              >
                <div className="example-art">
                  <span className="example-number">0{i + 1}</span>
                  <div className="mini-sun" />
                  <div className="mini-hill back" />
                  <div className="mini-hill front" />
                  <img
                    className="mini-hero"
                    src={example.entities.find((e) => e.kind === "player")!.art}
                    alt=""
                  />
                  <img className="mini-seed" src="/art/seed.svg" alt="" />
                  <span className="example-open">
                    {(world.exampleId ?? world.id) === example.id ? (
                      <Check size={16} />
                    ) : (
                      <ArrowUpRight size={17} />
                    )}
                  </span>
                </div>
                <div className="example-card-copy">
                  <strong>{example.name}</strong>
                </div>
              </button>
            ))}
          </div>
        </details>
      </main>
      <div
        className={`toast ${notice ? "visible" : ""}`}
        role="status"
        aria-live="polite"
      >
        {notice && (
          <>
            <span className="toast-spark">✳</span>
            {notice}
            <button
              aria-label="Dismiss notification"
              onClick={() => setNotice("")}
            >
              <X size={14} />
            </button>
          </>
        )}
      </div>
      {dialog === "create" && (
        <Modal
          title={
            hasCreationDraft
              ? "Continue your creation"
              : "Create a playable world"
          }
          className="creation-modal"
          wide
          footer={
            <div className="creation-footer">
              <div>
                <span>Current game stays open.</span>
                {hasCreationDraft && !busy && (
                  <button
                    className="text-button"
                    onClick={() => setDialog("discard-creation")}
                  >
                    Start over
                  </button>
                )}
              </div>
              {busy ? (
                <button
                  className="primary-button"
                  onClick={cancelInterpretation}
                >
                  <LoaderCircle size={17} className="spin" /> Stop creating{" "}
                  <X size={16} />
                </button>
              ) : (
                <button
                  className="primary-button"
                  disabled={!customSource || !source}
                  onClick={bringAlive}
                >
                  <WandSparkles size={18} /> Create world{" "}
                  <ArrowUpRight size={17} />
                </button>
              )}
            </div>
          }
          onClose={() => {
            sourceVersion.current++;
            if (busy) cancelInterpretation();
            setDialog(null);
          }}
        >
          {sourcePanel}
        </Modal>
      )}
      {dialog === "discard-creation" && (
        <Modal
          title="Start a new creation draft?"
          onClose={() => setDialog("create")}
        >
          <p className="modal-copy">
            This clears the unfinished drawing, image, play idea and review.
            Your active game and saved worlds stay as they are.
          </p>
          <div className="review-actions">
            <button
              className="secondary-button"
              onClick={() => setDialog("create")}
            >
              Keep draft
            </button>
            <button
              className="primary-button"
              onClick={() => {
                resetCreation();
                setDialog("create");
              }}
            >
              Start new draft
            </button>
          </div>
        </Modal>
      )}
      {dialog === "source" && (
        <SourceInspector
          image={
            sourceContext === "world"
              ? world.sourceImage
              : sourceContext === "review"
                ? (draft?.sourceImage ?? source)
                : source
          }
          name={
            sourceContext === "world"
              ? `${world.source === "example" ? "Example source" : "Your source"} · ${world.name}`
              : sourceContext === "review"
                ? `Your original · ${draft?.name ?? "New world"}`
                : sourceName
          }
          backLabel={
            sourceContext === "world"
              ? "Back to world"
              : sourceContext === "review"
                ? "Back to review"
                : "Back to creation"
          }
          onClose={() => {
            setDialog(
              sourceContext === "world"
                ? null
                : sourceContext === "review"
                  ? "review"
                  : "create",
            );
            requestAnimationFrame(() =>
              (sourceContext === "world"
                ? worldSourceInspect
                : sourceContext === "review"
                  ? reviewSourceInspect
                  : sourceInspect
              ).current?.focus(),
            );
          }}
        />
      )}
      {dialog === "draft-rules" && draft && (
        <GoalRules
          world={draft}
          onCancel={returnToDraftReview}
          onApply={(goalRules, gameplay) => {
            setDraft(
              validateWorld({
                ...draft,
                goalRules,
                ...(gameplay ? { gameplay } : {}),
              }),
            );
            returnToDraftReview();
          }}
        />
      )}
      {dialog === "rules" && (
        <GoalRules
          world={world}
          state={editorState}
          onCancel={() => setDialog(null)}
          onApply={(rules, gameplay) =>
            applyEdit({
              id: crypto.randomUUID(),
              worldId: world.id,
              baseRevision: world.revision,
              origin: "manual",
              additions: [],
              goalRules: rules,
              ...(gameplay ? { gameplay } : {}),
            })
          }
        />
      )}
      {dialog === "review" && draft && (
        <Modal
          title="Review your world"
          wide
          footer={reviewActions}
          className="world-review-modal"
          onClose={() => setDialog("create")}
        >
          <div className="world-review-heading">
            <div>
              <h3>{draft.name}</h3>
              <p>{draft.description}</p>
            </div>
            <span>
              {isCreativeAdaptation(draft)
                ? "Creative adaptation"
                : `${draft.entities.length} objects`}
            </span>
          </div>
          <div className="world-review-pair">
            <button
              ref={reviewSourceInspect}
              className="review-original-preview"
              aria-label="Inspect this draft's original image"
              onClick={() => {
                setSourceContext("review");
                setDialog("source");
              }}
            >
              <img
                src={draft.sourceImage}
                alt="Original image for this draft"
              />
              <span>
                <Maximize2 size={13} /> Original image
              </span>
            </button>
            <div className="review-stage">
              <WorldCanvas
                world={draft}
                run={0}
                playing={false}
                muted
                overview
                onUpdate={() => {}}
                onMoment={() => {}}
                onError={setError}
              />
            </div>
          </div>
          {error && (
            <p className="setup-error" role="alert">
              {error} Edit objects to repair the source selection before
              playing.
            </p>
          )}
          {isCreativeAdaptation(draft) && (
            <section
              className="creative-adaptation-note"
              aria-label="Creative adaptation"
            >
              <Sparkles size={18} />
              <div>
                <strong>Your image, reimagined for play.</strong>
                <p>
                  Your image is the setting. Gameplay is generated around it,
                  ready for you to reshape.
                </p>
              </div>
            </section>
          )}
          {draft.inputKind === "picture" &&
            movementMode(draft) !== "discover" &&
            !isCreativeAdaptation(draft) && (
              <p className="modal-copy">
                Check each subject’s full outline. Use Edit objects to adjust a
                cutout.
              </p>
            )}
          {draftFeedback?.errors.map((message) => (
            <p className="setup-error" key={message}>
              {message}
            </p>
          ))}
          {draftIntent && (
            <p className="review-intent">
              <strong>Your play idea</strong> {draftIntent}
            </p>
          )}
          <div ref={draftRulesAnchor}>
            <WorldRulesSummary
              world={draft}
              onEdit={() => setDialog("draft-rules")}
            />
          </div>
          {movementMode(draft) !== "discover" && (
            <ArtworkReview
              entities={
                isCreativeAdaptation(draft)
                  ? draft.entities.filter(
                      (entity) =>
                        entity.artNote !== originalBackdropNote &&
                        !entity.artNote?.startsWith("Generated"),
                    )
                  : draft.entities
              }
            />
          )}
        </Modal>
      )}
      {dialog === "phone" && (
        <PhonePairing
          context={{ purpose: "create", name: "A new Doodlume world" }}
          onClose={() => setDialog("create")}
          onReceive={(image) => {
            if (inputKind === "picture") {
              useSource(image, "Your phone picture");
              return;
            }
            setPendingPhoto(image);
            setPendingPhotoName("Your phone drawing");
            setDialog("align");
          }}
        />
      )}
      {dialog === "align" && pendingPhoto && (
        <PageAlignment
          image={pendingPhoto}
          onClose={() => {
            setPendingPhoto(undefined);
            setDialog("create");
          }}
          onUse={(image) => {
            setPendingPhoto(undefined);
            useSource(image, pendingPhotoName);
          }}
        />
      )}
      {dialog === "setup" && (
        <WorldSetup
          image={
            recognitionReview?.draft.sourceImage ?? draft?.sourceImage ?? source
          }
          inputKind={
            recognitionReview?.draft.inputKind ?? draft?.inputKind ?? inputKind
          }
          initial={recognitionReview ? undefined : (draft ?? undefined)}
          recovery={recognitionReview ?? undefined}
          resume={setupEdits ?? undefined}
          onPause={setSetupEdits}
          intent={
            draft || recognitionReview || setupEdits ? draftIntent : intent
          }
          onClose={() =>
            setDialog(
              recognitionReview ? "create" : draft ? "review" : "create",
            )
          }
          onUse={(next) => {
            setRecognitionReview(null);
            setSetupEdits(null);
            setError("");
            setDraft(next);
            setDialog("review");
            tell(
              "Your playable preview is ready. Check the cutouts, then open your world.",
            );
          }}
        />
      )}
      {dialog === "sketch" && (
        <SketchPad
          resumeImage={sketchDraft}
          onPause={setSketchDraft}
          onClose={() => setDialog("create")}
          onUse={(image) => {
            useSource(image, "A drawing, made by you", "drawing");
            setSketchDraft(image);
          }}
        />
      )}
      {dialog === "paper" && (
        <PaperUpdate
          world={world}
          configured={Boolean(connection?.configured)}
          provider={connection?.label ?? "Meta"}
          initialImage={revisedPage}
          initialIntent={paperIntent}
          onIntentChange={setPaperIntent}
          initialKind={tracedAdditions[0]?.kind}
          initialMark={
            tracedAdditions[0]?.art
              ? {
                  art: tracedAdditions[0].art,
                  x: tracedAdditions[0].x / 1.44,
                  y: tracedAdditions[0].y / 0.82,
                  width: tracedAdditions[0].width / 1.44,
                  height: tracedAdditions[0].height / 0.82,
                }
              : undefined
          }
          onClose={() => setDialog(null)}
          onManual={(image, mark, kind) => {
            setRevisedPage(image);
            setPaperProposal(undefined);
            setTracedAdditions(
              mark
                ? [
                    {
                      id: `ink-${crypto.randomUUID()}`,
                      kind: kind ?? "bridge",
                      x: mark.x * 1.44,
                      y: mark.y * 0.82,
                      width: Math.max(4, mark.width * 1.44),
                      height: Math.max(4, mark.height * 0.82),
                      art: mark.art,
                      label: `Drawn ${kind ?? "bridge"}`,
                    },
                  ]
                : [],
            );
            setDialog("editor");
          }}
          onReview={(proposal) => {
            setTracedAdditions([]);
            setPaperProposal(proposal);
            setRevisedPage(proposal.patch.sourceImage);
            setDialog("editor");
          }}
        />
      )}
      {dialog === "editor" && (
        <WorldEditor
          world={world}
          state={editorState}
          onApply={applyEdit}
          proposal={paperProposal}
          initialAdditions={tracedAdditions}
          revisedImage={revisedPage}
          onBack={revisedPage ? () => setDialog("paper") : undefined}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === "worlds" && (
        <WorldLibrary
          entries={saved}
          loadError={libraryError}
          onRetry={() => {
            void updateLibrary(savedWorlds())
              .then((entries) => {
                setSaved(entries);
                setLibraryError("");
              })
              .catch(() =>
                setLibraryError(
                  "Storage is still unavailable. Your stored worlds have not been removed.",
                ),
              );
          }}
          getCurrent={() => ({
            world,
            state: canvas.current?.snapshot() ?? latestState.current,
            history,
            savedAt: new Date().toISOString(),
          })}
          onOpen={(entry) => {
            loadWorld(
              entry.world,
              retainPlayState(entry.world, entry.state),
              entry.history ?? [],
            );
            setDialog(null);
          }}
          onImport={setSaved}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === "settings" && (
        <Modal
          title="Studio settings"
          onClose={() => setDialog(settingsReturn)}
        >
          <div className="connection-card">
            <div className="meta-mark">∞</div>
            <div>
              <strong>
                {connection?.label ?? "Meta drawing interpretation"}
              </strong>
              <p>
                <span
                  className={`status-dot ${connection?.configured ? "connected" : ""}`}
                />
                {connection?.configured
                  ? `${connection.label} · key configured`
                  : connectionError
                    ? "Local API is unavailable"
                    : "API key not configured"}
              </p>
            </div>
          </div>
          <div className="setup-details">
            <span>Model</span>
            <code>{connection?.model ?? "Configuration unavailable"}</code>
            <span>Source cutouts</span>
            <span>
              {connection?.segmentation?.enabled &&
              connection.segmentation.configured
                ? `${connection.segmentation.model} configured`
                : "Original image crops"}
            </span>
            <span>Storage</span>
            <span>This browser · {saved.length} saved worlds</span>
          </div>
          <p className="modal-copy">
            This checks local configuration without spending model credits. A
            configured key does not confirm provider availability.
          </p>
          {!connection?.configured && (
            <p className="modal-copy">
              Connect a Meta provider on the server to create worlds from new
              images. Your saved worlds and examples remain playable.
            </p>
          )}
          <button
            className="secondary-button"
            onClick={() => void checkConnection()}
          >
            <RotateCcw size={16} /> Refresh configuration
          </button>
        </Modal>
      )}
      {dialog === "help" && (
        <Modal title="How to play" onClose={() => setDialog(null)}>
          <div className="help-lead">
            <Sprout size={30} />
            <p>
              Doodlume turns a page into a place you can explore. The studio
              gives you a canvas, playable examples, and a way to keep adding to
              the same world.
            </p>
          </div>
          <div className="help-steps">
            <div>
              <span>01</span>
              <section>
                <h3>Start with a page</h3>
                <p>
                  Upload a drawing or photo, or use the pencil to draw here.
                  Inspect the original image, describe how it should play, then
                  review its objects before playing.
                </p>
              </section>
            </div>
            <div>
              <span>02</span>
              <section>
                <h3>Play your world</h3>
                <p>
                  Move with ← → or A / D. Jump with Space, ↑, or W. Collect the
                  objects in your world. Press E near a lever to open its gate.
                  Reach a destination to complete the adventure. Destination
                  rules show which items and switches are required; other
                  collectibles are optional. On phones, use the on-screen
                  controls.
                </p>
              </section>
            </div>
            <div>
              <span>03</span>
              <section>
                <h3>Keep your progress</h3>
                <p>
                  Save your world to this device. Its character position,
                  collected items and open gates come with it. Continue building
                  after completion, or back up your worlds from My worlds.
                </p>
              </section>
            </div>
          </div>
          <div className="help-next">
            <Layers3 size={21} />
            <div>
              <strong>Your page can keep growing.</strong>
              <p>
                Use Update page to draw on your original or upload a revised
                photo. Review and place the new objects before applying.
                Automatic Meta comparison requires a working key and a world
                created from your own drawing.
              </p>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
