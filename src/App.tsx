import { useEffect, useRef, useState, type ChangeEvent } from "react";
import {
  Save,
  Ellipsis,
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
import { copyExample } from "./lib/example-copy";
import { isSourceAlignedScenery } from "../shared/source-scenery";
import {
  rememberedWorldId,
  rememberWorld,
  returningWorld,
} from "./lib/session-world";
import { objectName } from "./lib/object-name";
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
  | "world-options"
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
  const [boot] = useState(() => {
    const entries = savedWorlds();
    return { entries, returning: returningWorld(entries, rememberedWorldId()) };
  });
  const [world, setWorld] = useState(
    () => boot.returning?.world ?? freshExample(EXAMPLES[0].id),
  );
  const [initial, setInitial] = useState<PlayState>(
    () => boot.returning?.state ?? emptyPlayState(),
  );
  const [source, setSource] = useState("");
  const [sourceName, setSourceName] = useState("Your drawing");
  const [customSource, setCustomSource] = useState(false);
  const [inputKind, setInputKind] = useState<InputKind>("drawing");
  const [intent, setIntent] = useState("");
  const [creationStyle, setCreationStyle] = useState<
    "auto" | "platform" | "roam" | "discover"
  >("auto");
  const [draftIntent, setDraftIntent] = useState("");
  const [sketchDraft, setSketchDraft] = useState<string | undefined>();
  const [sourceContext, setSourceContext] = useState<
    "creation" | "world" | "review"
  >("creation");
  const [settingsReturn, setSettingsReturn] = useState<Dialog>(null);
  const [playing, setPlaying] = useState(false);
  const [focusedPlay, setFocusedPlay] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  useEffect(() => {
    const update = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", update);
    return () => document.removeEventListener("fullscreenchange", update);
  }, []);
  const [mapView, setMapView] = useState(false);
  const [started, setStarted] = useState(Boolean(boot.returning));
  const [muted, setMuted] = useState(true);
  const [run, setRun] = useState(0);
  const [metrics, setMetrics] = useState(() =>
    boot.returning
      ? {
          ...initialMetrics,
          collected: boot.returning.state.collected.length,
          total: boot.returning.world.entities.filter(
            (entity) => entity.kind === "coin",
          ).length,
          completed: boot.returning.state.completed,
          exploring: Boolean(boot.returning.state.exploring),
          ...objectiveTelemetry(boot.returning.world, boot.returning.state),
        }
      : initialMetrics,
  );
  const [dialog, setDialog] = useState<Dialog>(null);
  const [saved, setSaved] = useState(boot.entries);
  const [saving, setSaving] = useState(false);
  const [libraryError, setLibraryError] = useState("");
  const [libraryLoading, setLibraryLoading] = useState(true);
  const [connection, setConnection] = useState<Connection | null>(null);
  const [connectionError, setConnectionError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [creationError, setCreationError] = useState("");
  const [requestSeconds, setRequestSeconds] = useState(0);
  const [lastCreation, setLastCreation] = useState<"untested" | "success" | "failed" | "review">("untested");
  useEffect(() => {
    if (!busy) return;
    const began = Date.now();
    setRequestSeconds(0);
    const timer = window.setInterval(() => setRequestSeconds(Math.floor((Date.now() - began) / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, [busy]);
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
  const paperDrafts = useRef(new globalThis.Map<string, { proposal?: PaperProposal; image?: string; additions: WorldEntity[]; intent: string }>());
  function paperDraftKey(value: WorldDefinition) { return `${value.id}:${value.revision}`; }
  function restorePaperDraft(value: WorldDefinition) {
    const kept = paperDrafts.current.get(paperDraftKey(value));
    setPaperProposal(kept?.proposal); setRevisedPage(kept?.image);
    setTracedAdditions(kept?.additions ?? []); setPaperIntent(kept?.intent ?? "");
  }
  function rememberPaperDraft() {
    if (!paperProposal && !revisedPage && !tracedAdditions.length && !paperIntent) return;
    paperDrafts.current.set(paperDraftKey(worldNow.current), { proposal: paperProposal, image: revisedPage, additions: tracedAdditions, intent: paperIntent });
    if (paperDrafts.current.size > 12) paperDrafts.current.delete(paperDrafts.current.keys().next().value!);
  }
  const [pendingPhoto, setPendingPhoto] = useState<string | undefined>();
  const [pendingPhotoName, setPendingPhotoName] = useState("Your drawing");
  const [history, setHistory] = useState<RevisionCheckpoint[]>(
    boot.returning?.history ?? [],
  );
  const allowStartupRestore = useRef(true);
  const worldNow = useRef(world);
  worldNow.current = world;
  const canvas = useRef<WorldCanvasHandle>(null);
  const file = useRef<HTMLInputElement>(null);
  const sourceInspect = useRef<HTMLButtonElement>(null);
  const worldSourceInspect = useRef<HTMLButtonElement>(null);
  const reviewSourceInspect = useRef<HTMLButtonElement>(null);
  const draftRulesAnchor = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const [gameControlsHost, setGameControlsHost] = useState<HTMLDivElement | null>(null);
  const recoveryAction = useRef<HTMLButtonElement>(null);
  const directionPresses = useRef(
    new globalThis.Map<
      string,
      {
        started: number;
        released: boolean;
        timer?: ReturnType<typeof setTimeout>;
      }
    >(),
  );
  const latestState = useRef<PlayState>(
    boot.returning?.state ?? emptyPlayState(),
  );
  const request = useRef<AbortController | null>(null);
  const sourceVersion = useRef(0);
  const previousPlaying = useRef(false);
  const draftFeedback = draft ? setupFeedback(draft) : null;
  const sourcePageSize = world.entities.find(isSourceAlignedScenery) ?? { width: 1440, height: 820 };
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
    allowStartupRestore.current = false;
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
    setCreationStyle("auto");
    setDraftIntent("");
    setCustomSource(false);
    setCreationError("");
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
        if (!active) return;
        setSaved(entries);
        if (allowStartupRestore.current) {
          allowStartupRestore.current = false;
          const returning = returningWorld(entries, rememberedWorldId());
          if (returning) {
            loadWorld(returning.world, returning.state, returning.history);
            setStarted(true);
            rememberWorld(returning.world);
          }
        }
      })
      .catch(() => {
        if (active)
          setLibraryError(
            "Saved worlds could not be loaded. Stored data has not been removed.",
          );
      })
      .finally(() => { if (active) setLibraryLoading(false); });
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
    allowStartupRestore.current = false;
    if (saved.some((entry) => entry.world.id === next.id)) rememberWorld(next);
    sourceVersion.current++;
    if (request.current) recordRecognitionReturned("cancelled");
    request.current?.abort();
    request.current = null;
    setWorldError("");
    rememberPaperDraft();
    restorePaperDraft(next);
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
  function beginPersonalEdit(state: PlayState) {
    const personal = copyExample(worldNow.current, history);
    if (personal.world !== worldNow.current) {
      setWorld(personal.world); worldNow.current = personal.world;
      setHistory(personal.history);
      setInitial(state); latestState.current = state;
    }
    setEditorState(state);
  }
  function openEditor() {
    allowStartupRestore.current = false;
    beginPersonalEdit(editableState());
    setDialog("editor");
  }
  function openPaper() {
    allowStartupRestore.current = false;
    beginPersonalEdit(editableState());
    setDialog("paper");
  }
  function keepRevision(next: WorldDefinition, state: PlayState) {
    paperDrafts.current.delete(paperDraftKey(worldNow.current));
    setPaperIntent(""); setPaperProposal(undefined); setRevisedPage(undefined); setTracedAdditions([]);
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
    // Rules can also be edited directly from an example's options.
    const result = applyWorldPatch(worldNow.current, editorState, patch);
    const personal = copyExample(result.world, [...history, result.checkpoint].slice(-12));
    setHistory(personal.history);
    keepRevision(personal.world, result.state);
    if (patch.goalRules) {
      tell("Destination rules updated.");
      return;
    }
    if (patch.bounds) {
      tell("World expanded.");
      return;
    }
    tell("World updated.");
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
  function framePlaySurface(_focused: boolean, instant = false) {
    const behavior =
      instant || window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth";
    // Both layouts start at the page top. Centering the stage on studio return
    // clips navigation and the title above it.
    window.scrollTo({ top: 0, behavior });
  }
  function start() {
    if (worldError) return;
    allowStartupRestore.current = false;
    setStarted(true);
    setPlaying(true);
    setFocusedPlay(true);
    requestAnimationFrame(() => framePlaySurface(true));
    stage.current
      ?.querySelector<HTMLElement>(".world-canvas")
      ?.focus({ preventScroll: true });
  }
  function restart() {
    allowStartupRestore.current = false;
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
    tell("Replay started.");
  }
  async function save() {
    if (saving) return;
    allowStartupRestore.current = false;
    const savingWorld = worldNow.current;
    const personal = copyExample(savingWorld, history);
    const entry: SavedWorld = {
      world: personal.world,
      state: canvas.current?.snapshot() ?? latestState.current,
      history: personal.history,
      savedAt: new Date().toISOString(),
    };
    setSaving(true);
    setError("");
    try {
      const next = await updateLibrary(saved, entry);
      setSaved(next);
      // Saving must never replace a world opened or edited while storage was busy.
      if (worldNow.current === savingWorld) {
        rememberWorld(personal.world);
        if (personal.world !== savingWorld) {
          const currentState = canvas.current?.snapshot() ?? latestState.current;
          setInitial(currentState); latestState.current = currentState;
          setWorld(personal.world); worldNow.current = personal.world;
          setHistory(personal.history);
        }
      }
      tell(`Saved ${personal.world.name}.`);
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
    setCreationError("");
    try {
      const image = await readDrawingFile(selected);
      if (version !== sourceVersion.current) return;
      useSource(image, selected.name);
    } catch (e) {
      if (version !== sourceVersion.current) return;
      setCreationError(
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
    setCreationError("");
    setDialog("create");
    previousPlaying.current = false;
    tell("Image ready.");
  }
  async function bringAlive() {
    setCreationError("");
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
    const requestedIntent = creationIntent();
    if (requestedIntent.length > 500) {
      setCreationError("Shorten your idea to leave room for the selected game style.");
      return;
    }
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
        setLastCreation("review");
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
      setLastCreation("success");
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
      if (!(e instanceof DOMException && e.name === "AbortError") && request.current === controller) {
        setLastCreation("failed");
        setCreationError(
          e instanceof TypeError && /fetch|network|load failed/i.test(e.message)
            ? "The creation service couldn’t be reached. Try again when the connection returns."
            : e instanceof Error
            ? e.message
            : "Something interrupted the request. Your drawing is safe.",
        );
      }
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
    request.current = null;
    setBusy(false);
    tell("Stopped. Your drawing is still here.");
  }
  async function fullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await stage.current?.closest<HTMLElement>(".world-panel")?.requestFullscreen();
    } catch {
      tell("Your browser does not support full screen here.");
    }
  }
  const touch = (
    key: "left" | "right" | "up" | "down" | "jump" | "interact",
    value: boolean,
  ) => canvas.current?.touch(key, value);

  function cancelDirectionPresses() {
    for (const [key, press] of directionPresses.current) {
      clearTimeout(press.timer);
      canvas.current?.touch(key as "left" | "right" | "up" | "down", false);
    }
    directionPresses.current.clear();
  }
  function beginControl(
    key: "left" | "right" | "up" | "down" | "jump" | "interact",
  ) {
    if (mode !== "roam" || !["left", "right", "up", "down"].includes(key)) {
      touch(key, true);
      return;
    }
    const previous = directionPresses.current.get(key);
    // Native key repeat must not keep moving the minimum-release deadline.
    if (previous && !previous.released) return;
    clearTimeout(previous?.timer);
    directionPresses.current.set(key, {
      started: performance.now(),
      released: false,
    });
    touch(key, true);
  }
  function endControl(
    key: "left" | "right" | "up" | "down" | "jump" | "interact",
    cancel = false,
    captureLost = false,
  ) {
    const press = directionPresses.current.get(key);
    if (!press) {
      touch(key, false);
      return;
    }
    // Pointerup normally releases capture as well. It must not erase the pulse.
    if (captureLost && press.released) return;
    clearTimeout(press.timer);
    const remaining = cancel
      ? 0
      : Math.max(0, 90 - (performance.now() - press.started));
    press.released = true;
    if (remaining > 0) {
      press.timer = setTimeout(() => {
        if (directionPresses.current.get(key) !== press) return;
        touch(key, false);
        directionPresses.current.delete(key);
      }, remaining);
    } else {
      touch(key, false);
      directionPresses.current.delete(key);
    }
  }
  useEffect(() => () => cancelDirectionPresses(), []);
  useEffect(() => {
    cancelDirectionPresses();
  }, [world.id, run]);
  useEffect(() => {
    if (
      !playing ||
      dialog ||
      busy ||
      worldError ||
      (metrics.completed && !metrics.exploring)
    )
      cancelDirectionPresses();
  }, [playing, dialog, busy, worldError, metrics.completed, metrics.exploring]);
  useEffect(() => {
    const cancel = () => cancelDirectionPresses();
    window.addEventListener("blur", cancel);
    return () => window.removeEventListener("blur", cancel);
  }, []);

  function creationIntent() {
    const prefix =
      creationStyle === "platform"
        ? "Make an Adventure: a platform game with a character, jumping and meaningful paths. "
        : creationStyle === "roam"
          ? "Make an Explore game: a character moves freely in all directions through this scene. "
          : creationStyle === "discover"
            ? "Make a Discover game: interactive clues in the original image, without a separate avatar. "
            : "";
    return prefix + intent.trim();
  }
  const objective = goalProgress(world, latestState.current);
  const optionalObjects = world.entities.filter((entity) =>
    entity.kind === "coin"
      ? !world.goalRules?.requiredCollectedIds.includes(entity.id)
      : entity.kind === "lever"
        ? !world.goalRules?.requiredActivatedIds.includes(entity.id)
        : false,
  );
  const optionalDone = optionalObjects.filter((entity) =>
    (entity.kind === "coin"
      ? latestState.current.collected
      : latestState.current.activated
    ).includes(entity.id),
  ).length;
  const destination = world.entities.find((entity) => entity.kind === "goal");
  const missionText =
    metrics.completed && !metrics.exploring
      ? "Achievement earned"
      : metrics.exploring
        ? "Explore freely or keep creating"
        : mode === "discover" && started
          ? metrics.interactionHint ||
            metrics.goalHint ||
            world.gameplay?.objectiveTitle ||
            "Explore the image"
          : objective.total > objective.done
            ? world.gameplay?.objectiveTitle || "Complete the required actions"
            : destination
              ? `Reach ${objectName(world, destination.id, 70)}`
              : world.gameplay?.objectiveTitle || "Explore your world";

  const reviewActions = draft ? (
    <div className="review-footer">
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
          <h2>Image</h2>
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
          <button className="source-empty" aria-label="Upload image" onClick={() => file.current?.click()} disabled={busy}>
            <span className="creation-image-symbol">
              <ImagePlus size={29} />
            </span>
            <strong>Choose an image</strong>
            <span className="source-formats">PNG, JPG or WebP</span>
          </button>
        )}
        <div className="source-actions">
          {source && <button
            className="secondary-button"
            onClick={() => file.current?.click()}
            disabled={busy}
          >
            <ImagePlus size={17} /> Replace image
          </button>}
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
        <label className="source-kind source-kind-field">
          <span>Image type</span>
          <select
            aria-label="Source image type"
            value={inputKind}
            disabled={busy}
            onChange={(event) => {
              const next = event.target.value as InputKind;
              if (next === inputKind) return;
              setInputKind(next);
              setDraft(null);
              setRecognitionReview(null);
              setSetupEdits(null);
            }}
          >
            <option value="drawing">Drawing</option>
            <option value="picture">Photo or image</option>
          </select>
        </label>
      </div>
      <div className="creation-intent-column">
        <label className="intent-label" htmlFor="world-intent">
          Your idea <span className="field-optional">Optional</span>
        </label>
        <div className="intent-box">
          <textarea
            id="world-intent"
            value={intent}
            maxLength={400}
            onChange={(e) => setIntent(e.target.value)}
            placeholder="What would make this image interesting to play?"
            disabled={busy}
          />
          <Sparkles size={15} aria-hidden="true" />
        </div>
        <details className="creation-gameplay-options">
          <summary>Gameplay <span>{creationStyle === "auto" ? "Auto" : creationStyle === "platform" ? "Adventure" : creationStyle === "roam" ? "Explore" : "Discover"}</span></summary>
        <fieldset className="creation-modes" disabled={busy}>
          <legend>Gameplay</legend>
          <div>
            {(
              [
                ["auto", "Auto"],
                ["platform", "Adventure"],
                ["roam", "Explore"],
                ["discover", "Discover"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={creationStyle === value}
                onClick={() => setCreationStyle(value)}
              >
                {label}
              </button>
            ))}
          </div>
        </fieldset>
        </details>
        {busy && <div className="creation-progress" role="status">
          <LoaderCircle size={20} className="spin" />
          <div><strong>Creating your world</strong><span aria-hidden="true">{requestSeconds}s elapsed</span></div>
        </div>}
        {creationError && <div role="alert" className="creation-failure">
          <strong>Creation couldn’t finish</strong>
          <p>{creationError}</p>
          <span>Your image and idea are kept.</span>
        </div>}
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
        {!connection?.configured && (
          <button
            className="text-button creation-connection-action"
            onClick={() => {
              setSettingsReturn("create");
              setDialog("settings");
            }}
          >
            {connectionError ? "Check AI connection" : "Set up AI connection"}
            <ChevronRight size={13} />
          </button>
        )}
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

  if (libraryLoading) return <main className="studio-loading" role="status">Opening your studio…</main>;
  return (
    <div className={`app-shell studio-v2 ${focusedPlay ? "play-focused" : ""} ${world.source === "example" ? "showing-example" : ""}`}>
      <input
        ref={file}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        hidden
        onChange={upload}
      />
      <header className="topbar">
        <a className="brand" href="#studio" aria-label="Doodlume studio">
          <span>
            doodlume<span className="brand-dot">.</span>
          </span>
        </a>
        <nav aria-label="Main navigation">
          <button onClick={() => setDialog("worlds")}>
            My worlds <span className="nav-count">{saved.length}</span>
          </button>
        </nav>
        <div className="top-actions">
          <button
            className="secondary-button new-world-button"
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
                Draw something. Make it playable.
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
          <section
            className={`world-panel ${focusedPlay ? "focused-play" : ""}`}
            aria-label="Your playable world"
          >
            <div className="world-heading">
              <div className="world-title-block">
                <span className="world-stage-label">{world.source === "example" ? "Example · " : ""}{modeLabel}</span>
                <label className="world-name-label">
                  <span className="sr-only">World name</span>
                  <span className="world-name-measure" aria-hidden="true">{world.name || "Untitled world"}</span>
                  <input
                    aria-label="World name"
                    title={world.name}
                    value={world.name}
                    maxLength={80}
                    onChange={(e) => {
                      allowStartupRestore.current = false;
                      setWorld((w) => ({ ...w, name: e.target.value }));
                    }}
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
              <button
                ref={worldSourceInspect}
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
                <span>Original</span>
              </button>
                <button
                  className="secondary-button edit-world-button"
                  aria-label="Edit world"
                  onClick={openEditor}
                  disabled={busy}
                >
                  <Pencil size={15} />
                  <span>{world.source === "example" ? "Make a copy" : "Edit world"}</span>
                </button>
                <button
                  className="secondary-button save-button"
                  aria-label="Save world on this device"
                  onClick={() => void save()}
                  disabled={saving}
                  aria-busy={saving}
                >
                  <Save size={18} /><span>{world.source === "example" ? "Save a copy" : "Save"}</span>
                </button>
                <button className="icon-button" aria-label="More world options" title="More" onClick={() => setDialog("world-options")}>
                  <Ellipsis size={20} />
                </button>
              </div>
            </div>
            {worldError && (
              <div className="world-error" role="alert">
                <p>{worldError}</p>
                <button
                  ref={recoveryAction}
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
              className={`game-stage ${mode === "discover" ? "discovery-stage" : mode === "roam" ? "roam-stage" : ""}`}
              ref={stage}
            >
              <div className="world-progress-row">
                <div className="world-mission">
                  <strong aria-live="polite">{missionText}</strong>
                </div>
                <div className="world-progress-counts">
                  {objective.total > 0 && (
                    <button
                      className="required-progress"
                      aria-label={`View requirements: ${objective.done} of ${objective.total} ${mode === "discover" ? "found" : "done"}`}
                      onClick={() => {
                        setEditorState(canvas.current?.snapshot() ?? latestState.current);
                        setDialog("rules");
                      }}
                    >
                      <b>
                        {objective.done}/{objective.total}
                      </b>{" "}
                      {mode === "discover" ? "found" : "done"}
                    </button>
                  )}
                  {optionalObjects.length > 0 && (
                    <span className="optional-progress">
                      {optionalDone}/{optionalObjects.length} optional
                    </span>
                  )}
                </div>
              </div>
              <div className="game-surface">
                <WorldCanvas
                  ref={canvas}
                  onError={(message) => {
                    const hadGameFocus = stage.current?.contains(
                      document.activeElement,
                    );
                    setWorldError(message);
                    setPlaying(false);
                    if (hadGameFocus)
                      requestAnimationFrame(() =>
                        recoveryAction.current?.focus({ preventScroll: true }),
                      );
                  }}
                  world={world}
                  controlsHost={gameControlsHost}
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
                  overlay={<>
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
                        <Play size={20} fill="currentColor" />
                        {metrics.exploring ? "Continue exploring" : started ? "Resume" : "Play world"}
                      </button>
                      {!started && !metrics.exploring && (
                        <span className="play-subcaption">{world.gameplay?.instructions || world.description}</span>
                      )}
                    </div>
                  )}
                {metrics.completed && !metrics.exploring && (
                  <div className="completion-overlay">
                    <div className="completion-icon">
                      <Sparkles size={25} />
                    </div>
                    <h2>World complete</h2>
                    {!objective.ready && <p>Achievement from an earlier version retained.</p>}
                    <div>
                      <button
                        className="primary-button"
                        onClick={() => continueWorld(true)}
                      >
                        Continue creating <Pencil size={16} />
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
                    </div>
                  </div>
                )}
                {busy && (
                  <div className="reading-overlay">
                    <LoaderCircle size={30} className="spin" />
                    <h3>Creating your world.</h3>
                    <button
                      className="text-button"
                      onClick={cancelInterpretation}
                    >
                      Cancel
                    </button>
                  </div>
                )}
                  </>}
                />
              </div>
            </div>
            <div className="game-toolbar">
              <div className="play-controls">
                {playing && (
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
                )}
                <button
                  className="icon-button"
                  aria-label={`Restart ${modeLabel.toLowerCase()}`}
                  title="Restart"
                  onClick={restart}
                  disabled={busy}
                >
                  <RotateCcw size={17} />
                </button>
                <span className="tool-divider" />
                <button
                  className="icon-button"
                  aria-label={muted ? "Turn sound on" : "Mute sound"}
                  title={muted ? "Turn sound on" : "Mute sound"}
                  aria-pressed={!muted}
                  onClick={() => setMuted(!muted)}
                >
                  {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
                </button>
              </div>
              <div className="game-context-controls" ref={setGameControlsHost} />
              <div className="game-view-controls">
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
                  aria-label={focusedPlay || isFullscreen ? "Back to studio" : "Focus on play"}
                  aria-pressed={focusedPlay || isFullscreen}
                  onClick={async () => {
                    const next = isFullscreen ? false : !focusedPlay;
                    if (document.fullscreenElement) await document.exitFullscreen();
                    setFocusedPlay(next);
                    requestAnimationFrame(() => {
                      framePlaySurface(next, true);
                      stage.current
                        ?.querySelector<HTMLElement>(".world-canvas")
                        ?.focus({ preventScroll: true });
                    });
                  }}
                >
                  {focusedPlay || isFullscreen ? (
                    <Minimize2 size={15} />
                  ) : (
                    <Maximize2 size={15} />
                  )}
                  <span>{focusedPlay || isFullscreen ? "Back to studio" : "Focus on play"}</span>
                </button>
                <button
                  className="icon-button play-help-button"
                  aria-label="Controls and help"
                  title="Controls and help"
                  onClick={() => setDialog("help")}
                >
                  <CircleHelp size={18} />
                </button>
                <button
                  className="icon-button"
                  aria-label={isFullscreen ? "Exit full screen" : "Full screen world"}
                  title={isFullscreen ? "Exit full screen" : "Full screen"}
                  onClick={fullscreen}
                >
                  {isFullscreen ? <Minimize2 size={17} /> : <Maximize2 size={17} />}
                </button>
              </div>
            </div>
            {mode !== "discover" && (
              <div
                className={`touch-controls ${mode === "roam" ? "roam-touch-controls" : ""}`}
                aria-label={
                  mode === "roam"
                    ? "Exploration movement controls"
                    : "Game movement controls"
                }
              >
                {mode === "roam" && (
                  <span className="roam-pointer-guide" id="roam-pointer-guide">
                    {playing
                      ? "Click or tap to move."
                      : "Play, then click or tap to move."}
                    <small>Or hold a direction.</small>
                  </span>
                )}
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
                      disabled={
                        busy ||
                        Boolean(worldError) ||
                        (metrics.completed && !metrics.exploring)
                      }
                      aria-describedby={
                        mode === "roam" ? "roam-pointer-guide" : undefined
                      }
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
                        if (!playing) start();
                        beginControl(key);
                      }}
                      onKeyDown={(event) => {
                        if (event.key !== "Enter" && event.key !== " ") return;
                        event.preventDefault();
                        event.stopPropagation();
                        if (!playing) {
                          setStarted(true);
                          setPlaying(true);
                        }
                        beginControl(key);
                      }}
                      onKeyUp={(event) => {
                        if (event.key !== "Enter" && event.key !== " ") return;
                        event.preventDefault();
                        event.stopPropagation();
                        endControl(key);
                      }}
                      onBlur={() => endControl(key, true)}
                      onPointerUp={() => endControl(key)}
                      onPointerCancel={() => endControl(key, true)}
                      onLostPointerCapture={() => endControl(key, true, true)}
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
                onClick={(event) => {
                  const examples = event.currentTarget.closest("details");
                  if (examples) examples.open = false;
                  loadWorld(freshExample(example.id));
                  requestAnimationFrame(() => {
                    framePlaySurface(false, true);
                    stage.current?.querySelector<HTMLElement>(".world-canvas")?.focus({ preventScroll: true });
                  });
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
      {dialog === "world-options" && (
        <Modal title="World options" onClose={() => setDialog(null)} className="world-options-modal">
          <div className="world-options-list">
            <button
              className="secondary-button edit-world-button paper-update-button"
              aria-label="Update image"
              onClick={openPaper}
              disabled={busy}
            >
              <ImagePlus size={16} />
              <span>Update image</span>
            </button>
            <button
              className="secondary-button world-rules-button"
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
              <Flag size={17} /><span>Rules</span>
            </button>
            <button
              className="icon-button"
              aria-label="Undo last world edit"
              title="Undo last world edit"
              onClick={() => { undoEdit(); setDialog(null); }}
              disabled={!history.length || busy}
            >
              <Undo2 size={17} /><span>Undo last edit</span>
            </button>

          </div>
          <p className="world-options-meta">{modeLabel} · Version {world.revision}{isCreativeAdaptation(world) ? " · Creative adaptation" : ""}</p>
        </Modal>
      )}
      {dialog === "create" && (
        <Modal
          title="Create a world"
          className="creation-modal"
          wide
          footer={
            <div className="creation-footer">
              <div>
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
                  className="secondary-button"
                  onClick={cancelInterpretation}
                >
                  <X size={16} /> Stop creating
                </button>
              ) : (
                <button
                  className="primary-button"
                  disabled={
                    !customSource || !source || creationIntent().length > 500
                  }
                  onClick={bringAlive}
                >
                  {creationError ? <RotateCcw size={18} /> : <WandSparkles size={18} />} {creationError ? "Try again" : "Create world"}
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
          title={draft.name}
          wide
          footer={reviewActions}
          className="world-review-modal"
          onClose={() => setDialog("create")}
        >
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
                <strong>Original image · generated gameplay</strong>

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
              <strong>Your idea</strong> {draftIntent}
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
                  x: tracedAdditions[0].x / sourcePageSize.width * 1000,
                  y: tracedAdditions[0].y / sourcePageSize.height * 1000,
                  width: tracedAdditions[0].width / sourcePageSize.width * 1000,
                  height: tracedAdditions[0].height / sourcePageSize.height * 1000,
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
                      x: mark.x / 1000 * sourcePageSize.width,
                      y: mark.y / 1000 * sourcePageSize.height,
                      width: Math.max(4, mark.width / 1000 * sourcePageSize.width),
                      height: Math.max(4, mark.height / 1000 * sourcePageSize.height),
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
          onCreate={() => openCreation()}
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
                  className={`status-dot ${lastCreation === "success" ? "connected" : lastCreation === "failed" ? "failed" : ""}`}
                />
                {connection?.configured
                  ? lastCreation === "success" ? "Last creation succeeded" : lastCreation === "failed" ? "Last creation failed" : lastCreation === "review" ? "Last creation needs review" : "Configured · not yet tested"
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
          <p className="modal-copy">{lastCreation === "failed" ? "Your creation draft is kept. Return to it to retry." : lastCreation === "review" ? "Recognized objects are kept. Return to your draft to review them." : "Connection status updates after a creation request."}</p>
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
        <Modal title={`${modeLabel} controls`} onClose={() => setDialog(null)}>
          {world.gameplay?.objectiveTitle && (
            <p className="mode-help-objective">
              {world.gameplay.objectiveTitle}
            </p>
          )}
          <dl className="mode-control-guide">
            {mode === "discover" ? (
              <>
                <div>
                  <dt>Find</dt>
                  <dd>
                    Read the current clue, then click the detail in your
                    image.
                  </dd>
                </div>
                <div>
                  <dt>Inspect</dt>
                  <dd>
                    Zoom in and drag to pan. With the image focused, + / − zoom,
                    arrow keys pan, and 0 fits the image.
                  </dd>
                </div>
                <div>
                  <dt>Keyboard</dt>
                  <dd>
                    Open Keyboard play, choose an object, then Inspect object.
                    Show hint highlights the current clue.
                  </dd>
                </div>
              </>
            ) : mode === "roam" ? (
              <>
                <div>
                  <dt>Move</dt>
                  <dd>
                    Click an open area, or hold WASD or the arrow keys.
                  </dd>
                </div>
                <div>
                  <dt>Take control</dt>
                  <dd>
                    A direction key takes over from the pointer
                    destination.
                  </dd>
                </div>
                {world.entities.some((entity) => entity.kind === "lever") && (
                  <div>
                    <dt>Interact</dt>
                    <dd>Press E near an interactive object.</dd>
                  </div>
                )}
              </>
            ) : (
              <>
                <div>
                  <dt>Move</dt>
                  <dd>← → or A / D.</dd>
                </div>
                <div>
                  <dt>Jump</dt>
                  <dd>Space, ↑ or W.</dd>
                </div>
                <div>
                  <dt>Drop down</dt>
                  <dd>↓ + Space or S + Space through a thin platform.</dd>
                </div>
                {world.entities.some((entity) => entity.kind === "lever") && (
                  <div>
                    <dt>Interact</dt>
                    <dd>Press E near a switch.</dd>
                  </div>
                )}
              </>
            )}
            <div>
              <dt>Finish</dt>
              <dd>
                {world.entities.some((entity) => entity.kind === "goal")
                  ? "Complete the required actions, then reach the destination. Other discoveries are optional."
                  : "This world is free exploration. There is no destination to reach."}
              </dd>
            </div>
          </dl>
          <p className="mode-help-save">
            Save keeps this world and your progress on this device. My worlds
            holds your saves and downloadable backups.
          </p>
          <div className="review-actions">
            <button className="primary-button" onClick={() => setDialog(null)}>
              Back to {started ? "play" : "world"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
