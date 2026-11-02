import Phaser from "phaser";
import { createAtmosphere } from "./atmosphere";
import { Soundscape } from "./soundscape";
import { artworkRasterSize } from "./artwork-raster";
import {
  containArtwork,
  imageDirection,
  sourceColorField,
  type ImageDirection,
} from "./image-direction";
import {
  canDiscover,
  discoveryResolved,
  nextDiscoveryClue,
} from "./discovery-progress";
import {
  sceneBoundsVisible,
  sceneView,
  type SceneRect,
} from "./scene-visibility";
import { terrainTiles } from "./terrain-tiles";
import { roamSteering } from "./roam-motion";
import { objectName } from "../lib/object-name";
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
  interactionHint: string;
  goalHint: string;
  requiredDone: number;
  requiredTotal: number;
  playerX: number;
  playerY: number;
}
export interface WorldControls {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
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
  private hintLeverId = "";
  private hintWrapWidth = 250;
  private lastGrounded = -1000;
  private jumpQueued = -1000;
  private lastReport = 0;
  private lastGoalNotice = { message: "", at: -10000 };
  private previousTouchJump = false;
  private previousTouchInteract = false;
  private spawn = { x: 0, y: 0 };
  private isPlaying = false;
  private overview = false;
  private viewportWidth = 0;
  private resourcesReleased = false;
  private sceneCreated = false;
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
  private heroVisualWidth = 1;
  private heroVisualHeight = 1;
  private sourceHero = false;
  private creativeArtwork = false;
  private direction: ImageDirection = imageDirection([]);
  private sourceField: number[] = [];
  private actorIntro?: Phaser.GameObjects.Graphics;
  private actorIntroStarted = false;
  private heroFocus?: Phaser.GameObjects.Graphics;
  private heroFrame?: Phaser.GameObjects.Graphics;
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
  private discoveryRegions = new Map<
    string,
    { entity: WorldEntity; graphic: Phaser.GameObjects.Graphics }
  >();
  private discoveryHover = "";
  private discoveryHintId = "";
  private discoveryFocusId = "";
  private lastDiscoveryNotice = -10000;
  private sourceCues = new Map<string, Phaser.GameObjects.Graphics>();
  private discoveryZoom = 1;
  private discoveryCenter?: { x: number; y: number };
  private discoveryDrag?: {
    id: number;
    x: number;
    y: number;
    centerX: number;
    centerY: number;
    moved: boolean;
  };
  private roamTarget?: { x: number; y: number };
  private roamMarker?: Phaser.GameObjects.Graphics;
  private roamFocus?: Phaser.GameObjects.Graphics;
  private roamTap?: { id: number; x: number; y: number };
  private roamTrack = { x: 0, y: 0, stalledMs: 0 };
  private lastRoamAction = -10000;
  private roamEngaged = false;
  controls: WorldControls = {
    left: false,
    right: false,
    up: false,
    down: false,
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
    this.resourcesReleased = true;
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
    this.resourcesReleased = false;
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
    if (
      this.definition.source !== "example" &&
      (this.definition.gameplay?.movement ?? "platform") === "platform" &&
      !this.definition.entities.some(
        (entity) =>
          entity.artNote ===
          "Full original image used as the world backdrop; generated gameplay is separate.",
      )
    ) {
      if (this.definition.sourceImage.endsWith(".svg"))
        this.load.svg("source-stage-colors", this.definition.sourceImage, {
          width: 192,
          height: 128,
        });
      else this.load.image("source-stage-colors", this.definition.sourceImage);
    }
  }

  create() {
    this.staticGraphics = [];
    this.generatedTerrainPixels = 0;
    this.generatedTerrainPieces = 0;
    this.state = structuredClone(this.initial);
    this.sceneCreated = true;
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
    const sourceBackdrop = this.definition.entities.find(
      (entity) =>
        entity.kind === "decoration" &&
        entity.art &&
        entity.artNote ===
          "Full original image used as the world backdrop; generated gameplay is separate.",
    );
    const sourceStage =
      sourceBackdrop || this.textures.exists("source-stage-colors");
    this.creativeArtwork = Boolean(sourceStage);
    if (sourceBackdrop)
      this.direction = this.sampleSourceDirection(sourceBackdrop);
    else if (sourceStage)
      this.direction = this.sampleSourceDirection("source-stage-colors");
    this.updateAtmosphere = sourceBackdrop
      ? this.definition.gameplay?.movement === "roam" ||
        this.definition.gameplay?.movement === "discover"
        ? this.createSourceBackdrop(sourceBackdrop)
        : this.createSourceAtmosphere()
      : sourceStage
        ? this.createSourceAtmosphere()
        : createAtmosphere(this, this.definition.theme, this.reducedMotion);
    if (this.definition.gameplay?.movement === "discover") {
      this.createDiscovery();
      return;
    }
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
    this.sourceHero = Boolean(hero.art);
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
    const heroSize =
      hero.art || this.creativeArtwork
        ? containArtwork(
            this.heroArt.width,
            this.heroArt.height,
            hero.width,
            hero.height,
          )
        : { width: hero.width, height: hero.height };
    this.heroVisualWidth = heroSize.width;
    this.heroVisualHeight = heroSize.height;
    this.heroArt.setDisplaySize(heroSize.width, heroSize.height);
    this.heroArt.setPosition(this.player.x, this.player.y + hero.height / 2);
    if (this.creativeArtwork) {
      this.heroHalo.setVisible(false);
      this.heroFocus = this.add.graphics().setDepth(19);
      const radius = Math.max(16, Math.min(32, heroSize.width * 0.48));
      this.heroFocus.lineStyle(5, this.direction.ink, 0.8);
      this.heroFocus.strokeEllipse(0, 0, radius * 2, 12);
      this.heroFocus.lineStyle(1.5, this.direction.surface, 0.95);
      this.heroFocus.strokeEllipse(0, 0, radius * 2, 12);
      this.heroFocus.setPosition(
        this.player.x,
        this.player.y + hero.height / 2 + 2,
      );
      if (this.definition.gameplay?.movement !== "roam") {
        this.heroFocus.setVisible(false);
        this.actorIntro = this.add.graphics().setDepth(25);
        this.actorIntro.lineStyle(4, this.direction.ink, 0.75);
        this.actorIntro.lineBetween(-6, -4, 0, 2);
        this.actorIntro.lineBetween(0, 2, 6, -4);
        this.actorIntro.lineStyle(1.5, this.direction.surface, 1);
        this.actorIntro.lineBetween(-6, -4, 0, 2);
        this.actorIntro.lineBetween(0, 2, 6, -4);
        this.updateActorIntro();
      }
      if (hero.art && hero.artMethod === "crop") {
        // A retained rectangular photo crop is presented honestly as a source
        // fragment, rather than disguised as a clean subject segmentation.
        this.heroFrame = this.add.graphics().setDepth(21);
        this.heroFrame.lineStyle(4, this.direction.ink, 0.9);
        this.heroFrame.strokeRect(
          -heroSize.width / 2,
          -heroSize.height,
          heroSize.width,
          heroSize.height,
        );
        this.heroFrame.lineStyle(1, this.direction.surface, 0.9);
        this.heroFrame.strokeRect(
          -heroSize.width / 2,
          -heroSize.height,
          heroSize.width,
          heroSize.height,
        );
        this.heroFrame.setPosition(this.heroArt.x, this.heroArt.y);
      }
    }
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
    if (this.definition.gameplay?.movement === "roam") {
      body.setAllowGravity(false).setDrag(1800, 1800).setMaxVelocity(300, 300);
      this.physics.world.setBounds(
        0,
        0,
        this.definition.width,
        this.definition.height,
      );
      body.setCollideWorldBounds(true);
      this.shadow.setVisible(false);
      this.heroFocus?.setVisible(false);
      this.createRoamNavigation();
    }
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
      if (e.kind === "decoration" && e.art && e !== sourceBackdrop)
        this.add
          .image(e.x + e.width / 2, e.y + e.height / 2, `art-${e.id}`)
          .setDisplaySize(e.width, e.height)
          .setDepth(10);
    }
    this.cursors = this.input.keyboard!.createCursorKeys();
    this.keys = this.input.keyboard!.addKeys("A,D,W,S,E,SPACE") as Record<
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
      .text(0, 0, "", {
        fontFamily: "Manrope, sans-serif",
        fontSize: "16px",
        color: "#faf8f1",
        backgroundColor: "#4c5549",
        padding: { x: 16, y: 10 },
        wordWrap: { width: 250, useAdvancedWrap: true },
        align: "center",
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

  /** Creative adaptations keep the complete real image visible. Generated
   * gameplay moves in front of it; no forest or other invented scenery covers
   * its subjects. Contain, rather than stretch/crop, also preserves photographs.
   */
  private createSourceBackdrop(entity: WorldEntity): () => void {
    const camera = this.cameras.main;
    camera.setBackgroundColor(this.direction.background);
    const image = this.add
      .image(
        entity.x + entity.width / 2,
        entity.y + entity.height / 2,
        `art-${entity.id}`,
      )
      .setDepth(-9);
    const size = containArtwork(
      image.width,
      image.height,
      entity.width,
      entity.height,
    );
    image.setDisplaySize(size.width, size.height);
    // Targets and their source art share one world coordinate frame. Discover
    // fits that frame; roaming travels within it instead of sliding targets
    // over a camera-fixed image.
    return () => {};
  }

  private createSourceAtmosphere(): () => void {
    const camera = this.cameras.main;
    camera.setBackgroundColor(this.direction.background);
    const texture = this.textures.createCanvas(
      "source-color-atmosphere",
      384,
      256,
    );
    if (!texture) return () => {};
    const context = texture.context;
    const tiny = document.createElement("canvas");
    tiny.width = 3;
    tiny.height = 2;
    const painter = tiny.getContext("2d");
    if (!painter) return () => {};
    const colors =
      this.sourceField.length === 6
        ? this.sourceField
        : Array(6).fill(this.direction.matte);
    for (let i = 0; i < 6; i++) {
      painter.fillStyle = `#${colors[i].toString(16).padStart(6, "0")}`;
      painter.fillRect(i % 3, Math.floor(i / 3), 1, 1);
    }
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(tiny, 0, 0, 384, 256);
    // Six source-color washes are deliberately nonfigurative. No second actor,
    // page or invented landscape competes with actual playable source cutouts.
    context.fillStyle = this.direction.lightSource
      ? "rgba(246,244,235,.26)"
      : "rgba(19,30,34,.24)";
    context.fillRect(0, 0, 384, 256);
    const shade = context.createLinearGradient(0, 0, 0, 256);
    shade.addColorStop(0, "rgba(255,255,255,.10)");
    shade.addColorStop(1, "rgba(22,31,34,.15)");
    context.fillStyle = shade;
    context.fillRect(0, 0, 384, 256);
    texture.refresh();
    const image = this.add
      .image(0, 0, texture.key)
      .setDepth(-10)
      .setScrollFactor(0);
    let width = 0,
      height = 0,
      zoom = 0;
    const fit = () => {
      if (
        camera.width === width &&
        camera.height === height &&
        camera.zoom === zoom
      )
        return;
      width = camera.width;
      height = camera.height;
      zoom = Math.max(0.001, camera.zoom);
      image
        .setPosition(width / 2, height / 2)
        .setDisplaySize(width / zoom, height / zoom);
    };
    fit();
    return fit;
  }

  private updateActorIntro() {
    const zoom = Math.max(0.001, this.cameras.main.zoom);
    this.actorIntro
      ?.setPosition(
        this.heroArt.x,
        this.heroArt.y - this.heroVisualHeight - 12 / zoom,
      )
      .setScale(1 / zoom);
  }

  private discoveryResolved(entity: WorldEntity): boolean {
    return discoveryResolved(entity, this.state);
  }

  private nextDiscoveryClue() {
    return nextDiscoveryClue(this.definition, this.state);
  }

  revealDiscoveryHint(): void {
    if (
      this.definition.gameplay?.movement !== "discover" ||
      !this.isPlaying ||
      (this.state.completed && !this.state.exploring)
    )
      return;
    const clue = this.nextDiscoveryClue();
    if (!clue) return;
    const previous = this.discoveryHintId;
    this.discoveryHintId = clue.entityId;
    if (previous)
      this.drawDiscoveryRegion(previous, this.discoveryHover === previous);
    this.drawDiscoveryRegion(clue.entityId, true);
    this.hooks.onMoment(clue.text);
    this.time.delayedCall(2200, () => {
      if (this.discoveryHintId === clue.entityId) this.discoveryHintId = "";
      this.drawDiscoveryRegion(
        clue.entityId,
        this.discoveryHover === clue.entityId,
      );
    });
  }

  focusDiscovery(entityId?: string): void {
    if (
      this.definition.gameplay?.movement !== "discover" ||
      this.resourcesReleased
    )
      return;
    const previous = this.discoveryFocusId;
    this.discoveryFocusId =
      entityId && this.discoveryRegions.has(entityId) ? entityId : "";
    if (previous)
      this.drawDiscoveryRegion(previous, this.discoveryHover === previous);
    if (this.discoveryFocusId) this.drawDiscoveryRegion(this.discoveryFocusId);
  }

  private drawDiscoveryRegion(id: string, hover = false) {
    const region = this.discoveryRegions.get(id);
    if (!region) return;
    const { entity: e, graphic } = region;
    const found = this.discoveryResolved(e);
    const active =
      hover || this.discoveryHintId === id || this.discoveryFocusId === id;
    graphic.clear().setVisible(found || active);
    if (!found && !active) return;
    const unit = 1 / Math.max(0.001, this.cameras.main.zoom);
    const inset = Math.min(3 * unit, e.width / 8, e.height / 8);
    if (active) {
      graphic.lineStyle(3 * unit, this.direction.ink, 0.55);
      graphic.strokeRoundedRect(
        e.x + inset,
        e.y + inset,
        e.width - inset * 2,
        e.height - inset * 2,
        Math.min(8, e.width / 5, e.height / 5),
      );
      graphic.lineStyle(
        1.1 * unit,
        found ? this.direction.accent : this.direction.surface,
        1,
      );
      graphic.strokeRoundedRect(
        e.x + inset,
        e.y + inset,
        e.width - inset * 2,
        e.height - inset * 2,
        Math.min(8, e.width / 5, e.height / 5),
      );
    }
    if (found) {
      const x = Phaser.Math.Clamp(
        e.x + e.width - 3 * unit,
        7 * unit,
        this.definition.width - 7 * unit,
      );
      const y = Phaser.Math.Clamp(
        e.y + 3 * unit,
        7 * unit,
        this.definition.height - 7 * unit,
      );
      graphic.fillStyle(this.direction.ink, 0.82);
      graphic.fillCircle(x, y, 6 * unit);
      graphic.lineStyle(1.3 * unit, this.direction.surface, 1);
      graphic.lineBetween(x - 3 * unit, y, x - unit, y + 2 * unit);
      graphic.lineBetween(x - unit, y + 2 * unit, x + 3 * unit, y - 2 * unit);
    }
  }

  private createDiscovery() {
    this.discoveryRegions.clear();
    this.physics.world.pause();
    for (const entity of this.definition.entities) {
      if (!["coin", "lever", "goal"].includes(entity.kind)) continue;
      this.discoveryRegions.set(entity.id, {
        entity,
        graphic: this.add.graphics().setDepth(15),
      });
      this.drawDiscoveryRegion(entity.id);
    }
    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      this.discoveryDrag = {
        id: pointer.id,
        x: pointer.x,
        y: pointer.y,
        centerX: this.discoveryCenter?.x ?? this.definition.width / 2,
        centerY: this.discoveryCenter?.y ?? this.definition.height / 2,
        moved: false,
      };
    });
    this.input.on("pointerup", (pointer: Phaser.Input.Pointer) => {
      const drag = this.discoveryDrag;
      this.discoveryDrag = undefined;
      if (drag?.id === pointer.id && drag.moved) return;
      const point = pointer.positionToCamera(
        this.cameras.main,
      ) as Phaser.Math.Vector2;
      this.interactAt(point);
    });
    this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
      const drag = this.discoveryDrag;
      if (drag?.id === pointer.id && pointer.isDown) {
        const dx = pointer.x - drag.x,
          dy = pointer.y - drag.y;
        if (Math.hypot(dx, dy) > 8) drag.moved = true;
        if (drag.moved) {
          this.discoveryCenter = {
            x: drag.centerX - dx / this.cameras.main.zoom,
            y: drag.centerY - dy / this.cameras.main.zoom,
          };
          this.applyDiscoveryView();
          this.input.setDefaultCursor("grabbing");
          return;
        }
      }
      const point = pointer.positionToCamera(
        this.cameras.main,
      ) as Phaser.Math.Vector2;
      const region = this.discoveryRegionAt(point);
      const next = region?.entity.id ?? "";
      if (next === this.discoveryHover) return;
      this.drawDiscoveryRegion(this.discoveryHover, false);
      this.discoveryHover = next;
      this.drawDiscoveryRegion(next, true);
      this.input.setDefaultCursor(next ? "pointer" : "default");
    });
    this.input.on(Phaser.Input.Events.GAME_OUT, () => {
      this.drawDiscoveryRegion(this.discoveryHover, false);
      this.discoveryHover = "";
      this.input.setDefaultCursor("default");
    });
    this.input.on("pointerupoutside", () => {
      this.discoveryDrag = undefined;
    });
    this.setViewportWidth(this.cameras.main.width);
    this.report();
    this.hooks.onReady(this);
  }

  private discoveryRegionAt(point: { x: number; y: number }) {
    const regions = [...this.discoveryRegions.values()];
    const matches = regions.filter(
      ({ entity: e }) =>
        point.x >= e.x &&
        point.x <= e.x + e.width &&
        point.y >= e.y &&
        point.y <= e.y + e.height,
    );
    const next = this.nextDiscoveryClue();
    if (matches.length)
      return (
        matches.find((region) => region.entity.id === next?.entityId) ??
        matches.sort(
          (a, b) =>
            a.entity.width * a.entity.height - b.entity.width * b.entity.height,
        )[0]
      );
    // A small physical-screen allowance helps tiny details on a phone. It never
    // prefers the clue over a different object that was actually tapped.
    const zoom = this.cameras?.main?.zoom || 1;
    return regions
      .map((region) => {
        const e = region.entity;
        const dx = Math.max(e.x - point.x, 0, point.x - e.x - e.width);
        const dy = Math.max(e.y - point.y, 0, point.y - e.y - e.height);
        const px = Math.min(12 / zoom, Math.max(0, (28 / zoom - e.width) / 2));
        const py = Math.min(12 / zoom, Math.max(0, (28 / zoom - e.height) / 2));
        return {
          region,
          distance: Math.hypot(dx, dy),
          valid: dx <= px && dy <= py,
        };
      })
      .filter((candidate) => candidate.valid)
      .sort(
        (a, b) =>
          a.distance - b.distance ||
          a.region.entity.width * a.region.entity.height -
            b.region.entity.width * b.region.entity.height,
      )[0]?.region;
  }

  zoomDiscovery(factor: number): void {
    if (
      this.definition.gameplay?.movement !== "discover" ||
      !Number.isFinite(factor) ||
      factor <= 0 ||
      this.resourcesReleased
    )
      return;
    this.discoveryZoom = Phaser.Math.Clamp(this.discoveryZoom * factor, 1, 4);
    this.applyDiscoveryView();
  }

  resetDiscoveryView(): void {
    if (
      this.definition.gameplay?.movement !== "discover" ||
      this.resourcesReleased
    )
      return;
    this.discoveryZoom = 1;
    this.discoveryCenter = {
      x: this.definition.width / 2,
      y: this.definition.height / 2,
    };
    this.applyDiscoveryView();
  }

  /** Keyboard view navigation uses CSS-screen distances and never selects a
   * region or changes discoveries. Positive deltas move the view right/down. */
  panDiscovery(dx: number, dy: number): void {
    if (
      this.definition.gameplay?.movement !== "discover" ||
      this.resourcesReleased ||
      !Number.isFinite(dx) ||
      !Number.isFinite(dy)
    )
      return;
    const camera = this.cameras?.main;
    if (!camera) return;
    const center = this.discoveryCenter ?? {
      x: this.definition.width / 2,
      y: this.definition.height / 2,
    };
    this.discoveryCenter = {
      x: center.x + dx / Math.max(0.001, camera.zoom),
      y: center.y + dy / Math.max(0.001, camera.zoom),
    };
    this.applyDiscoveryView();
  }

  private applyDiscoveryView() {
    const camera = this.cameras?.main;
    if (!camera || this.resourcesReleased) return;
    const fit = Math.min(
      camera.width / this.definition.width,
      camera.height / this.definition.height,
    );
    camera.removeBounds().setZoom(Math.max(0.001, fit * this.discoveryZoom));
    const halfWidth = camera.width / camera.zoom / 2,
      halfHeight = camera.height / camera.zoom / 2;
    const center = this.discoveryCenter ?? {
      x: this.definition.width / 2,
      y: this.definition.height / 2,
    };
    this.discoveryCenter = {
      x:
        halfWidth >= this.definition.width / 2
          ? this.definition.width / 2
          : Phaser.Math.Clamp(
              center.x,
              halfWidth,
              this.definition.width - halfWidth,
            ),
      y:
        halfHeight >= this.definition.height / 2
          ? this.definition.height / 2
          : Phaser.Math.Clamp(
              center.y,
              halfHeight,
              this.definition.height - halfHeight,
            ),
    };
    camera.centerOn(this.discoveryCenter.x, this.discoveryCenter.y);
    for (const [id, region] of this.discoveryRegions)
      if (region.graphic.visible || this.discoveryResolved(region.entity))
        this.drawDiscoveryRegion(id, this.discoveryHover === id);
  }

  interactAt(point: { x: number; y: number }): boolean {
    if (
      this.definition.gameplay?.movement !== "discover" ||
      !this.isPlaying ||
      !Number.isFinite(point.x) ||
      !Number.isFinite(point.y)
    )
      return false;
    const region = this.discoveryRegionAt(point);
    if (region) return this.selectDiscovery(region.entity.id);
    if (this.time.now - this.lastDiscoveryNotice > 1000) {
      this.lastDiscoveryNotice = this.time.now;
      this.ring(point.x, point.y, this.direction.surface, 18);
      this.hooks.onMoment(
        this.nextDiscoveryClue()?.text ??
          goalProgress(this.definition, this.state).hint,
      );
    }
    return false;
  }

  selectDiscovery(id: string): boolean {
    if (
      this.definition.gameplay?.movement !== "discover" ||
      !this.isPlaying ||
      (this.state.completed && !this.state.exploring)
    )
      return false;
    const region = this.discoveryRegions.get(id);
    if (!region || this.discoveryResolved(region.entity)) return false;
    const e = region.entity;
    const next = this.nextDiscoveryClue();
    if (!canDiscover(this.definition, this.state, id)) {
      if (this.time.now - this.lastDiscoveryNotice > 1000) {
        this.lastDiscoveryNotice = this.time.now;
        this.hooks.onMoment(
          next?.text ?? goalProgress(this.definition, this.state).hint,
        );
      }
      return false;
    }
    const wasCompleted = this.state.completed;
    if (e.kind === "goal") {
      const progress = goalProgress(this.definition, this.state);
      if (!progress.ready) {
        this.hooks.onMoment(progress.hint);
        return false;
      }
      this.state.completed = true;
      this.soundtrack.cue("finish");
    } else if (e.kind === "lever") {
      this.state.activated.push(id);
      this.soundtrack.cue("gate");
    } else {
      this.state.collected.push(id);
      this.soundtrack.cue("collect", this.state.collected.length);
    }
    this.drawDiscoveryRegion(id, this.discoveryHover === id);
    this.ring(
      e.x + e.width / 2,
      e.y + e.height / 2,
      this.direction.accent,
      Math.min(48, Math.max(e.width, e.height) / 2),
    );
    this.hooks.onMoment(
      wasCompleted
        ? "Detail found."
        : this.state.completed
        ? "World complete."
        : (this.nextDiscoveryClue()?.text ??
            goalProgress(this.definition, this.state).hint),
    );
    this.report();
    return true;
  }

  private sampleSourceDirection(entity: WorldEntity | string): ImageDirection {
    try {
      const canvas = document.createElement("canvas");
      canvas.width = 32;
      canvas.height = 24;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) return imageDirection([]);
      context.drawImage(
        this.textures
          .get(typeof entity === "string" ? entity : `art-${entity.id}`)
          .getSourceImage() as CanvasImageSource,
        0,
        0,
        32,
        24,
      );
      const pixels = context.getImageData(0, 0, 32, 24).data;
      this.sourceField = sourceColorField(pixels, 32, 24);
      return imageDirection(pixels);
    } catch {
      // Restricted image readback keeps the original texture visible and uses
      // neutral dual-contrast cues; it never replaces or rewrites source pixels.
      return imageDirection([]);
    }
  }

  private createFallbackHero(): string {
    const g = this.add.graphics();
    if (this.creativeArtwork) {
      g.fillStyle(this.direction.ink, 0.92);
      g.fillCircle(32, 32, 25);
      g.lineStyle(2.5, this.direction.surface, 1);
      g.strokeCircle(32, 32, 25);
      g.lineStyle(2, this.direction.accent, 1);
      g.strokeCircle(32, 32, 15);
      g.fillStyle(this.direction.surface);
      g.fillCircle(32, 32, 4);
      g.generateTexture("fallback-hero", 64, 64);
      g.destroy();
      return "fallback-hero";
    }
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
    if (this.creativeArtwork) {
      // Added connections are matte source-palette material. Actual source
      // supports retain their own art; no capsules or rivets compete with it.
      const height = e.kind === "bridge" ? Math.min(e.height, 12) : e.height;
      g.fillStyle(this.direction.matte, 0.9);
      g.fillRoundedRect(e.x, e.y, e.width, height, 1.5);
      g.lineStyle(1.25, this.direction.accent, 0.9);
      g.lineBetween(e.x + 1, e.y, e.x + e.width - 1, e.y);
      g.lineStyle(1, this.direction.ink, 0.18);
      g.lineBetween(e.x + 1, e.y + height, e.x + e.width - 1, e.y + height);
    } else if (e.kind === "bridge") {
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
    const sourceGate =
      this.definition.gameplay?.movement === "roam" && e.artSource && !e.art;
    if (this.creativeArtwork) {
      g.fillStyle(this.direction.matte, 0.92);
      g.fillRoundedRect(0, 0, e.width, e.height, 2);
      g.lineStyle(1.25, this.direction.accent, 0.9);
      g.strokeRoundedRect(0, 0, e.width, e.height, 2);
      g.lineStyle(1, this.direction.surface, 0.6);
      g.lineBetween(e.width / 2, 9, e.width / 2, e.height - 9);
      for (let y = 18; y < e.height - 12; y += 22) {
        g.lineStyle(1, this.direction.surface, 0.65);
        g.lineBetween(4, y, e.width - 4, y + 6);
      }
    } else {
      g.fillStyle(0xb4a0c4);
      g.fillRoundedRect(0, 0, e.width, e.height, 15);
      g.lineStyle(2, 0x75617f, 0.85);
      g.strokeRoundedRect(0, 0, e.width, e.height, 15);
      g.fillStyle(0xcbbbda);
      g.fillRoundedRect(5, 7, e.width - 10, 18, 7);
      g.lineStyle(2, 0x8f7a9c, 0.7);
      for (let y = 37; y < e.height; y += 30)
        g.lineBetween(2, y, e.width - 2, y);
    }
    art.add(g);
    if (sourceGate) {
      g.setVisible(false);
      this.drawSourceCue(e, false);
    }
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
    if (
      this.definition.gameplay?.movement === "roam" &&
      e.artSource &&
      !e.art
    ) {
      this.drawSourceCue(e, this.state.collected.includes(e.id));
      if (this.state.collected.includes(e.id)) return;
      const region = this.add.zone(
        e.x + e.width / 2,
        e.y + e.height / 2,
        e.width,
        e.height,
      );
      this.physics.add.existing(region, true);
      this.physics.add.overlap(this.player, region, () => {
        if (
          !this.isPlaying ||
          !this.roamEngaged ||
          this.state.collected.includes(e.id)
        )
          return;
        this.state.collected.push(e.id);
        this.physics.world.disable(region);
        this.drawSourceCue(e, true);
        this.soundtrack.cue("collect", this.state.collected.length);
        this.ring(
          e.x + e.width / 2,
          e.y + e.height / 2,
          this.direction.accent,
          30,
        );
        this.hooks.onMoment(`${objectName(this.definition, e.id)} found.`);
        this.report();
      });
      return;
    }
    if (this.state.collected.includes(e.id)) return;
    if (!this.textures.exists("collectible-light")) {
      const g = this.make.graphics({ x: 0, y: 0 });
      if (this.creativeArtwork) {
        g.fillStyle(this.direction.ink, 0.9);
        g.fillCircle(20, 20, 16);
        g.lineStyle(1.5, this.direction.surface, 0.95);
        g.strokeCircle(20, 20, 15);
        g.fillStyle(this.direction.accent);
        g.fillTriangle(20, 10, 13, 20, 20, 30);
        g.fillTriangle(20, 10, 27, 20, 20, 30);
      } else {
        g.fillStyle(0xffdf93);
        g.fillCircle(20, 20, 10);
        g.lineStyle(2, 0xfff3cf);
        g.strokeCircle(20, 20, 14);
      }
      g.generateTexture("collectible-light", 40, 40);
      g.destroy();
    }
    const halo = this.add
      .circle(
        e.x + e.width / 2,
        e.y + e.height / 2,
        Math.max(e.width, e.height) * 0.9,
        this.creativeArtwork ? this.direction.accent : 0xffdf93,
        this.creativeArtwork ? 0.035 : 0.07,
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
        y: coin.y - (this.creativeArtwork ? 3 : 7),
        duration: this.creativeArtwork ? 1700 : 1100,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
      });
    this.physics.add.overlap(this.player, coin, () => {
      if (this.state.collected.includes(e.id)) return;
      if (this.definition.gameplay?.movement === "roam" && !this.roamEngaged)
        return;
      this.state.collected.push(e.id);
      halo.destroy();
      this.physics.world.disable(coin);
      this.tweens.killTweensOf(coin);
      this.tweens.add({
        targets: coin,
        y: coin.y - (this.reducedMotion ? 0 : 35),
        alpha: 0,
        scaleX: coin.scaleX * (this.reducedMotion ? 1 : 1.5),
        scaleY: coin.scaleY * (this.reducedMotion ? 1 : 1.5),
        duration: 300,
        onComplete: () => coin.destroy(),
      });
      this.burst(
        coin.x,
        coin.y,
        this.creativeArtwork ? this.direction.accent : 0xf3da8e,
        this.creativeArtwork ? 4 : 9,
      );
      this.soundtrack.cue("collect", this.state.collected.length);
      this.ring(
        coin.x,
        coin.y,
        this.creativeArtwork ? this.direction.accent : 0xffe3a3,
        this.creativeArtwork ? 25 : 36,
      );
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
    g.fillStyle(
      this.creativeArtwork ? this.direction.ink : 0x837b67,
      this.creativeArtwork ? 0.9 : 1,
    );
    g.fillRoundedRect(e.x, e.y + e.height - 12, e.width, 12, 5);
    const handle = this.add
      .line(
        0,
        0,
        e.x + e.width / 2,
        e.y + e.height - 8,
        e.x + 8,
        e.y + 12,
        this.creativeArtwork ? this.direction.surface : 0x655b50,
        1,
      )
      .setOrigin(0)
      .setLineWidth(this.creativeArtwork ? 3 : 5)
      .setDepth(13);
    const knob = this.add
      .circle(
        e.x + 8,
        e.y + 12,
        9,
        this.creativeArtwork ? this.direction.accent : 0xe7c278,
      )
      .setStrokeStyle(2, this.creativeArtwork ? this.direction.ink : 0x85704e)
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
      ) {
        this.lastRoamAction = this.time.now;
        this.openLever(e.id);
      }
    });
    let originalArt: Phaser.GameObjects.Image | undefined;
    if (
      this.definition.gameplay?.movement === "roam" &&
      e.artSource &&
      !e.art
    ) {
      g.setVisible(false);
      handle.setVisible(false);
      knob.setVisible(false);
      this.drawSourceCue(e, this.state.activated.includes(e.id));
    }
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
    const sourceTarget =
      this.definition.gameplay?.movement === "roam" && e.artSource && !e.art;
    if (sourceTarget) this.drawSourceCue(e, this.state.completed);
    if (e.art)
      this.add
        .image(e.x + e.width / 2, e.y + e.height / 2, `art-${e.id}`)
        .setDisplaySize(e.width, e.height)
        .setDepth(11);
    if (!sourceTarget) {
      const beacon = this.add
        .ellipse(
          e.x + e.width / 2,
          e.y + e.height * 0.65,
          e.width * 1.4,
          e.height * 1.3,
          0xffe6aa,
          this.creativeArtwork ? 0.025 : 0.065,
        )
        .setDepth(9);
      if (!this.reducedMotion)
        this.tweens.add({
          targets: beacon,
          alpha: this.creativeArtwork ? 0.055 : 0.13,
          scaleY: 1.08,
          duration: 2100,
          yoyo: true,
          repeat: -1,
          ease: "Sine.easeInOut",
        });
    }
    if (!e.art && !sourceTarget) {
      const arch = this.add.graphics().setDepth(11);
      if (this.creativeArtwork) {
        const x = e.x + e.width * 0.15,
          width = e.width * 0.7;
        arch.fillStyle(this.direction.matte, 0.9);
        arch.fillRect(x, e.y, 4, e.height);
        arch.fillRect(x + width - 4, e.y, 4, e.height);
        arch.lineStyle(2, this.direction.accent, 0.95);
        arch.lineBetween(x + 1, e.y, x + width - 1, e.y);
        arch.lineStyle(2, this.direction.matte);
        arch.lineBetween(
          x + 8,
          e.y + e.height - 3,
          x + width - 8,
          e.y + e.height - 3,
        );
        arch.lineStyle(2, this.direction.matte);
        const cx = e.x + e.width / 2,
          cy = e.y + e.height * 0.45;
        arch.lineBetween(cx - 8, cy, cx + 8, cy);
        arch.lineBetween(cx + 2, cy - 6, cx + 8, cy);
        arch.lineBetween(cx + 2, cy + 6, cx + 8, cy);
      } else {
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
    }
    const zone = this.add.zone(
      e.x + e.width / 2,
      e.y + e.height / 2,
      e.width * (sourceTarget ? 1 : 0.55),
      e.height,
    );
    this.physics.add.existing(zone, true);
    this.physics.add.overlap(this.player, zone, () => {
      if (!this.isPlaying || this.state.completed) return;
      if (this.definition.gameplay?.movement === "roam" && !this.roamEngaged)
        return;
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
      if (sourceTarget) this.drawSourceCue(e, true);
      this.soundtrack.cue("finish");
      this.ring(this.player.x, this.player.y, 0xffe3a3, 160);
      this.burst(
        this.player.x,
        this.player.y - 40,
        this.creativeArtwork ? this.direction.accent : 0xd7b6dc,
        this.creativeArtwork ? 12 : 28,
      );
      this.hooks.onMoment("A little adventure, made yours.");
      this.report();
    });
  }

  private openLever(id: string, instant = false) {
    const lever = this.levers.get(id);
    if (!lever || (!instant && this.state.activated.includes(id))) return;
    const gate = this.gates.get(lever.entity.targetId ?? "");
    if (
      !gate &&
      this.definition.gameplay?.movement !== "roam" &&
      this.definition.gameplay?.movement !== "discover"
    )
      return;
    if (!this.state.activated.includes(id)) this.state.activated.push(id);
    if (gate) {
      (gate.collider.body as Phaser.Physics.Arcade.StaticBody).enable = false;
      this.tweens.add({
        targets: gate.art,
        y: gate.art.y - 150,
        alpha: 0,
        duration: instant || this.reducedMotion ? 0 : 550,
        ease: "Cubic.easeIn",
      });
      const gateEntity = this.definition.entities.find(
        (entity) => entity.id === lever.entity.targetId,
      );
      if (
        gateEntity &&
        this.definition.gameplay?.movement === "roam" &&
        gateEntity.artSource &&
        !gateEntity.art
      )
        this.drawSourceCue(gateEntity, true);
    }
    const e = lever.entity;
    if (this.definition.gameplay?.movement === "roam" && e.artSource && !e.art)
      this.drawSourceCue(e, true);
    lever.handle.setTo(
      e.x + e.width / 2,
      e.y + e.height - 8,
      e.x + e.width - 6,
      e.y + 20,
    );
    lever.knob.setPosition(e.x + e.width - 6, e.y + 20);
    lever.originalArt?.setAngle(15);
    if (!instant) {
      this.burst(
        gate ? gate.art.x + 25 : e.x + e.width / 2,
        gate ? gate.art.y + 65 : e.y + e.height / 2,
        this.creativeArtwork ? this.direction.accent : 0xc9b6db,
        this.creativeArtwork ? 4 : 14,
      );
      this.soundtrack.cue("gate");
      this.ring(
        gate ? gate.art.x + 25 : e.x + e.width / 2,
        gate ? gate.art.y + 65 : e.y + e.height / 2,
        this.creativeArtwork ? this.direction.accent : 0xd4c2ff,
        50,
      );
      this.hooks.onMoment(
        gate
          ? `${objectName(this.definition, lever.entity.targetId)} opened by ${objectName(this.definition, id)}.`
          : `${objectName(this.definition, id)} activated.`,
      );
    }
    this.report();
  }

  /** Source-coordinate interactions stay on the original visible object. These
   * restrained corner marks never paint a replacement coin or lever over it. */
  private drawSourceCue(e: WorldEntity, found: boolean) {
    let g = this.sourceCues.get(e.id);
    if (!g) {
      g = this.add.graphics().setDepth(14);
      this.sourceCues.set(e.id, g);
    }
    g.clear().setAlpha(found ? 0.42 : 0.85);
    const length = Math.min(14, e.width / 4, e.height / 4);
    for (const [lineWidth, color, opacity] of [
      [4, this.direction.ink, 0.9],
      [1.5, this.direction.accent, 1],
    ]) {
      g.lineStyle(lineWidth, color, opacity);
      for (const [x, y, dx, dy] of [
        [e.x, e.y, 1, 1],
        [e.x + e.width, e.y, -1, 1],
        [e.x, e.y + e.height, 1, -1],
        [e.x + e.width, e.y + e.height, -1, -1],
      ]) {
        g.lineBetween(x, y + dy * length, x, y);
        g.lineBetween(x, y, x + dx * length, y);
      }
    }
  }

  private burst(x: number, y: number, color: number, count: number) {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (
      this.creativeArtwork &&
      (this.definition.gameplay?.movement ?? "platform") === "platform"
    )
      return;
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
    if (
      this.creativeArtwork &&
      (this.definition.gameplay?.movement ?? "platform") === "platform"
    ) {
      if (!strong) return;
      const contact = this.add
        .ellipse(
          x,
          y,
          Math.min(32, this.heroVisualWidth * 0.7),
          3,
          this.direction.matte,
          0.28,
        )
        .setDepth(19);
      this.tweens.add({
        targets: contact,
        scaleX: 1.5,
        alpha: 0,
        duration: 220,
        onComplete: () => contact.destroy(),
      });
      return;
    }
    for (
      let i = 0;
      i < (this.creativeArtwork ? (strong ? 3 : 1) : strong ? 7 : 2);
      i++
    ) {
      const dust = this.add
        .ellipse(
          x,
          y,
          9 + i * 2,
          4,
          this.creativeArtwork ? this.direction.accent : 0xe8ddba,
          this.creativeArtwork ? 0.18 : 0.35,
        )
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
    if (Number.isFinite(width) && width > 0) this.viewportWidth = width;
    if (this.resourcesReleased) return;
    const camera = this.cameras?.main;
    if (!camera) return;
    width = this.viewportWidth || camera.width;
    if (this.definition.gameplay?.movement === "discover") {
      this.applyDiscoveryView();
      return;
    }
    if (overview) {
      camera
        .removeBounds()
        .setZoom(
          Math.min(
            camera.width / this.definition.width,
            camera.height / this.definition.height,
          ),
        );
      camera.centerOn(this.definition.width / 2, this.definition.height / 2);
      if (this.definition.gameplay?.movement === "roam" && this.player)
        this.updateRoamVisuals(0);
      return;
    }
    if (!this.player) return;
    camera.setZoom(
      Math.max(
        width / (width < 600 ? 720 : 1280),
        camera.height / this.definition.height,
      ),
    );
    camera.setBounds(0, 0, this.definition.width, this.definition.height);
    const target = camera.getScroll(
      this.player.x,
      this.definition.gameplay?.movement === "roam"
        ? this.player.y
        : this.player.y + this.heroHeight / 2 + 100 - camera.displayHeight / 2,
    );
    camera.setScroll(target.x, target.y);
    if (this.definition.gameplay?.movement === "roam")
      this.updateRoamVisuals(0);
  }

  setPlaying(playing: boolean) {
    if (this.resourcesReleased) return;
    if (this.artworkFailed) {
      this.isPlaying = false;
      this.physics?.world?.pause();
      this.soundtrack.close();
      return;
    }
    this.isPlaying = playing;
    if (playing && this.actorIntro && !this.actorIntroStarted) {
      this.actorIntroStarted = true;
      this.time.delayedCall(2400, () => {
        if (this.reducedMotion) this.actorIntro?.setVisible(false);
        else if (this.actorIntro)
          this.tweens.add({
            targets: this.actorIntro,
            alpha: 0,
            duration: 220,
          });
      });
    }
    if (!playing) this.clearRoamTarget();
    this.soundtrack.setState(
      playing || (this.state.completed && !this.state.exploring),
      this.muted,
    );
    if (!this.physics?.world) return;
    playing ? this.physics.world.resume() : this.physics.world.pause();
    if (!playing) {
      for (const key of Object.keys(this.controls) as (keyof WorldControls)[])
        this.controls[key] = false;
      this.input?.keyboard?.resetKeys();
      this.jumpQueued = -1000;
      this.jumpHeld = false;
      this.previousTouchJump = false;
      this.previousTouchInteract = false;
    }
    if (!playing && this.player?.body)
      if (this.definition.gameplay?.movement === "roam")
        (this.player.body as Phaser.Physics.Arcade.Body)
          .setAcceleration(0, 0)
          .setVelocity(0, 0);
      else
        (this.player.body as Phaser.Physics.Arcade.Body)
          .setAccelerationX(0)
          .setVelocityX(0);
  }
  setMuted(muted: boolean) {
    this.muted = muted;
    if (this.resourcesReleased) return;
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
    if (!this.sceneCreated || this.resourcesReleased) return this.snapshot();
    this.state.exploring = true;
    this.report();
    return this.snapshot();
  }
  snapshot(): PlayState {
    if (this.definition.gameplay?.movement === "discover")
      return {
        ...structuredClone(this.sceneCreated ? this.state : this.initial),
        player: null,
      };
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
    if (!this.player) return undefined;
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
    if (!this.player && this.definition.gameplay?.movement !== "discover")
      return;
    const state = this.snapshot();
    const nearby = this.nearestLever();
    const objective = goalProgress(this.definition, state);
    const clue =
      this.definition.gameplay?.movement === "discover"
        ? this.nextDiscoveryClue()?.text
        : undefined;
    this.hooks.onUpdate(state, {
      collected: state.collected.length,
      total: this.definition.entities.filter((e) => e.kind === "coin").length,
      completed: state.completed,
      exploring: Boolean(state.exploring),
      nearLever: Boolean(nearby),
      interactionHint:
        clue ??
        (nearby
          ? nearby.entity.targetId
            ? `Use ${objectName(this.definition, nearby.entity.id)} · opens ${objectName(this.definition, nearby.entity.targetId)}`
            : `Activate ${objectName(this.definition, nearby.entity.id)}`
          : ""),
      goalHint: clue ?? objective.hint,
      requiredDone: objective.done,
      requiredTotal: objective.total,
      playerX: this.player?.x ?? 0,
      playerY: this.player?.y ?? 0,
    });
  }

  private clearRoamTarget() {
    this.roamTarget = undefined;
    this.roamTrack.stalledMs = 0;
    this.roamMarker?.setVisible(false);
  }

  private createRoamNavigation() {
    this.roamFocus = this.add.graphics().setDepth(22);
    this.roamFocus.lineStyle(5, this.direction.ink, 0.95);
    this.roamFocus.strokeCircle(0, 0, 20);
    this.roamFocus.lineStyle(1.5, this.direction.surface, 1);
    this.roamFocus.strokeCircle(0, 0, 20);
    this.roamFocus.fillStyle(this.direction.ink, 0.95);
    this.roamFocus.fillTriangle(21, -5, 29, 0, 21, 5);
    this.roamFocus.lineStyle(1.5, this.direction.surface, 1);
    this.roamFocus.lineBetween(22, -4, 28, 0);
    this.roamFocus.lineBetween(28, 0, 22, 4);
    this.roamMarker = this.add.graphics().setDepth(23).setVisible(false);
    this.roamMarker.lineStyle(4, this.direction.ink, 0.95);
    this.roamMarker.strokeCircle(0, 0, 8);
    this.roamMarker.lineStyle(1.5, this.direction.surface, 1);
    this.roamMarker.strokeCircle(0, 0, 8);
    this.roamMarker.fillStyle(this.direction.accent, 1);
    this.roamMarker.fillCircle(0, 0, 2);
    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      if (this.isPlaying)
        this.roamTap = { id: pointer.id, x: pointer.x, y: pointer.y };
    });
    this.input.on("pointerupoutside", () => {
      this.roamTap = undefined;
    });
    this.input.on("pointerup", (pointer: Phaser.Input.Pointer) => {
      const tap = this.roamTap;
      this.roamTap = undefined;
      if (
        !tap ||
        tap.id !== pointer.id ||
        Math.hypot(pointer.x - tap.x, pointer.y - tap.y) > 8 ||
        !this.isPlaying ||
        (this.state.completed && !this.state.exploring) ||
        this.time.now - this.lastRoamAction < 40
      )
        return;
      const point = pointer.positionToCamera(
        this.cameras.main,
      ) as Phaser.Math.Vector2;
      if (
        point.x < 0 ||
        point.y < 0 ||
        point.x > this.definition.width ||
        point.y > this.definition.height
      )
        return;
      this.roamTarget = { x: point.x, y: point.y };
      this.roamEngaged = true;
      this.roamTrack = { x: this.player.x, y: this.player.y, stalledMs: 0 };
      this.roamMarker?.setPosition(point.x, point.y).setVisible(true);
    });
    this.updateRoamVisuals(0);
  }

  private updateRoamVisuals(time: number) {
    const zoom = Math.max(0.001, this.cameras.main.zoom);
    // Only an openly generated explorer receives a minimum display footprint.
    // Actual source subject pixels retain their chosen dimensions and aspect.
    const visualScale = this.sourceHero
      ? 1
      : Math.max(
          1,
          36 / zoom / Math.max(this.heroVisualWidth, this.heroVisualHeight),
        );
    const width = this.heroVisualWidth * visualScale,
      height = this.heroVisualHeight * visualScale;
    this.heroArt
      .setPosition(this.player.x, this.player.y + height / 2)
      .setDisplaySize(width, height)
      .setAngle(0)
      .setFlipX(false);
    this.heroFrame?.setPosition(this.heroArt.x, this.heroArt.y);
    this.updateActorIntro();
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    const moving = Math.hypot(body.velocity.x, body.velocity.y) > 15;
    const angle = moving
      ? Math.atan2(body.velocity.y, body.velocity.x)
      : (this.roamFocus?.rotation ?? 0);
    this.roamFocus
      ?.setPosition(this.player.x, this.player.y)
      .setScale(1 / zoom)
      .setRotation(angle)
      .setAlpha(
        this.reducedMotion || !moving ? 0.9 : 0.88 + Math.sin(time / 180) * 0.1,
      );
    this.roamMarker?.setScale(1 / zoom);
  }

  private updateRoam(
    time: number,
    delta: number,
    body: Phaser.Physics.Arcade.Body,
  ) {
    if (this.state.completed && !this.state.exploring) {
      this.clearRoamTarget();
      body.setVelocity(0, 0);
      this.updateRoamVisuals(time);
      return;
    }
    const horizontal =
      Number(
        this.cursors.right.isDown || this.keys.D.isDown || this.controls.right,
      ) -
      Number(
        this.cursors.left.isDown || this.keys.A.isDown || this.controls.left,
      );
    const vertical =
      Number(
        this.cursors.down.isDown || this.keys.S.isDown || this.controls.down,
      ) -
      Number(this.cursors.up.isDown || this.keys.W.isDown || this.controls.up);
    if (horizontal || vertical) {
      this.roamEngaged = true;
      this.clearRoamTarget();
    }
    const length = Math.max(1, Math.hypot(horizontal, vertical));
    const blend = 1 - Math.exp(-delta / 85);
    let desired = {
      x: (horizontal / length) * 260,
      y: (vertical / length) * 260,
    };
    if (this.roamTarget) {
      const steering = roamSteering(this.player, this.roamTarget);
      desired = steering;
      const moved = Math.hypot(
        this.player.x - this.roamTrack.x,
        this.player.y - this.roamTrack.y,
      );
      this.roamTrack.stalledMs =
        moved < 0.15 && !steering.arrived
          ? this.roamTrack.stalledMs + Math.min(100, delta)
          : 0;
      this.roamTrack.x = this.player.x;
      this.roamTrack.y = this.player.y;
      if (steering.arrived || this.roamTrack.stalledMs > 400) {
        const blocked = !steering.arrived;
        this.clearRoamTarget();
        body.setVelocity(0, 0);
        desired = { x: 0, y: 0 };
        if (blocked)
          this.hooks.onMoment(
            "That path is blocked. Choose another point or steer around it.",
          );
      }
    }
    body.setVelocity(
      Phaser.Math.Linear(body.velocity.x, desired.x, blend),
      Phaser.Math.Linear(body.velocity.y, desired.y, blend),
    );
    this.updateRoamVisuals(time);
    if (
      Phaser.Input.Keyboard.JustDown(this.keys.E) ||
      (this.controls.interact && !this.previousTouchInteract)
    ) {
      const lever = this.nearestLever();
      if (lever) this.openLever(lever.entity.id);
    }
    this.previousTouchInteract = this.controls.interact;
    if (!this.overview) {
      const camera = this.cameras.main;
      const target = camera.getScroll(
        this.player.x,
        this.player.y,
        this.cameraTarget,
      );
      const follow = this.reducedMotion ? 1 : 1 - Math.exp(-delta / 180);
      camera.setScroll(
        Phaser.Math.Linear(camera.scrollX, target.x, follow),
        Phaser.Math.Linear(camera.scrollY, target.y, follow),
      );
    }
    this.updateLeverCue();
    if (time - this.lastReport > 250) {
      this.lastReport = time;
      this.report();
    }
  }

  update(time: number, delta: number) {
    if (this.definition.gameplay?.movement === "discover") {
      if (this.isPlaying) this.soundtrack.tick(time);
      return;
    }
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
      if (this.definition.gameplay?.movement === "roam") body.setVelocity(0, 0);
      return;
    }
    if (this.definition.gameplay?.movement === "roam") {
      this.updateRoam(time, delta, body);
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
    if (!this.reducedMotion && !this.sourceHero && !this.creativeArtwork) {
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
      .setPosition(
        this.player.x,
        (this.creativeArtwork
          ? body.bottom
          : this.player.y + this.heroHeight / 2) + bob,
      )
      .setDisplaySize(
        this.heroVisualWidth * this.poseX,
        this.heroVisualHeight * this.poseY,
      )
      .setFlipX(this.sourceHero ? false : this.player.flipX)
      .setAngle(
        this.reducedMotion || this.sourceHero || this.creativeArtwork
          ? 0
          : Phaser.Math.Clamp(body.velocity.x / (grounded ? 95 : 55), -7, 7),
      );
    this.heroFocus
      ?.setPosition(this.player.x, body.bottom + 2)
      .setAlpha(grounded ? 0.8 : 0.45);
    this.heroFrame?.setPosition(this.heroArt.x, this.heroArt.y);
    this.updateActorIntro();
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
    if (!this.overview) {
      const camera = this.cameras.main;
      const lookAhead = this.reducedMotion
        ? 0
        : Phaser.Math.Clamp(body.velocity.x * 0.35, -105, 105);
      const target = camera.getScroll(
        this.player.x + lookAhead,
        this.player.y + this.heroHeight / 2 + 110 - camera.displayHeight / 2,
        this.cameraTarget,
      );
      if (this.reducedMotion) camera.setScroll(target.x, target.y);
      else {
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
    }
    this.wasGrounded = grounded;
    this.lastVerticalSpeed = body.velocity.y;
    this.updateLeverCue();
    if (time - this.lastReport > 250) {
      this.lastReport = time;
      this.report();
    }
  }

  private updateLeverCue() {
    const lever = this.nearestLever();
    this.hint.setVisible(Boolean(lever));
    if (lever) {
      const view = sceneView(this.cameras.main);
      const wrap = Math.max(80, Math.min(250, Math.floor(view.width - 48)));
      if (wrap !== this.hintWrapWidth) {
        this.hintWrapWidth = wrap;
        this.hint.setWordWrapWidth(wrap, true);
      }
      if (this.hintLeverId !== lever.entity.id) {
        this.hintLeverId = lever.entity.id;
        this.hint.setText(
          lever.entity.targetId
            ? `E · Use ${objectName(this.definition, lever.entity.id, 30)}\nOpens ${objectName(this.definition, lever.entity.targetId, 30)}`
            : `E · Activate ${objectName(this.definition, lever.entity.id, 30)}`,
        );
      }
      // Keep the external cue inside the usable world; original cutout pixels stay untouched.
      this.hint.setPosition(
        Phaser.Math.Clamp(
          lever.entity.x + lever.entity.width / 2,
          Math.max(0, view.x) + this.hint.width / 2 + 8,
          Math.min(this.definition.width, view.x + view.width) -
            this.hint.width / 2 -
            8,
        ),
        Phaser.Math.Clamp(
          lever.entity.y - this.hint.height / 2 - 12,
          Math.max(0, view.y) + this.hint.height / 2 + 8,
          Math.min(this.definition.height, view.y + view.height) -
            this.hint.height / 2 -
            8,
        ),
      );
    }
  }
}
