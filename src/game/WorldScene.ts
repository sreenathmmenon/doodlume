import Phaser from "phaser";
import { createAtmosphere } from "./atmosphere";
import { Soundscape } from "./soundscape";
import { artworkRasterSize } from "./artwork-raster";
import {
  sceneBoundsVisible,
  sceneView,
  type SceneRect,
} from "./scene-visibility";
import { terrainTiles } from "./terrain-tiles";
import {
  emptyPlayState,
  goalProgress,
  type PlayState,
  type WorldDefinition,
  type WorldEntity,
} from "../../shared/world";

export interface WorldTelemetry {
  collected: number;
  total: number;
  completed: boolean;
  exploring: boolean;
  nearLever: boolean;
  goalHint: string;
  requiredDone: number;
  requiredTotal: number;
  playerX: number;
  playerY: number;
}
export interface WorldControls {
  left: boolean;
  right: boolean;
  jump: boolean;
  interact: boolean;
}
interface Hooks {
  onUpdate: (state: PlayState, telemetry: WorldTelemetry) => void;
  onMoment: (message: string) => void;
  onReady: (scene: WorldScene) => void;
  onError?: (message: string) => void;
}
const palettes = {
  grove: {
    sky: "#f2f0df",
    haze: "#e8e6dd",
    far: "#d8decb",
    middle: "#b9c7ad",
    near: "#8fa989",
    land: "#293e38",
    edge: "#a7bc83",
    leaf: "#a8bb8f",
    ink: "#62664e",
  },
  moon: {
    sky: "#ece9f4",
    haze: "#e6e0ef",
    far: "#d3cde2",
    middle: "#b6b1d1",
    near: "#9997bc",
    land: "#343852",
    edge: "#aaa5d0",
    leaf: "#b7afd0",
    ink: "#68617b",
  },
  sunset: {
    sky: "#faecd9",
    haze: "#f2dfd2",
    far: "#ead5bc",
    middle: "#d7bca4",
    near: "#b9907e",
    land: "#654651",
    edge: "#d7ad85",
    leaf: "#d6b18b",
    ink: "#7b6256",
  },
};

export class WorldScene extends Phaser.Scene {
  private definition: WorldDefinition;
  private hooks: Hooks;
  private initial: PlayState;
  private player!: Phaser.Physics.Arcade.Sprite;
  private shadow!: Phaser.GameObjects.Ellipse;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private state = emptyPlayState();
  private gates = new Map<
    string,
    { collider: Phaser.GameObjects.Zone; art: Phaser.GameObjects.Container }
  >();
  private levers = new Map<
    string,
    {
      entity: WorldEntity;
      handle: Phaser.GameObjects.Line;
      knob: Phaser.GameObjects.Arc;
      originalArt?: Phaser.GameObjects.Image;
    }
  >();
  private hint!: Phaser.GameObjects.Text;
  private lastGrounded = -1000;
  private jumpQueued = -1000;
  private lastReport = 0;
  private lastGoalNotice = { message: "", at: -10000 };
  private previousTouchJump = false;
  private previousTouchInteract = false;
  private spawn = { x: 0, y: 0 };
  private isPlaying = false;
  private overview = false;
  private artworkFailed = false;
  private muted = true;
  private soundtrack: Soundscape;
  private heroArt!: Phaser.GameObjects.Image;
  private heroHalo!: Phaser.GameObjects.Arc;
  private updateAtmosphere = () => {};
  private staticGraphics: {
    graphic: Phaser.GameObjects.Graphics;
    bounds: SceneRect;
  }[] = [];
  private generatedTerrainPixels = 0;
  private generatedTerrainPieces = 0;
  private heroWidth = 1;
  private heroHeight = 1;
  private reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)")
    .matches;
  private wasGrounded = false;
  private lastVerticalSpeed = 0;
  private impactUntil = 0;
  private lastStep = 0;
  private jumpHeld = false;
  private poseX = 1;
  private poseY = 1;
  private cameraTarget = new Phaser.Math.Vector2();
  controls: WorldControls = {
    left: false,
    right: false,
    jump: false,
    interact: false,
  };

  constructor(
    definition: WorldDefinition,
    initial: PlayState | undefined,
    hooks: Hooks,
  ) {
    super({ key: "DoodlumeWorld" });
    this.definition = definition;
    this.soundtrack = new Soundscape(definition.theme);
    this.initial = initial ?? emptyPlayState();
    this.hooks = hooks;
  }

  private releaseResources() {
    this.load.off(
      Phaser.Loader.Events.FILE_LOAD_ERROR,
      this.artworkLoadError,
      this,
    );
    this.soundtrack.close();
    this.events.off(Phaser.Scenes.Events.SHUTDOWN, this.releaseResources, this);
    this.events.off(Phaser.Scenes.Events.DESTROY, this.releaseResources, this);
  }

  private failArtwork(entity: WorldEntity) {
    if (this.artworkFailed) return;
    this.artworkFailed = true;
    this.isPlaying = false;
    this.physics?.world?.pause();
    this.soundtrack.close();
    const label = entity.label?.trim() || entity.kind;
    this.hooks.onError?.(
      `The original artwork for “${label}” could not be loaded. Your source, world and progress are kept. Retry artwork or open a backup.`,
    );
  }

  private artworkLoadError(file: Phaser.Loader.File) {
    const entity = this.definition.entities.find(
      (item) => item.art && file.key === `art-${item.id}`,
    );
    if (entity) this.failArtwork(entity);
  }

  preload() {
    this.artworkFailed = false;
    this.load.on(
      Phaser.Loader.Events.FILE_LOAD_ERROR,
      this.artworkLoadError,
      this,
    );
    this.events.once(
      Phaser.Scenes.Events.SHUTDOWN,
      this.releaseResources,
      this,
    );
    this.events.once(Phaser.Scenes.Events.DESTROY, this.releaseResources, this);
    for (const e of this.definition.entities)
      if (e.art) {
        if (e.art.endsWith(".svg"))
          this.load.svg(
            `art-${e.id}`,
            e.art,
            artworkRasterSize(e.width, e.height),
          );
        else this.load.image(`art-${e.id}`, e.art);
      }
  }

  create() {
    this.staticGraphics = [];
    this.generatedTerrainPixels = 0;
    this.generatedTerrainPieces = 0;
    this.state = structuredClone(this.initial);
    const missing = this.definition.entities.find(
      (entity) => entity.art && !this.textures.exists(`art-${entity.id}`),
    );
    if (missing) this.failArtwork(missing);
    if (this.artworkFailed) {
      this.physics.world.pause();
      return;
    }
    this.physics.world.setBounds(
      0,
      -200,
      this.definition.width,
      this.definition.height + 400,
    );
    this.updateAtmosphere = createAtmosphere(
      this,
      this.definition.theme,
      this.reducedMotion,
    );
    const terrain = this.physics.add.staticGroup();
    for (const e of this.definition.entities) {
      if (e.kind === "terrain" || e.kind === "bridge") {
        const zone = this.add.zone(
          e.x + e.width / 2,
          e.y + e.height / 2,
          e.width,
          e.height,
        );
        this.physics.add.existing(zone, true);
        zone.setData("oneWay", e.height <= 40);
        terrain.add(zone);
        this.drawTerrain(e);
      } else if (e.kind === "gate") this.createGate(e);
    }
    const hero = this.definition.entities.find((e) => e.kind === "player")!;
    this.spawn = { x: hero.x + hero.width / 2, y: hero.y + hero.height / 2 };
    this.shadow = this.add
      .ellipse(this.spawn.x, 687, 57, 10, 0x41493c, 0.12)
      .setDepth(12);
    const texture = this.textures.exists(`art-${hero.id}`)
      ? `art-${hero.id}`
      : this.createFallbackHero();
    this.player = this.physics.add
      .sprite(
        this.initial.player?.x ?? this.spawn.x,
        this.initial.player?.y ?? this.spawn.y,
        texture,
      )
      .setDisplaySize(hero.width, hero.height)
      .setDepth(20);
    this.heroWidth = hero.width;
    this.heroHeight = hero.height;
    // A separate visual lets the artwork breathe without changing its collision box.
    this.player.setAlpha(0);
    this.heroHalo = this.add
      .circle(
        this.player.x,
        this.player.y,
        Math.max(hero.width, hero.height) * 0.8,
        0xf7dc9a,
        0.045,
      )
      .setDepth(18);
    this.heroArt = this.add
      .image(this.player.x, this.player.y, texture)
      .setOrigin(0.5, 1)
      .setDepth(20);
    this.heroArt.setDisplaySize(hero.width, hero.height);
    this.heroArt.setPosition(this.player.x, this.player.y + hero.height / 2);
    this.cameras.main
      .setBounds(0, 0, this.definition.width, this.definition.height)
      .setZoom(this.reducedMotion ? 1 : 1.18);
    this.cameras.main.centerOn(this.player.x, 410);
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    const frame = this.player.frame;
    body
      .setSize(frame.width * 0.66, frame.height * 0.69)
      .setOffset(frame.width * 0.17, frame.height * 0.24);
    body.setDragX(2200).setMaxVelocity(350, 1100).setCollideWorldBounds(false);
    this.physics.add.collider(
      this.player,
      terrain,
      undefined,
      (_player, surface) => {
        const platform = surface as Phaser.GameObjects.Zone;
        if (!platform.getData("oneWay")) return true;
        const body = this.player.body as Phaser.Physics.Arcade.Body;
        // Thin drawn platforms support feet from above; jumping underneath won't trap a head.
        return (
          body.velocity.y >= 0 &&
          body.prev.y + body.height <= platform.y - platform.height / 2 + 10
        );
      },
    );
    for (const gate of this.gates.values())
      this.physics.add.collider(this.player, gate.collider);
    for (const e of this.definition.entities) {
      if (e.kind === "coin") this.createCoin(e);
      if (e.kind === "lever") this.createLever(e);
      if (e.kind === "goal") this.createGoal(e);
      if (e.kind === "decoration" && e.art)
        this.add
          .image(e.x + e.width / 2, e.y + e.height / 2, `art-${e.id}`)
          .setDisplaySize(e.width, e.height)
          .setDepth(10);
    }
    this.cursors = this.input.keyboard!.createCursorKeys();
    this.keys = this.input.keyboard!.addKeys("A,D,W,E,SPACE") as Record<
      string,
      Phaser.Input.Keyboard.Key
    >;
    this.input.keyboard!.removeCapture([
      Phaser.Input.Keyboard.KeyCodes.SPACE,
      Phaser.Input.Keyboard.KeyCodes.UP,
      Phaser.Input.Keyboard.KeyCodes.DOWN,
      Phaser.Input.Keyboard.KeyCodes.LEFT,
      Phaser.Input.Keyboard.KeyCodes.RIGHT,
    ]);
    this.hint = this.add
      .text(0, 0, "E  ·  wake the gate", {
        fontFamily: "Manrope, sans-serif",
        fontSize: "20px",
        color: "#faf8f1",
        backgroundColor: "#4c5549",
        padding: { x: 16, y: 10 },
      })
      .setOrigin(0.5)
      .setDepth(30)
      .setVisible(false);
    for (const id of this.state.activated) this.openLever(id, true);
    this.setPlaying(false);
    if (
      this.initial.velocity &&
      Number.isFinite(this.initial.velocity.x) &&
      Number.isFinite(this.initial.velocity.y)
    )
      body.setVelocity(this.initial.velocity.x, this.initial.velocity.y);
    this.player.setFlipX(Boolean(this.initial.facingLeft));
    this.report();
    this.hooks.onReady(this);
  }

  private createFallbackHero(): string {
    const g = this.add.graphics();
    g.fillStyle(0xcddfb2);
    g.fillRoundedRect(3, 3, 75, 80, 27);
    g.lineStyle(3, 0x434a3f);
    g.strokeRoundedRect(3, 3, 75, 80, 27);
    g.fillStyle(0x434a3f);
    g.fillCircle(27, 35, 3);
    g.fillCircle(53, 35, 3);
    g.generateTexture("fallback-hero", 82, 90);
    g.destroy();
    return "fallback-hero";
  }

  private drawTerrain(e: WorldEntity) {
    if (e.art) {
      this.add
        .image(e.x + e.width / 2, e.y + e.height / 2, `art-${e.id}`)
        .setDisplaySize(e.width, e.height)
        .setDepth(10);
      return;
    }
    const p = palettes[this.definition.theme];
    const g = this.add.graphics().setDepth(10);
    if (e.kind === "bridge") {
      g.lineStyle(7, Phaser.Display.Color.HexStringToColor(p.ink).color, 0.9);
      g.lineBetween(e.x, e.y + 8, e.x + e.width, e.y + 8);
      for (let x = e.x + 4; x < e.x + e.width; x += 20) {
        g.fillStyle(0xc8a77c);
        g.fillRoundedRect(x, e.y + 3, 16, 28 + Math.sin(x) * 2, 3);
        g.lineStyle(1, 0x78634d, 0.5);
        g.strokeRoundedRect(x, e.y + 3, 16, 28, 3);
      }
    } else {
      g.fillStyle(Phaser.Display.Color.HexStringToColor(p.land).color);
      g.fillRoundedRect(
        e.x,
        e.y,
        e.width,
        e.height + 20,
        e.height < 40 ? 9 : 4,
      );
      g.lineStyle(
        e.height < 40 ? 5 : 7,
        Phaser.Display.Color.HexStringToColor(p.edge).color,
        0.85,
      );
      g.lineBetween(e.x + 2, e.y + 1, e.x + e.width - 2, e.y + 1);
      g.lineStyle(1, 0x99886f, 0.23);
      for (let x = e.x + 15; x < e.x + e.width - 8; x += 28)
        g.lineBetween(x, e.y + 16, x + 8, e.y + 21);
      if (e.height > 40)
        for (let x = e.x + 24; x < e.x + e.width; x += 61) {
          g.lineStyle(2, 0x7b9065, 0.75);
          g.lineBetween(x, e.y, x - 3, e.y - 11);
          g.lineBetween(x, e.y - 4, x + 5, e.y - 13);
          g.fillStyle(x % 3 ? 0xf4e2ad : 0xddb7b2);
          g.fillCircle(x + 5, e.y - 15, 3);
        }
    }
    const bounds = {
      x: e.x - 8,
      y: e.y - 24,
      width: e.width + 16,
      height: e.height + 48,
    };
    if (!this.cacheTerrain(g, e, bounds))
      // Graphics lack native width/height culling. Preserve the bounded fallback.
      this.staticGraphics.push({ graphic: g, bounds });
  }

  private cacheTerrain(
    graphic: Phaser.GameObjects.Graphics,
    entity: WorldEntity,
    bounds: SceneRect,
  ) {
    const plan = terrainTiles(
      bounds,
      8_000_000 - this.generatedTerrainPixels,
      128 - this.generatedTerrainPieces,
    );
    if (!plan) return false;
    const images: Phaser.GameObjects.Image[] = [];
    const textures: string[] = [];
    try {
      for (const [index, tile] of plan.tiles.entries()) {
        const key = `terrain-cache-${entity.id}-${index}`;
        const painter = this.make.graphics({ x: 0, y: 0 });
        try {
          // generateTexture's camera cancels the Graphics object's position;
          // its command translation therefore maps global paths into this tile.
          painter.translateCanvas(-tile.x + tile.gutter, -tile.y + tile.gutter);
          for (const command of graphic.commandBuffer)
            painter.commandBuffer.push(command);
          textures.push(key);
          painter.generateTexture(key, tile.textureWidth, tile.textureHeight);
        } finally {
          painter.destroy();
        }
        const texture = this.textures.get(key);
        texture.add(
          "core",
          0,
          tile.gutter,
          tile.gutter,
          tile.width,
          tile.height,
        );
        images.push(
          this.add.image(tile.x, tile.y, key, "core").setOrigin(0).setDepth(10),
        );
      }
    } catch {
      // A denied raster allocation keeps the original vector artwork available.
      for (const image of images) image.destroy();
      for (const key of textures)
        if (this.textures.exists(key)) this.textures.remove(key);
      return false;
    }
    this.generatedTerrainPixels += plan.pixels;
    this.generatedTerrainPieces += plan.tiles.length;
    graphic.destroy();
    return true;
  }

  private createGate(e: WorldEntity) {
    const collider = this.add.zone(
      e.x + e.width / 2,
      e.y + e.height / 2,
      e.width,
      e.height,
    );
    this.physics.add.existing(collider, true);
    const art = this.add.container(e.x, e.y).setDepth(14);
    const g = this.add.graphics();
    g.fillStyle(0xb4a0c4);
    g.fillRoundedRect(0, 0, e.width, e.height, 15);
    g.lineStyle(2, 0x75617f, 0.85);
    g.strokeRoundedRect(0, 0, e.width, e.height, 15);
    g.fillStyle(0xcbbbda);
    g.fillRoundedRect(5, 7, e.width - 10, 18, 7);
    g.lineStyle(2, 0x8f7a9c, 0.7);
    for (let y = 37; y < e.height; y += 30) g.lineBetween(2, y, e.width - 2, y);
    art.add(g);
    if (e.art) {
      g.setVisible(false);
      art.add(
        this.add
          .image(e.width / 2, e.height / 2, `art-${e.id}`)
          .setDisplaySize(e.width, e.height),
      );
    }
    this.gates.set(e.id, { collider, art });
  }

  private createCoin(e: WorldEntity) {
    if (this.state.collected.includes(e.id)) return;
    if (!this.textures.exists("collectible-light")) {
      const g = this.make.graphics({ x: 0, y: 0 });
      g.fillStyle(0xffdf93);
      g.fillCircle(20, 20, 10);
      g.lineStyle(2, 0xfff3cf);
      g.strokeCircle(20, 20, 14);
      g.generateTexture("collectible-light", 40, 40);
      g.destroy();
    }
    const halo = this.add
      .circle(
        e.x + e.width / 2,
        e.y + e.height / 2,
        Math.max(e.width, e.height) * 0.9,
        0xffdf93,
        0.07,
      )
      .setDepth(14);
    const coin = this.physics.add
      .staticSprite(
        e.x + e.width / 2,
        e.y + e.height / 2,
        e.art ? `art-${e.id}` : "collectible-light",
      )
      .setDisplaySize(e.width, e.height)
      .setDepth(15);
    (coin.body as Phaser.Physics.Arcade.StaticBody)
      .setSize(e.width, e.height)
      .updateFromGameObject();
    if (!this.reducedMotion)
      this.tweens.add({
        targets: coin,
        y: coin.y - 7,
        duration: 1100,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
      });
    this.physics.add.overlap(this.player, coin, () => {
      if (this.state.collected.includes(e.id)) return;
      this.state.collected.push(e.id);
      halo.destroy();
      this.physics.world.disable(coin);
      this.tweens.killTweensOf(coin);
      this.tweens.add({
        targets: coin,
        y: coin.y - (this.reducedMotion ? 0 : 35),
        alpha: 0,
        scale: coin.scaleX * (this.reducedMotion ? 1 : 1.5),
        duration: 300,
        onComplete: () => coin.destroy(),
      });
      this.burst(coin.x, coin.y, 0xf3da8e, 9);
      this.soundtrack.cue("collect", this.state.collected.length);
      this.ring(coin.x, coin.y, 0xffe3a3, 36);
      const reward = this.add
        .text(coin.x, coin.y - 25, "+1", {
          fontFamily: "Manrope, sans-serif",
          fontSize: "26px",
          fontStyle: "bold",
          color: "#ffe9b9",
          stroke: "#263d42",
          strokeThickness: 4,
        })
        .setOrigin(0.5)
        .setDepth(35);
      this.tweens.add({
        targets: reward,
        y: reward.y - 60,
        alpha: 0,
        duration: 850,
        onComplete: () => reward.destroy(),
      });
      this.report();
      if (
        this.state.collected.length ===
        this.definition.entities.filter((e) => e.kind === "coin").length
      )
        this.hooks.onMoment(goalProgress(this.definition, this.state).hint);
    });
  }

  private createLever(e: WorldEntity) {
    const g = this.add.graphics().setDepth(12);
    g.fillStyle(0x837b67);
    g.fillRoundedRect(e.x, e.y + e.height - 12, e.width, 12, 5);
    const handle = this.add
      .line(
        0,
        0,
        e.x + e.width / 2,
        e.y + e.height - 8,
        e.x + 8,
        e.y + 12,
        0x655b50,
        1,
      )
      .setOrigin(0)
      .setLineWidth(5)
      .setDepth(13);
    const knob = this.add
      .circle(e.x + 8, e.y + 12, 9, 0xe7c278)
      .setStrokeStyle(2, 0x85704e)
      .setDepth(14);
    const target = this.add
      .zone(e.x + e.width / 2, e.y + e.height / 2, e.width + 35, e.height + 35)
      .setInteractive({ useHandCursor: true });
    target.on("pointerup", () => {
      if (
        this.isPlaying &&
        Math.hypot(
          this.player.x - e.x - e.width / 2,
          this.player.y - e.y - e.height / 2,
        ) < 145
      )
        this.openLever(e.id);
    });
    let originalArt: Phaser.GameObjects.Image | undefined;
    if (e.art) {
      g.setVisible(false);
      handle.setVisible(false);
      knob.setVisible(false);
      originalArt = this.add
        .image(e.x + e.width / 2, e.y + e.height / 2, `art-${e.id}`)
        .setDisplaySize(e.width, e.height)
        .setDepth(13);
    }
    this.levers.set(e.id, { entity: e, handle, knob, originalArt });
  }

  private createGoal(e: WorldEntity) {
    if (e.art)
      this.add
        .image(e.x + e.width / 2, e.y + e.height / 2, `art-${e.id}`)
        .setDisplaySize(e.width, e.height)
        .setDepth(11);
    const beacon = this.add
      .ellipse(
        e.x + e.width / 2,
        e.y + e.height * 0.65,
        e.width * 1.4,
        e.height * 1.3,
        0xffe6aa,
        0.065,
      )
      .setDepth(9);
    if (!this.reducedMotion)
      this.tweens.add({
        targets: beacon,
        alpha: 0.13,
        scaleY: 1.08,
        duration: 2100,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
      });
    if (!e.art) {
      const arch = this.add.graphics().setDepth(11);
      arch.lineStyle(4, 0xffe4aa, 0.8);
      arch.strokeRoundedRect(
        e.x + e.width * 0.15,
        e.y,
        e.width * 0.7,
        e.height,
        Math.min(e.width * 0.3, 35),
      );
      arch.lineStyle(1, 0xffe4aa, 0.3);
      arch.strokeRoundedRect(
        e.x + e.width * 0.05,
        e.y - 10,
        e.width * 0.9,
        e.height + 10,
        Math.min(e.width * 0.35, 40),
      );
    }
    const zone = this.add.zone(
      e.x + e.width / 2,
      e.y + e.height / 2,
      e.width * 0.55,
      e.height,
    );
    this.physics.add.existing(zone, true);
    this.physics.add.overlap(this.player, zone, () => {
      if (!this.isPlaying || this.state.completed) return;
      const objective = goalProgress(this.definition, this.state);
      if (!objective.ready) {
        if (
          this.lastGoalNotice.message !== objective.hint ||
          this.time.now - this.lastGoalNotice.at > 4500
        ) {
          this.lastGoalNotice = { message: objective.hint, at: this.time.now };
          this.hooks.onMoment(objective.hint);
          this.report();
        }
        return;
      }
      this.state.completed = true;
      this.soundtrack.cue("finish");
      this.ring(this.player.x, this.player.y, 0xffe3a3, 160);
      this.burst(this.player.x, this.player.y - 40, 0xd7b6dc, 28);
      this.hooks.onMoment("A little adventure, made yours.");
      this.report();
    });
  }

  private openLever(id: string, instant = false) {
    const lever = this.levers.get(id);
    if (!lever || (!instant && this.state.activated.includes(id))) return;
    const gate = this.gates.get(lever.entity.targetId ?? "");
    if (!gate) return;
    if (!this.state.activated.includes(id)) this.state.activated.push(id);
    (gate.collider.body as Phaser.Physics.Arcade.StaticBody).enable = false;
    this.tweens.add({
      targets: gate.art,
      y: gate.art.y - 150,
      alpha: 0,
      duration: instant || this.reducedMotion ? 0 : 550,
      ease: "Cubic.easeIn",
    });
    const e = lever.entity;
    lever.handle.setTo(
      e.x + e.width / 2,
      e.y + e.height - 8,
      e.x + e.width - 6,
      e.y + 20,
    );
    lever.knob.setPosition(e.x + e.width - 6, e.y + 20);
    lever.originalArt?.setAngle(15);
    if (!instant) {
      this.burst(gate.art.x + 25, gate.art.y + 65, 0xc9b6db, 14);
      this.soundtrack.cue("gate");
      this.ring(gate.art.x + 25, gate.art.y + 65, 0xd4c2ff, 80);
      this.hooks.onMoment("The gate is open. A new path awaits.");
    }
    this.report();
  }

  private burst(x: number, y: number, color: number, count: number) {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    for (let i = 0; i < count; i++) {
      const dot = this.add.circle(x, y, 2 + (i % 3), color).setDepth(40);
      const angle = i * 2.399;
      this.tweens.add({
        targets: dot,
        x: x + Math.cos(angle) * (24 + i * 2),
        y: y + Math.sin(angle) * (20 + i * 1.8) - 20,
        alpha: 0,
        duration: 500 + i * 10,
        onComplete: () => dot.destroy(),
      });
    }
  }

  private ring(x: number, y: number, color: number, radius: number) {
    if (this.reducedMotion) return;
    const ring = this.add
      .circle(x, y, 8)
      .setStrokeStyle(2, color, 0.8)
      .setDepth(32);
    this.tweens.add({
      targets: ring,
      scale: radius / 8,
      alpha: 0,
      duration: 650,
      ease: "Cubic.easeOut",
      onComplete: () => ring.destroy(),
    });
  }

  private footfall(x: number, y: number, strong = false) {
    if (this.reducedMotion) return;
    for (let i = 0; i < (strong ? 7 : 2); i++) {
      const dust = this.add
        .ellipse(x, y, 9 + i * 2, 4, 0xe8ddba, 0.35)
        .setDepth(19);
      this.tweens.add({
        targets: dust,
        x: x + (i % 2 ? 1 : -1) * (12 + i * 5),
        y: y - 7 - i * 2,
        alpha: 0,
        scale: 1.8,
        duration: 360 + i * 30,
        onComplete: () => dust.destroy(),
      });
    }
  }

  setViewportWidth(width: number, overview = false) {
    this.overview = overview;
    if (!this.player) return;
    const camera = this.cameras.main;
    if (overview || this.reducedMotion) {
      camera
        .removeBounds()
        .setZoom(
          Math.min(
            camera.width / this.definition.width,
            camera.height / this.definition.height,
          ),
        );
      camera.centerOn(this.definition.width / 2, this.definition.height / 2);
      return;
    }
    camera.setZoom(
      Math.max(
        width / (width < 600 ? 720 : 1280),
        camera.height / this.definition.height,
      ),
    );
    camera.setBounds(0, 0, this.definition.width, this.definition.height);
    const target = camera.getScroll(
      this.player.x,
      this.player.y + this.heroHeight / 2 + 100 - camera.displayHeight / 2,
    );
    camera.setScroll(target.x, target.y);
  }

  setPlaying(playing: boolean) {
    if (this.artworkFailed) {
      this.isPlaying = false;
      this.physics?.world?.pause();
      this.soundtrack.close();
      return;
    }
    this.isPlaying = playing;
    this.soundtrack.setState(
      playing || (this.state.completed && !this.state.exploring),
      this.muted,
    );
    if (!this.physics?.world) return;
    playing ? this.physics.world.resume() : this.physics.world.pause();
    if (!playing) {
      for (const key of Object.keys(this.controls) as (keyof WorldControls)[])
        this.controls[key] = false;
      this.input.keyboard?.resetKeys();
      this.jumpQueued = -1000;
      this.jumpHeld = false;
      this.previousTouchJump = false;
      this.previousTouchInteract = false;
    }
    if (!playing && this.player?.body)
      (this.player.body as Phaser.Physics.Arcade.Body)
        .setAccelerationX(0)
        .setVelocityX(0);
  }
  setMuted(muted: boolean) {
    this.muted = muted;
    if (this.artworkFailed) {
      this.soundtrack.close();
      return;
    }
    this.soundtrack.setState(
      this.isPlaying || (this.state.completed && !this.state.exploring),
      muted,
    );
  }
  continueExploring(): PlayState {
    this.state.exploring = true;
    this.report();
    return this.snapshot();
  }
  snapshot(): PlayState {
    if (!this.player) return structuredClone(this.initial);
    return {
      ...structuredClone(this.state),
      player: this.player ? { x: this.player.x, y: this.player.y } : null,
      velocity: this.player?.body
        ? {
            x: (this.player.body as Phaser.Physics.Arcade.Body).velocity.x,
            y: (this.player.body as Phaser.Physics.Arcade.Body).velocity.y,
          }
        : { x: 0, y: 0 },
      facingLeft: this.player?.flipX ?? false,
    };
  }
  private nearestLever() {
    return [...this.levers.values()]
      .filter((l) => !this.state.activated.includes(l.entity.id))
      .map((l) => ({
        lever: l,
        distance: Math.hypot(
          this.player.x - l.entity.x - l.entity.width / 2,
          this.player.y - l.entity.y - l.entity.height / 2,
        ),
      }))
      .filter((l) => l.distance < 145)
      .sort((a, b) => a.distance - b.distance)[0]?.lever;
  }
  private report() {
    if (!this.player) return;
    const state = this.snapshot();
    const nearby = Boolean(this.nearestLever());
    const objective = goalProgress(this.definition, state);
    this.hooks.onUpdate(state, {
      collected: state.collected.length,
      total: this.definition.entities.filter((e) => e.kind === "coin").length,
      completed: state.completed,
      exploring: Boolean(state.exploring),
      nearLever: nearby,
      goalHint: objective.hint,
      requiredDone: objective.done,
      requiredTotal: objective.total,
      playerX: this.player.x,
      playerY: this.player.y,
    });
  }

  update(time: number, delta: number) {
    if (!this.player || !this.cursors) return;
    this.updateAtmosphere();
    const view = sceneView(this.cameras.main);
    for (const { graphic, bounds } of this.staticGraphics)
      graphic.setVisible(sceneBoundsVisible(bounds, view));
    if (!this.isPlaying) return;
    this.soundtrack.tick(time);
    const typing = document.activeElement?.matches(
      'input, textarea, [contenteditable="true"]',
    );
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    if (typing) {
      body.setAccelerationX(0);
      return;
    }
    const grounded = body.blocked.down || body.touching.down;
    if (grounded) this.lastGrounded = time;
    if (grounded && !this.wasGrounded && this.lastVerticalSpeed > 150) {
      this.impactUntil = time + 180;
      this.footfall(this.player.x, body.bottom, true);
      this.soundtrack.cue("land");
    }
    const left =
      this.cursors.left.isDown || this.keys.A.isDown || this.controls.left;
    const right =
      this.cursors.right.isDown || this.keys.D.isDown || this.controls.right;
    body.setAccelerationX(
      (left === right ? 0 : left ? -1 : 1) * (grounded ? 2500 : 1850),
    );
    // Tiny differences between drawn ground and bridge edges should not snag feet.
    if (
      body.blocked.down &&
      ((right && body.blocked.right) || (left && body.blocked.left))
    ) {
      const step = this.definition.entities.find((e) => {
        if (e.kind !== "terrain" && e.kind !== "bridge") return false;
        const rise = body.bottom - e.y;
        const atEdge = right
          ? Math.abs(body.right - e.x) < 3
          : Math.abs(body.left - e.x - e.width) < 3;
        return atEdge && rise > 0 && rise <= 10;
      });
      if (step) {
        this.player.y -= body.bottom - step.y + 1;
        body.updateFromGameObject();
      }
    }
    if (left || right) this.player.setFlipX(left);
    if (
      Phaser.Input.Keyboard.JustDown(this.cursors.up) ||
      Phaser.Input.Keyboard.JustDown(this.keys.SPACE) ||
      Phaser.Input.Keyboard.JustDown(this.keys.W) ||
      (this.controls.jump && !this.previousTouchJump)
    )
      this.jumpQueued = time;
    if (time - this.jumpQueued < 120 && time - this.lastGrounded < 100) {
      body.setVelocityY(-650);
      this.lastGrounded = -1000;
      this.jumpQueued = -1000;
      this.soundtrack.cue("jump");
      this.footfall(this.player.x, body.bottom, true);
    }
    const held =
      this.cursors.up.isDown ||
      this.keys.SPACE.isDown ||
      this.keys.W.isDown ||
      this.controls.jump;
    // Release early for a short hop; hold to reach the high platforms.
    if (this.jumpHeld && !held && body.velocity.y < -240)
      body.setVelocityY(body.velocity.y * 0.5);
    this.jumpHeld = held;
    this.previousTouchJump = this.controls.jump;
    if (
      Phaser.Input.Keyboard.JustDown(this.keys.E) ||
      (this.controls.interact && !this.previousTouchInteract)
    ) {
      const lever = this.nearestLever();
      if (lever) this.openLever(lever.entity.id);
    }
    this.previousTouchInteract = this.controls.interact;
    this.player.x = Phaser.Math.Clamp(
      this.player.x,
      25,
      this.definition.width - 25,
    );
    if (this.player.y > this.definition.height + 110) {
      this.player.setPosition(this.spawn.x, this.spawn.y);
      body.setVelocity(0);
      this.soundtrack.cue("return");
      this.ring(this.spawn.x, this.spawn.y, 0xffdf9c, 60);
      this.hooks.onMoment("Back on your feet. Your discoveries are kept.");
    }
    const speed = Math.abs(body.velocity.x);
    const stride = Math.sin(time / 65);
    let scaleX = 1,
      scaleY = 1,
      bob = 0;
    if (!this.reducedMotion) {
      if (time < this.impactUntil) {
        scaleX = 1.14;
        scaleY = 0.84;
      } else if (!grounded) {
        scaleX = 0.94;
        scaleY = 1.06;
      } else if (speed > 35) {
        scaleX = 1 + stride * 0.035;
        scaleY = 1 - stride * 0.05;
        bob = -Math.abs(stride) * 3;
      } else {
        scaleX = 1 + Math.sin(time / 700) * 0.012;
        scaleY = 1 - Math.sin(time / 700) * 0.018;
      }
    }
    const blend = 1 - Math.exp(-delta / 45);
    this.poseX = Phaser.Math.Linear(this.poseX, scaleX, blend);
    this.poseY = Phaser.Math.Linear(this.poseY, scaleY, blend);
    this.heroArt
      .setPosition(this.player.x, this.player.y + this.heroHeight / 2 + bob)
      .setDisplaySize(this.heroWidth * this.poseX, this.heroHeight * this.poseY)
      .setFlipX(this.player.flipX)
      .setAngle(
        this.reducedMotion
          ? 0
          : Phaser.Math.Clamp(body.velocity.x / (grounded ? 95 : 55), -7, 7),
      );
    this.heroHalo
      .setPosition(this.player.x, this.player.y)
      .setAlpha(0.045 + (grounded ? 0 : 0.025));
    if (grounded && speed > 70 && time - this.lastStep > 145) {
      this.lastStep = time;
      this.footfall(this.player.x, body.bottom);
      this.soundtrack.cue("step", Math.floor(time / 145));
    }
    const floor = this.definition.entities
      .filter(
        (e) =>
          (e.kind === "terrain" || e.kind === "bridge") &&
          this.player.x >= e.x &&
          this.player.x <= e.x + e.width &&
          e.y >= body.bottom - 12,
      )
      .sort((a, b) => a.y - b.y)[0];
    const altitude = floor ? Math.max(0, floor.y - body.bottom) : 1000;
    this.shadow
      .setPosition(this.player.x, floor?.y ?? 900)
      .setVisible(altitude < 300)
      .setAlpha(Math.max(0.025, 0.2 - altitude / 1500))
      .setScale(Math.max(0.35, 1 - altitude / 420), 1);
    if (!this.reducedMotion && !this.overview) {
      const camera = this.cameras.main;
      const lookAhead = Phaser.Math.Clamp(body.velocity.x * 0.35, -105, 105);
      const target = camera.getScroll(
        this.player.x + lookAhead,
        this.player.y + this.heroHeight / 2 + 110 - camera.displayHeight / 2,
        this.cameraTarget,
      );
      camera.scrollX = Phaser.Math.Linear(
        camera.scrollX,
        target.x,
        1 - Math.exp(-delta / 230),
      );
      camera.scrollY = Phaser.Math.Linear(
        camera.scrollY,
        target.y,
        1 - Math.exp(-delta / 300),
      );
    }
    this.wasGrounded = grounded;
    this.lastVerticalSpeed = body.velocity.y;
    const lever = this.nearestLever();
    this.hint.setVisible(Boolean(lever));
    if (lever) this.hint.setPosition(lever.entity.x + 25, lever.entity.y - 38);
    if (time - this.lastReport > 250) {
      this.lastReport = time;
      this.report();
    }
  }
}
