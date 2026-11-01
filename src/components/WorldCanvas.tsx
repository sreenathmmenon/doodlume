import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
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
} from "../../shared/world";
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
}
interface Props {
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
    const [ready, setReady] = useState(false);
    const [failed, setFailed] = useState(false);
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
      function clearStartupWait() {
        clearTimeout(readyTimeout);
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
      const startedAt = performance.now();
      const current = new WorldScene(props.world, initial, {
        onUpdate: (s, m) => {
          if (active && !startupFailed.current) {
            lastState = s;
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
      if (!startupFailed.current)
        scene.current?.setViewportWidth(
          Math.max(2, Math.floor(host.current?.clientWidth ?? 900)),
          props.overview,
        );
    }, [props.overview]);
    useEffect(() => {
      if (!startupFailed.current) scene.current?.setMuted(props.muted);
    }, [props.muted]);
    return (
      <div
        ref={host}
        className="world-canvas"
        data-ready={ready}
        aria-busy={!ready && !failed}
        aria-label="Playable drawing world. Use arrow keys or A and D to move, Space to jump, and E near a lever."
        role="application"
        tabIndex={0}
        onPointerDown={(event) =>
          event.currentTarget.focus({ preventScroll: true })
        }
      >
        {!ready && !failed && (
          <span className="world-loading" role="status">
            Loading your artwork…
          </span>
        )}
      </div>
    );
  },
);
