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
    const callbacks = useRef(props);
    callbacks.current = props;
    useImperativeHandle(
      ref,
      () => ({
        snapshot: () =>
          startupFailed.current
            ? structuredClone(callbacks.current.initial ?? emptyPlayState())
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
      let settled = false;
      let game: Phaser.Game | undefined;
      let disposed = false;
      let readyTimeout: ReturnType<typeof setTimeout> | undefined;
      startupFailed.current = false;
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
        if (!active || settled) return;
        settled = true;
        startupFailed.current = true;
        clearStartupWait();
        current.setPlaying(false);
        current.setMuted(true);
        setFailed(true);
        callbacks.current.onError?.(message);
        disposeGame();
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
      const current = new WorldScene(props.world, props.initial, {
        onUpdate: (s, m) => {
          if (active && !startupFailed.current)
            callbacks.current.onUpdate(s, m);
        },
        onMoment: (m) => {
          if (active && !startupFailed.current) callbacks.current.onMoment(m);
        },
        onError: failStartup,
        onReady: (ready) => {
          if (!active || settled) return;
          settled = true;
          clearStartupWait();
          setReady(true);
          recordWorldReady(startedAt);
          ready.setViewportWidth(
            host.current?.clientWidth ?? 900,
            callbacks.current.overview,
          );
          ready.setPlaying(active && callbacks.current.playing);
          ready.setMuted(callbacks.current.muted);
        },
      });
      scene.current = current;
      const resize = new ResizeObserver(([entry]) => {
        if (
          !active ||
          startupFailed.current ||
          entry.contentRect.width < 2 ||
          entry.contentRect.height < 2
        )
          return;
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
                preBoot: (instance) => {
                  game = instance;
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
              width: entry.contentRect.width,
              height: entry.contentRect.height,
              backgroundColor: "#f1f0df",
              transparent: false,
              antialias: true,
              physics: {
                default: "arcade",
                arcade: { gravity: { x: 0, y: 1450 }, debug: false },
              },
              scale: {
                mode: Phaser.Scale.RESIZE,
                autoCenter: Phaser.Scale.CENTER_BOTH,
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
        game.scale.resize(entry.contentRect.width, entry.contentRect.height);
        current.setViewportWidth(
          entry.contentRect.width,
          callbacks.current.overview,
        );
      });
      resize.observe(host.current!);
      return () => {
        resize.disconnect();
        active = false;
        clearStartupWait();
        disposeGame();
        scene.current = undefined;
      };
    }, [props.world.id, props.run]);
    useEffect(() => {
      if (!startupFailed.current) scene.current?.setPlaying(props.playing);
    }, [props.playing]);
    useEffect(() => {
      if (!startupFailed.current)
        scene.current?.setViewportWidth(
          host.current?.clientWidth ?? 900,
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
