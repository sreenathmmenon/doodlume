import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import Phaser from "phaser";
import {
  WorldScene,
  type WorldControls,
  type WorldTelemetry,
} from "../game/WorldScene";
import type { PlayState, WorldDefinition } from "../../shared/world";

export interface WorldCanvasHandle {
  snapshot: () => PlayState | undefined;
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
}

export const WorldCanvas = forwardRef<WorldCanvasHandle, Props>(
  function WorldCanvas(props, ref) {
    const host = useRef<HTMLDivElement>(null);
    const scene = useRef<WorldScene | undefined>(undefined);
    const callbacks = useRef(props);
    callbacks.current = props;
    useImperativeHandle(
      ref,
      () => ({
        snapshot: () => scene.current?.snapshot(),
        touch: (key, value) => {
          if (scene.current) scene.current.controls[key] = value;
        },
      }),
      [],
    );
    useEffect(() => {
      let active = true;
      const current = new WorldScene(props.world, props.initial, {
        onUpdate: (s, m) => {
          if (active) callbacks.current.onUpdate(s, m);
        },
        onMoment: (m) => {
          if (active) callbacks.current.onMoment(m);
        },
        onReady: (ready) => {
          ready.setViewportWidth(
            host.current?.clientWidth ?? 900,
            props.overview,
          );
          ready.setPlaying(active && callbacks.current.playing);
          ready.setMuted(callbacks.current.muted);
        },
      });
      scene.current = current;
      let game: Phaser.Game | undefined;
      const resize = new ResizeObserver(([entry]) => {
        if (!active || entry.contentRect.width < 2 || entry.contentRect.height < 2) return;
        // Dialog children mount before showModal gives their host a size.
        // Wait for a real layout before allocating the renderer framebuffer.
        if (!game) {
          game = new Phaser.Game({
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
            scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.CENTER_BOTH },
            scene: current,
            audio: { noAudio: true },
            render: { roundPixels: true },
          });
          return;
        }
        game.scale.resize(entry.contentRect.width, entry.contentRect.height);
        current.setViewportWidth(entry.contentRect.width, props.overview);
      });
      resize.observe(host.current!);
      return () => {
        resize.disconnect();
        active = false;
        game?.destroy(true);
        scene.current = undefined;
      };
    }, [props.world.id, props.run]);
    useEffect(() => {
      scene.current?.setPlaying(props.playing);
    }, [props.playing]);
    useEffect(() => {
      scene.current?.setMuted(props.muted);
    }, [props.muted]);
    return (
      <div
        ref={host}
        className="world-canvas"
        aria-label="Playable drawing world. Use arrow keys or A and D to move, Space to jump, and E near a lever."
        role="application"
        tabIndex={0}
        onPointerDown={(event) => event.currentTarget.focus({ preventScroll: true })}
      />
    );
  },
);
