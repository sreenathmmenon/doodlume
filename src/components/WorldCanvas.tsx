import { createPortal } from "react-dom";
import {
  forwardRef,
  type ReactNode,
  useEffect,
  useImperativeHandle,
  useRef,
  useId,
  useMemo,
  useState,
} from "react";
import Phaser from "phaser";
import { Undo2 } from "lucide-react";
import {
  WorldScene,
  type WorldControls,
  type WorldTelemetry,
} from "../game/WorldScene";
import {
  emptyPlayState,
  getRetryCheckpoint,
  type PlayState,
  type WorldDefinition,
  movementMode,
} from "../../shared/world";
import "./world-canvas-controls.css";
import { objectName } from "../lib/object-name";
import { activeInteractionSource, interactionState } from "../../shared/interactions";
import { nextInteractionHint } from "../lib/interaction-guide";
import { canSelectInteractionSource, inspectInteractionTarget, incompatibleTargetReason } from "../../shared/interaction-preview";
import {
  diagnosticsEnabled,
  recordGameCreated,
  recordGameDestroyed,
  recordRenderedFrame,
  recordTileSurfaces,
  recordWorldReady,
} from "../lib/runtime-diagnostics";

const quantityLabel = new Intl.NumberFormat(undefined, { maximumSignificantDigits: 6 });

export interface WorldCanvasHandle {
  snapshot: () => PlayState | undefined;
  explore: () => PlayState | undefined;
  touch: (key: keyof WorldControls, value: boolean) => void;
  selectDiscovery: (entityId: string) => boolean;
  interactWithObject: (entityId: string, actionId?: string) => boolean;
  dropHeldObject: () => void;
  interactAt: (point: { x: number; y: number }) => boolean;
  dismissObjectChoices: () => boolean;
}
interface Props {
  overlay?: ReactNode;
  controlsHost?: HTMLElement | null;
  world: WorldDefinition;
  initial?: PlayState;
  playing: boolean;
  muted: boolean;
  run: number;
  overview?: boolean;
  onUpdate: (state: PlayState, metrics: WorldTelemetry) => void;
  onMoment: (message: string) => void;
  onError?: (message: string) => void;
}

export const WorldCanvas = forwardRef<WorldCanvasHandle, Props>(
  function WorldCanvas(props, ref) {
    const host = useRef<HTMLDivElement>(null);
    const discoveryChoice = useRef<HTMLSelectElement>(null);
    const [ready, setReady] = useState(false);
    const [failed, setFailed] = useState(false);
    const [openingSlow, setOpeningSlow] = useState(false);
    const canvasInstructions = useId();
    const objectPreviewId = useId();
    const [discoveryProgress, setDiscoveryProgress] = useState(
      props.initial ?? emptyPlayState(),
    );
    const [selectedDiscovery, setSelectedDiscovery] = useState("");
    const [selectedObjectAction, setSelectedObjectAction] = useState("");
    const [objectControlsFocused, setObjectControlsFocused] = useState(false);
    const [hintOpen, setHintOpen] = useState(false);
    const [undoCount, setUndoCount] = useState(0);
    const [pendingObjectMotion, setPendingObjectMotion] = useState(false);
    const [localRun, setLocalRun] = useState(0);
    const undoHistory = useRef<{ scope: string; states: PlayState[] }>({ scope: "", states: [] });
    const undoRestore = useRef<{ scope: string; state: PlayState } | undefined>(undefined);
    const mode = movementMode(props.world);
    const scene = useRef<WorldScene | undefined>(undefined);
    const startupFailed = useRef(false);
    const rendered = useRef(false);
    const recovery = useRef<
      | {
          worldId: string;
          revision: number;
          initial: PlayState | undefined;
          state: PlayState;
        }
      | undefined
    >(undefined);
    const callbacks = useRef(props);
    callbacks.current = props;
    useImperativeHandle(
      ref,
      () => ({
        selectDiscovery: (entityId) =>
          scene.current?.selectDiscovery(entityId) ?? false,
        interactWithObject: (entityId, actionId) => scene.current?.interactWithObject(entityId, actionId) ?? false,
        dropHeldObject: () => scene.current?.dropHeldObject(),
        interactAt: (point) => scene.current?.interactAt(point) ?? false,
        dismissObjectChoices: () => scene.current?.dismissObjectChoices() ?? false,
        snapshot: () =>
          startupFailed.current
            ? structuredClone(
                recovery.current?.state ??
                  callbacks.current.initial ??
                  emptyPlayState(),
              )
            : scene.current?.snapshot(),
        explore: () =>
          startupFailed.current
            ? undefined
            : scene.current?.continueExploring(),
        touch: (key, value) => {
          if (scene.current && !startupFailed.current)
            scene.current.controls[key] = value;
        },
      }),
      [],
    );
    useEffect(() => {
      let active = true;
      let sceneReady = false;
      let game: Phaser.Game | undefined;
      let disposed = false;
      let canvas: HTMLCanvasElement | undefined;
      let width = 0,
        height = 0;
      let readyTimeout: ReturnType<typeof setTimeout> | undefined;
      let openingFeedback: ReturnType<typeof setTimeout> | undefined;
      startupFailed.current = false;
      rendered.current = false;
      const scope = JSON.stringify([props.world.id, props.world.revision, props.run]);
      if (undoHistory.current.scope !== scope) {
        undoHistory.current = { scope, states: [] };
        setUndoCount(0);
      }
      const restored = undoRestore.current?.scope === scope ? undoRestore.current.state : undefined;
      undoRestore.current = undefined;
      setPendingObjectMotion(false);
      // Retry retains the failed run. A new world or an explicit Replay supplies
      // a different initial state and must never inherit a recovery snapshot.
      const initial = restored ?? (
        recovery.current?.worldId === props.world.id &&
        recovery.current.revision === props.world.revision &&
        recovery.current.initial === props.initial
          ? recovery.current.state
          : props.initial);
      recovery.current = undefined;
      let lastState = structuredClone(initial ?? emptyPlayState());
      setDiscoveryProgress(lastState);
      setSelectedDiscovery("");
      setSelectedObjectAction("");
      setHintOpen(false);
      function clearStartupWait() {
        clearTimeout(readyTimeout);
        clearTimeout(openingFeedback);
        window.removeEventListener("error", startupException);
      }
      function disposeGame() {
        if (!game || disposed) return;
        disposed = true;
        game.destroy(true);
        // destroy is processed on the next game step, including a suspended tab
        // or a constructor failure before the normal game loop starts.
        if (!game.loop.started) game.loop.start(game.step.bind(game));
        else if (!game.loop.running) game.loop.wake();
      }
      function failStartup(message: string) {
        if (!active || startupFailed.current) return;
        try {
          lastState = current.snapshot();
        } catch {
          /* Keep the last valid update. */
        }
        recovery.current = {
          worldId: props.world.id,
          revision: props.world.revision,
          initial: props.initial,
          state: structuredClone(lastState),
        };
        startupFailed.current = true;
        rendered.current = false;
        clearStartupWait();
        current.setPlaying(false);
        current.setMuted(true);
        setReady(false);
        setFailed(true);
        callbacks.current.onError?.(message);
        disposeGame();
      }
      function contextLost(event: Event) {
        event.preventDefault();
        failStartup(
          "The game display stopped. Your source, world and progress are kept. Retry artwork to reopen it.",
        );
      }
      function startupException(event: ErrorEvent) {
        const origin = `${event.filename} ${event.error?.stack ?? ""}`;
        if (/phaser|WorldScene|WorldCanvas|SVGFile/i.test(origin))
          failStartup(
            "Your artwork could not be opened. Your source, world and progress are kept. Retry artwork or open a backup.",
          );
      }
      setReady(false);
      setFailed(false);
      setOpeningSlow(false);
      const startedAt = performance.now();
      const current = new WorldScene(props.world, initial, {
        onBeforeObjectAction: state => {
          if (!active || startupFailed.current || undoHistory.current.scope !== scope) return;
          undoHistory.current.states.push(state);
          if (undoHistory.current.states.length > 16) undoHistory.current.states.shift();
          setUndoCount(undoHistory.current.states.length);
        },
        onUpdate: (s, m) => {
          if (active && !startupFailed.current) {
            lastState = s;
            setPendingObjectMotion(Boolean(m.pendingObjectMotion));
            if (movementMode(callbacks.current.world) === "discover" || callbacks.current.world.interactions)
              setDiscoveryProgress(s);
            callbacks.current.onUpdate(s, m);
          }
        },
        onMoment: (m) => {
          if (active && !startupFailed.current) callbacks.current.onMoment(m);
        },
        onError: failStartup,
        onReady: (ready) => {
          if (!active || startupFailed.current) return;
          sceneReady = true;
          ready.setViewportWidth(width, callbacks.current.overview);
          ready.setMuted(callbacks.current.muted);
        },
      });
      scene.current = current;
      const resize = new ResizeObserver(([entry]) => {
        const nextWidth = Math.floor(entry.contentRect.width);
        const nextHeight = Math.floor(entry.contentRect.height);
        if (
          !active ||
          startupFailed.current ||
          !Number.isFinite(nextWidth) ||
          !Number.isFinite(nextHeight) ||
          nextWidth < 2 ||
          nextHeight < 2 ||
          (nextWidth === width && nextHeight === height)
        )
          return;
        width = nextWidth;
        height = nextHeight;
        // Dialog children mount before showModal gives their host a size.
        // Wait for a real layout before allocating the renderer framebuffer.
        if (!game) {
          window.addEventListener("error", startupException);
          openingFeedback = setTimeout(() => {
            if (active && !rendered.current && !startupFailed.current)
              setOpeningSlow(true);
          }, 3_000);
          readyTimeout = setTimeout(
            () =>
              failStartup(
                "Opening your artwork took too long. Your source, world and progress are kept. Retry artwork or open a backup.",
              ),
            15_000,
          );
          try {
            game = new Phaser.Game({
              callbacks: {
                postBoot: (instance) => {
                  canvas = instance.canvas;
                  canvas.addEventListener("webglcontextlost", contextLost);
                },
                preBoot: (instance) => {
                  game = instance;
                  // Catch this renderer's own loop, including ScaleManager
                  // refresh failures after loading. A global startup listener
                  // cannot safely attribute errors from an older game instance.
                  const step = instance.step;
                  instance.step = (time, delta) => {
                    try {
                      step.call(instance, time, delta);
                    } catch {
                      failStartup(
                        "The game display stopped. Your source, world and progress are kept. Retry artwork to reopen it.",
                      );
                    }
                  };
                  instance.events.on(Phaser.Core.Events.POST_RENDER, () => {
                    if (
                      !active ||
                      startupFailed.current ||
                      !sceneReady ||
                      rendered.current
                    )
                      return;
                    rendered.current = true;
                    clearStartupWait();
                    setReady(true);
                    recordWorldReady(startedAt);
                    current.setPlaying(callbacks.current.playing);
                  });
                  if (diagnosticsEnabled) {
                    recordGameCreated();
                    instance.events.once(
                      Phaser.Core.Events.DESTROY,
                      recordGameDestroyed,
                    );
                  }
                },
              },
              type: Phaser.AUTO,
              parent: host.current!,
              width,
              height,
              backgroundColor: "#f1f0df",
              transparent: false,
              antialias: true,
              // Only the focused game owns its controls. Global listeners can
              // intercept editor typing or pre-cancel a newly mounted game's keys.
              input: { keyboard: { target: host.current! } },
              physics: {
                default: "arcade",
                arcade: { gravity: { x: 0, y: 1450 }, debug: false },
              },
              scale: {
                // One resize owner. RESIZE also measures the parent on Phaser
                // ticks and can send fractional/zero dimensions to WebGL while
                // our observer is changing the same framebuffer.
                mode: Phaser.Scale.NONE,
                autoRound: true,
                autoCenter: Phaser.Scale.NO_CENTER,
              },
              scene: current,
              audio: { noAudio: true },
              render: { roundPixels: true },
            });
          } catch {
            failStartup(
              "The game renderer could not start. Your source, world and progress are kept. Retry artwork or open a backup.",
            );
            return;
          }
          if (startupFailed.current) {
            disposeGame();
            return;
          }
          if (diagnosticsEnabled) {
            let frames = 0;
            game.events.on(Phaser.Core.Events.POST_RENDER, () => {
              recordRenderedFrame(callbacks.current.playing);
              if (frames++ % 120 === 0)
                recordTileSurfaces(
                  current.children.list
                    .filter((node) => node.type === "TileSprite")
                    .map((node) => {
                      const tile = node as Phaser.GameObjects.TileSprite;
                      return {
                        width: tile.canvas?.width ?? 0,
                        height: tile.canvas?.height ?? 0,
                      };
                    }),
                );
            });
          }
          return;
        }
        try {
          game.scale.resize(width, height);
          if (sceneReady)
            current.setViewportWidth(width, callbacks.current.overview);
        } catch {
          failStartup(
            "The game display could not resize. Your source, world and progress are kept. Retry artwork to reopen it.",
          );
        }
      });
      resize.observe(host.current!);
      return () => {
        resize.disconnect();
        active = false;
        clearStartupWait();
        canvas?.removeEventListener("webglcontextlost", contextLost);
        disposeGame();
        scene.current = undefined;
      };
    }, [props.world.id, props.world.revision, props.run, localRun]);
    useEffect(() => {
      if (!startupFailed.current && rendered.current)
        scene.current?.setPlaying(props.playing);
    }, [props.playing]);
    useEffect(() => {
      if (!startupFailed.current && rendered.current)
        scene.current?.setViewportWidth(
          Math.max(2, Math.floor(host.current?.clientWidth ?? 900)),
          props.overview,
        );
    }, [props.overview]);
    useEffect(() => {
      if (!startupFailed.current) scene.current?.setMuted(props.muted);
    }, [props.muted]);
    const discoveryControls = mode === "discover" && !props.world.interactions && ready && !failed && (
          <div
            className="discovery-access"
            onPointerDown={(event) => event.stopPropagation()}
          >
            <div className="discovery-zoom" aria-label="Image magnification">
              <button
                type="button"
                aria-label="Zoom out"
                onClick={() => scene.current?.zoomDiscovery(1 / 1.4)}
              >
                −
              </button>
              <button
                type="button"
                aria-label="Zoom in"
                onClick={() => scene.current?.zoomDiscovery(1.4)}
              >
                +
              </button>
              <button
                type="button"
                onClick={() => scene.current?.resetDiscoveryView()}
              >
                Fit image
              </button>
            </div>
            <button
              className="discovery-hint"
              disabled={
                !props.playing ||
                (discoveryProgress.completed && !discoveryProgress.exploring)
              }
              onClick={() => scene.current?.revealDiscoveryHint()}
            >
              Show hint
            </button>
            <details
              className="discovery-keyboard"
              onToggle={(event) => {
                if (!event.currentTarget.open) scene.current?.focusDiscovery();
              }}
            >
              <summary>Keyboard play</summary>
              <div className="discovery-keyboard-fields">
              <label>
                <span className="discovery-keyboard-label">Choose an object in the image</span>
                <select
                  ref={discoveryChoice}
                  value={selectedDiscovery}
                  onChange={(event) => {
                    setSelectedDiscovery(event.target.value);
                    scene.current?.focusDiscovery(
                      event.target.value || undefined,
                    );
                  }}
                  onFocus={() =>
                    scene.current?.focusDiscovery(
                      selectedDiscovery || undefined,
                    )
                  }
                  onBlur={() => scene.current?.focusDiscovery()}
                >
                  <option value="">Choose an object…</option>
                  {props.world.entities
                    .filter((entity) =>
                      ["coin", "lever", "goal"].includes(entity.kind),
                    )
                    .map((entity) => (
                      <option
                        key={entity.id}
                        value={entity.id}
                        disabled={
                          discoveryProgress.collected.includes(entity.id) ||
                          discoveryProgress.activated.includes(entity.id)
                        }
                      >
                        {objectName(props.world, entity.id, 70)}
                      </option>
                    ))}
                </select>
              </label>
              <button
                disabled={
                  !props.playing ||
                  !selectedDiscovery ||
                  (discoveryProgress.completed && !discoveryProgress.exploring)
                }
                onClick={() => {
                  if (scene.current?.selectDiscovery(selectedDiscovery)) {
                    setSelectedDiscovery("");
                    scene.current?.focusDiscovery();
                    discoveryChoice.current?.focus({ preventScroll: true });
                  }
                }}
              >
                Inspect object
              </button>
              </div>
            </details>
          </div>
        );
    const interactionProgress = interactionState(props.world, discoveryProgress);
    const activeSourceId = activeInteractionSource(interactionProgress);
    const sourceObject = props.world.entities.find(entity => entity.id === activeSourceId);
    const sourceResource = props.world.interactions?.objects.find(object => object.entityId === activeSourceId)?.resource;
    const sourceIsFixed = Boolean(interactionProgress.selectedSourceId);
    const releaseLabel = sourceIsFixed ? "Clear selection" : "Put back";
    const selectedObject = props.world.interactions?.objects.find(object => object.entityId === selectedDiscovery);
    const canSelectSource = canSelectInteractionSource(props.world, discoveryProgress, selectedDiscovery, interactionProgress);
    // Frame reports update position frequently. Re-plan an open hint only when
    // actual progress changes; revealing it is deliberately opt-in.
    const progressKey = JSON.stringify([discoveryProgress.interactions, discoveryProgress.collected, discoveryProgress.activated, discoveryProgress.completed, discoveryProgress.exploring]);
    const targetPreviews = useMemo(() => selectedDiscovery ? inspectInteractionTarget(props.world, discoveryProgress, selectedDiscovery) : [],
      [props.world, progressKey, selectedDiscovery]);
    const selectedPreview = targetPreviews.length === 1 ? targetPreviews[0] : targetPreviews.find(preview => preview.id === selectedObjectAction);
    useEffect(() => {
      scene.current?.previewObjectAction(ready && props.playing && !pendingObjectMotion && objectControlsFocused && selectedPreview?.available ? selectedPreview.id : undefined);
      return () => scene.current?.previewObjectAction(undefined);
    }, [ready, props.playing, pendingObjectMotion, objectControlsFocused, selectedPreview?.id, selectedPreview?.available]);
    const incompatibleReason = selectedDiscovery ? incompatibleTargetReason(props.world, discoveryProgress, selectedDiscovery) : undefined;
    const nextHint = useMemo(() => hintOpen ? nextInteractionHint(props.world, discoveryProgress) : undefined,
      [hintOpen, props.world, progressKey]);
    const retryCheckpointKey = JSON.stringify(discoveryProgress.retryCheckpoint);
    const retryPoint = useMemo(() => getRetryCheckpoint(props.world, discoveryProgress), [props.world, progressKey, retryCheckpointKey]);
    const finished = discoveryProgress.completed && !discoveryProgress.exploring;
    function revisitChoice() {
      const scope = JSON.stringify([props.world.id, props.world.revision, props.run]);
      if (!retryPoint || !ready || failed || !props.playing || !scene.current?.canUndoObjectAction() || undoHistory.current.scope !== scope) return;
      scene.current.setPlaying(false);
      undoHistory.current.states = [];
      undoRestore.current = {scope, state: structuredClone(retryPoint)};
      setUndoCount(0); setReady(false); setLocalRun(run => run + 1);
      callbacks.current.onMoment("Back before that choice. Try another allocation.");
      host.current?.focus({preventScroll:true});
    }
    function undoLastAction() {
      const scope = JSON.stringify([props.world.id, props.world.revision, props.run]);
      if (!ready || failed || !props.playing || !scene.current?.canUndoObjectAction() || undoHistory.current.scope !== scope) return;
      const state = undoHistory.current.states.pop();
      if (!state) return;
      // Rebuild from the complete state so gates, moving artwork, attachments,
      // completion readiness and effects all agree with the restored receipts.
      scene.current.setPlaying(false);
      undoRestore.current = { scope, state };
      setUndoCount(undoHistory.current.states.length);
      setReady(false);
      setLocalRun(run => run + 1);
      callbacks.current.onMoment("Last action undone.");
      host.current?.focus({ preventScroll: true });
    }
    const objectControls = props.world.interactions && ready && !failed && !finished && (
      <div className="object-play-tools">
        <div className="object-play-strip">
          {sourceObject && <div className="carried-object" role="status">
            {!sourceIsFixed && sourceObject.art && <img src={sourceObject.art} alt="" />}
            <span><small>{sourceIsFixed ? "Selected" : "Holding"}</small><strong>{objectName(props.world, sourceObject.id, 42)}</strong></span>
            {sourceResource && <span className="carried-quantity" aria-label={`${quantityLabel.format(interactionProgress.quantities[sourceObject.id])} of ${quantityLabel.format(sourceResource.capacity)} remaining`}>{quantityLabel.format(interactionProgress.quantities[sourceObject.id])}/{quantityLabel.format(sourceResource.capacity)}</span>}
            <button type="button" disabled={!props.playing || finished} onClick={() => { scene.current?.dropHeldObject(); host.current?.focus({ preventScroll: true }); }} aria-label={`${releaseLabel} ${objectName(props.world, sourceObject.id, 42)}`} title={`${releaseLabel} (Q)`}>{releaseLabel}</button>
          </div>}
          {!finished && <button type="button" className="object-hint-toggle" disabled={!props.playing} aria-expanded={hintOpen} onClick={() => setHintOpen(open => !open)}>{hintOpen ? "Hide hint" : "Need a hint?"}</button>}
          {undoCount > 0 && <button type="button" className="discovery-hint" aria-label="Undo last action" disabled={!props.playing || finished || pendingObjectMotion} onClick={undoLastAction}><Undo2 size={14} aria-hidden="true" /> Undo</button>}
          {!undoCount && retryPoint && !finished && <button type="button" className="discovery-hint" disabled={!props.playing || pendingObjectMotion} onClick={revisitChoice}><Undo2 size={14} aria-hidden="true" /> Revisit choice</button>}
      <details className="object-keyboard-play"
        onToggle={event => { if (!event.currentTarget.open) setObjectControlsFocused(false); }}
        onFocusCapture={() => setObjectControlsFocused(true)}
        onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setObjectControlsFocused(false); }}>
        <summary>Object controls</summary>
        <div>
          <label>Choose an object
            <select aria-label="Choose interactive object" aria-describedby={selectedPreview || incompatibleReason ? objectPreviewId : undefined} value={selectedDiscovery} onChange={event => { setSelectedDiscovery(event.target.value); setSelectedObjectAction(""); if (event.target.value) scene.current?.revealObjectHint(event.target.value); }}>
              <option value="">Choose an object…</option>
              {props.world.interactions.objects.map(object => <option key={object.entityId} value={object.entityId}>{objectName(props.world, object.entityId, 70)}</option>)}
            </select>
          </label>
          {targetPreviews.length > 1 && <label>Choose an action
            <select aria-label="Choose object action" aria-describedby={selectedPreview ? objectPreviewId : undefined} value={selectedPreview?.id ?? ""} onChange={event => setSelectedObjectAction(event.target.value)}>
              <option value="">Choose an action…</option>
              {targetPreviews.map(action => <option key={action.id} value={action.id}>{action.label}{action.available ? "" : " · unavailable"}</option>)}
            </select>
          </label>}
          {selectedPreview && <p className="object-action-preview" id={objectPreviewId}>{selectedPreview.available ? selectedPreview.consequence : selectedPreview.reason}</p>}
          {!selectedPreview && incompatibleReason && <p className="object-action-preview" id={objectPreviewId}>{incompatibleReason}</p>}
          <button aria-describedby={selectedPreview || incompatibleReason ? objectPreviewId : undefined} disabled={!props.playing || !selectedDiscovery || Boolean(incompatibleReason) || (targetPreviews.length > 1 && !selectedPreview) || (selectedPreview && !selectedPreview.available) || finished} onClick={() => scene.current?.interactWithObject(selectedDiscovery, selectedPreview?.id)}>{selectedPreview?.label ?? (canSelectSource ? `${selectedObject?.usableInPlace ? "Select" : "Take"} ${objectName(props.world, selectedDiscovery, 30)}` : "Inspect object")}</button>
          {canSelectSource && selectedObject?.usableInPlace && targetPreviews.length > 0 && <button disabled={!props.playing} onClick={() => scene.current?.selectFixedSource(selectedDiscovery)}>Select as source</button>}
          <button disabled={!props.playing || !activeSourceId} onClick={() => scene.current?.dropHeldObject()}>{releaseLabel}</button>
        </div>
      </details>
        </div>
        {hintOpen && !finished && <div className="object-next-hint" role="status">
          <span>{nextHint?.text ?? "Inspect an object to see what it needs."}</span>
          {nextHint?.recovery && retryPoint && undoCount > 0 ? <button type="button" disabled={!props.playing || pendingObjectMotion} onClick={revisitChoice}>Revisit choice</button> : nextHint && !nextHint.recovery && <button type="button" disabled={!props.playing} onClick={() => { scene.current?.revealObjectHint(nextHint.entityId); host.current?.focus({ preventScroll: true }); }}>Show me</button>}
        </div>}
      </div>
    );
    return (
      <div className="world-canvas-shell">
        <div
          ref={host}
          className="world-canvas"
          data-ready={ready}
          aria-busy={!ready && !failed}
          aria-label={
            props.world.interactions
                ? "Interactive world. Select a source, then its target. E uses a nearby object; Q releases your selection."
              : mode === "discover"
              ? "Discovery game. Find the object described by each clue in the original image. Tap it, or use Keyboard play."
              : mode === "roam"
                ? "Exploration game. Start play, then click or tap to move, or use arrow keys or W A S D. E interacts with nearby objects."
                : "Playable drawing world. Use arrow keys or A and D to move, Space to jump, Down and Space to drop through a thin platform, and E near a lever."
          }
          role="application"
          aria-describedby={
            mode === "discover" ? canvasInstructions : undefined
          }
          tabIndex={0}
          onKeyDown={(event) => {
            if (
              mode !== "discover" ||
              event.target !== event.currentTarget ||
              !ready ||
              failed
            )
              return;
            const directions: Record<string, [number, number]> = {
              ArrowLeft: [-60, 0],
              ArrowRight: [60, 0],
              ArrowUp: [0, -60],
              ArrowDown: [0, 60],
            };
            const direction = directions[event.key];
            if (direction) scene.current?.panDiscovery(...direction);
            else if (event.key === "+" || event.key === "=")
              scene.current?.zoomDiscovery(1.4);
            else if (event.key === "-") scene.current?.zoomDiscovery(1 / 1.4);
            else if (event.key === "0") scene.current?.resetDiscoveryView();
            else return;
            event.preventDefault();
            event.stopPropagation();
          }}
          onPointerDown={(event) =>
            event.currentTarget.focus({ preventScroll: true })
          }
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null))
              scene.current?.releaseControls();
          }}
        >
          {mode === "discover" && (
            <span id={canvasInstructions} className="sr-only">
              Plus and minus zoom the image, arrow keys pan, and zero fits the
              image. Object controls or Keyboard play offer an object selector.
            </span>
          )}
          {failed && (
            <div className="world-display-paused">
              <span>Display paused.</span>
              <small>Your source and world are kept.</small>
            </div>
          )}
          {!ready && !failed && (
            <span className="world-loading" role="status">
              <span className="world-loading-copy">
                <span>Opening your artwork…</span>
                {openingSlow && (
                  <small>
                    Still opening. Your world and progress are kept.
                  </small>
                )}
              </span>
            </span>
          )}
          {props.overlay}
        </div>
        {props.controlsHost ? createPortal(<>{discoveryControls}{objectControls}</>, props.controlsHost) : <>{discoveryControls}{objectControls}</>}
      </div>
    );
  },
);
