import { createPortal } from "react-dom";
import {
  forwardRef,
  type ReactNode,
  useEffect,
  useImperativeHandle,
  useRef,
  useId,
  useState,
} from "react";
import Phaser from "phaser";
import {
  WorldScene,
  type WorldControls,
  type WorldTelemetry,
} from "../game/WorldScene";
import {
  emptyPlayState,
  type PlayState,
  type WorldDefinition,
  movementMode,
} from "../../shared/world";
import "./world-canvas-controls.css";
import { objectName } from "../lib/object-name";
import {
  diagnosticsEnabled,
  recordGameCreated,
  recordGameDestroyed,
  recordRenderedFrame,
  recordTileSurfaces,
  recordWorldReady,
} from "../lib/runtime-diagnostics";

export interface WorldCanvasHandle {
  snapshot: () => PlayState | undefined;
  explore: () => PlayState | undefined;
  touch: (key: keyof WorldControls, value: boolean) => void;
  selectDiscovery: (entityId: string) => boolean;
  interactAt: (point: { x: number; y: number }) => boolean;
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
    const [discoveryProgress, setDiscoveryProgress] = useState(
      props.initial ?? emptyPlayState(),
    );
    const [selectedDiscovery, setSelectedDiscovery] = useState("");
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
        interactAt: (point) => scene.current?.interactAt(point) ?? false,
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
      // Retry retains the failed run. A new world or an explicit Replay supplies
      // a different initial state and must never inherit a recovery snapshot.
      const initial =
        recovery.current?.worldId === props.world.id &&
        recovery.current.revision === props.world.revision &&
        recovery.current.initial === props.initial
          ? recovery.current.state
          : props.initial;
      recovery.current = undefined;
      let lastState = structuredClone(initial ?? emptyPlayState());
      setDiscoveryProgress(lastState);
      setSelectedDiscovery("");
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
        onUpdate: (s, m) => {
          if (active && !startupFailed.current) {
            lastState = s;
            if (movementMode(callbacks.current.world) === "discover")
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
    }, [props.world.id, props.run]);
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
    const discoveryControls = mode === "discover" && ready && !failed && (
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
                onClick={() => scene.current?.resetDiscoveryView()}
              >
                Fit image
              </button>
              <button
                type="button"
                aria-label="Zoom in"
                onClick={() => scene.current?.zoomDiscovery(1.4)}
              >
                +
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
                Choose an object in the image
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
    return (
      <div className="world-canvas-shell">
        <div
          ref={host}
          className="world-canvas"
          data-ready={ready}
          aria-busy={!ready && !failed}
          aria-label={
            mode === "discover"
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
        >
          {mode === "discover" && (
            <span id={canvasInstructions} className="sr-only">
              Plus and minus zoom the image, arrow keys pan, and zero fits the
              image. Keyboard play offers an object selector.
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
        {props.controlsHost ? createPortal(discoveryControls, props.controlsHost) : discoveryControls}
      </div>
    );
  },
);
