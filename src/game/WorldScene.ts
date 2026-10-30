import Phaser from "phaser";
import {
  emptyPlayState,
  type PlayState,
  type WorldDefinition,
  type WorldEntity,
} from "../../shared/world";

export interface WorldTelemetry {
  collected: number;
  total: number;
  completed: boolean;
  nearLever: boolean;
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
}
const palettes = {
  grove: {
    sky: "#f2f0df",
    haze: "#e8e6dd",
    far: "#d8decb",
    middle: "#b9c7ad",
    near: "#8fa989",
    land: "#e5d7b4",
    edge: "#79866a",
    leaf: "#a8bb8f",
    ink: "#62664e",
  },
  moon: {
    sky: "#ece9f4",
    haze: "#e6e0ef",
    far: "#d3cde2",
    middle: "#b6b1d1",
    near: "#9997bc",
    land: "#dbd4e5",
    edge: "#8881a2",
    leaf: "#b7afd0",
    ink: "#68617b",
  },
  sunset: {
    sky: "#faecd9",
    haze: "#f2dfd2",
    far: "#ead5bc",
    middle: "#d7bca4",
    near: "#b9907e",
    land: "#e6cfb3",
    edge: "#a77e66",
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
    }
  >();
  private hint!: Phaser.GameObjects.Text;
  private lastGrounded = -1000;
  private jumpQueued = -1000;
  private lastReport = 0;
  private previousTouchJump = false;
  private previousTouchInteract = false;
  private spawn = { x: 0, y: 0 };
  private isPlaying = false;
  private muted = true;
  private audioContext: AudioContext | null = null;
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
    this.initial = initial ?? emptyPlayState();
    this.hooks = hooks;
  }

  preload() {
    for (const e of this.definition.entities)
      if (e.art) {
        if (e.art.endsWith(".svg"))
          this.load.svg(`art-${e.id}`, e.art, {
            width: Math.ceil(e.width * 3),
            height: Math.ceil(e.height * 3),
          });
        else this.load.image(`art-${e.id}`, e.art);
      }
  }

  create() {
    this.state = structuredClone(this.initial);
    this.physics.world.setBounds(0, -200, 1440, 1200);
    this.createLandscape();
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
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    const frame = this.player.frame;
    body
      .setSize(frame.width * 0.66, frame.height * 0.69)
      .setOffset(frame.width * 0.17, frame.height * 0.24);
    body.setDragX(1900).setMaxVelocity(310, 1000).setCollideWorldBounds(false);
    this.physics.add.collider(this.player, terrain);
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
        fontFamily: "Avenir Next, sans-serif",
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
    this.report();
    this.hooks.onReady(this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.audioContext?.close();
    });
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

  private createLandscape() {
    const p = palettes[this.definition.theme];
    const texture = this.textures.createCanvas("world-backdrop", 1440, 820)!;
    const ctx = texture.context;
    const grad = ctx.createLinearGradient(0, 0, 0, 820);
    grad.addColorStop(0, p.sky);
    grad.addColorStop(1, "#f8f3e5");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 1440, 820);
    ctx.fillStyle = this.definition.theme === "moon" ? "#faf5e0" : "#f1d99b";
    ctx.beginPath();
    ctx.arc(1120, 175, 76, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ffffff30";
    ctx.beginPath();
    ctx.arc(1120, 175, 104, 0, Math.PI * 2);
    ctx.fill();
    const hills = [
      { y: 460, color: p.far, amp: 70 },
      { y: 540, color: p.middle, amp: 100 },
      { y: 640, color: p.near, amp: 72 },
    ];
    hills.forEach((hill, layer) => {
      ctx.beginPath();
      ctx.moveTo(-20, 820);
      ctx.lineTo(-20, hill.y);
      for (let x = 0; x <= 1480; x += 12)
        ctx.lineTo(
          x,
          hill.y +
            Math.sin(x / (170 + layer * 70) + layer * 2) * hill.amp +
            Math.cos(x / 95) * 12,
        );
      ctx.lineTo(1480, 820);
      ctx.closePath();
      ctx.fillStyle = hill.color;
      ctx.fill();
    });
    for (let i = 0; i < 2700; i++) {
      ctx.fillStyle = i % 2 ? "#ffffff13" : "#413b3410";
      const x = (i * 237.71) % 1440,
        y = (i * 91.37) % 820;
      ctx.fillRect(x, y, 1.5, 1.5);
    }
    for (const [x, y, size] of [
      [100, 500, 1.15],
      [800, 560, 0.85],
      [1360, 520, 1.0],
    ]) {
      ctx.strokeStyle = p.ink;
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(x, y + 180 * size);
      ctx.quadraticCurveTo(
        x - 10 * size,
        y + 90 * size,
        x + 5 * size,
        y + 30 * size,
      );
      ctx.stroke();
      for (let k = 0; k < 7; k++) {
        ctx.fillStyle = k % 2 ? p.leaf : p.middle;
        ctx.beginPath();
        ctx.ellipse(
          x + Math.sin(k * 2.4) * 50 * size,
          y + 26 * size + Math.cos(k * 2.2) * 43 * size,
          49 * size,
          55 * size,
          k,
          0,
          Math.PI * 2,
        );
        ctx.fill();
      }
    }
    texture.refresh();
    this.add.image(720, 410, "world-backdrop").setDepth(0);
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (!reduced)
      for (let i = 0; i < 10; i++) {
        const dot = this.add
          .ellipse(
            (i * 157) % 1440,
            210 + ((i * 59) % 350),
            4 + (i % 3),
            7,
            0xfaf3cd,
            0.65,
          )
          .setDepth(5);
        this.tweens.add({
          targets: dot,
          x: dot.x + 35,
          y: dot.y - 28,
          alpha: 0.15,
          duration: 2400 + i * 330,
          yoyo: true,
          repeat: -1,
          delay: i * 170,
          ease: "Sine.easeInOut",
        });
      }
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
    this.gates.set(e.id, { collider, art });
  }

  private createCoin(e: WorldEntity) {
    if (this.state.collected.includes(e.id)) return;
    const coin = this.physics.add
      .staticSprite(e.x + e.width / 2, e.y + e.height / 2, `art-${e.id}`)
      .setDisplaySize(e.width, e.height)
      .setDepth(15);
    (coin.body as Phaser.Physics.Arcade.StaticBody)
      .setSize(e.width, e.height)
      .updateFromGameObject();
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
      this.physics.world.disable(coin);
      this.tweens.killTweensOf(coin);
      this.tweens.add({
        targets: coin,
        y: coin.y - 35,
        alpha: 0,
        scale: coin.scaleX * 1.5,
        duration: 300,
        onComplete: () => coin.destroy(),
      });
      this.burst(coin.x, coin.y, 0xf3da8e, 9);
      this.tone(640 + this.state.collected.length * 130);
      this.report();
      if (
        this.state.collected.length ===
        this.definition.entities.filter((e) => e.kind === "coin").length
      )
        this.hooks.onMoment("Every sunseed found. Now, find your way home.");
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
      if (this.isPlaying && Math.abs(this.player.x - e.x) < 160)
        this.openLever(e.id);
    });
    this.levers.set(e.id, { entity: e, handle, knob });
  }

  private createGoal(e: WorldEntity) {
    if (e.art)
      this.add
        .image(e.x + e.width / 2, e.y + e.height / 2, `art-${e.id}`)
        .setDisplaySize(e.width, e.height)
        .setDepth(11);
    const zone = this.add.zone(
      e.x + e.width / 2,
      e.y + e.height / 2,
      e.width * 0.55,
      e.height,
    );
    this.physics.add.existing(zone, true);
    this.physics.add.overlap(this.player, zone, () => {
      if (this.state.completed) return;
      this.state.completed = true;
      this.tone(880);
      this.time.delayedCall(180, () => this.tone(1100));
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
      duration: instant ? 0 : 550,
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
    if (!instant) {
      this.burst(gate.art.x + 25, gate.art.y + 65, 0xc9b6db, 14);
      this.tone(440);
      this.hooks.onMoment("Your lever woke the gate. Home is just ahead.");
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

  private tone(frequency: number) {
    if (this.muted) return;
    try {
      this.audioContext ??= new AudioContext();
      void this.audioContext.resume();
      const oscillator = this.audioContext.createOscillator();
      const gain = this.audioContext.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.035, this.audioContext.currentTime);
      gain.gain.exponentialRampToValueAtTime(
        0.001,
        this.audioContext.currentTime + 0.18,
      );
      oscillator.connect(gain);
      gain.connect(this.audioContext.destination);
      oscillator.start();
      oscillator.stop(this.audioContext.currentTime + 0.2);
    } catch {
      /* Visual feedback remains available. */
    }
  }

  setPlaying(playing: boolean) {
    this.isPlaying = playing;
    if (!this.physics?.world) return;
    playing ? this.physics.world.resume() : this.physics.world.pause();
    if (!playing && this.player?.body)
      (this.player.body as Phaser.Physics.Arcade.Body)
        .setAccelerationX(0)
        .setVelocityX(0);
  }
  setMuted(muted: boolean) {
    this.muted = muted;
  }
  snapshot(): PlayState {
    return {
      ...structuredClone(this.state),
      player: this.player ? { x: this.player.x, y: this.player.y } : null,
    };
  }
  private report() {
    if (!this.player) return;
    const state = this.snapshot();
    const nearby = [...this.levers.values()].some(
      (l) =>
        !state.activated.includes(l.entity.id) &&
        Math.abs(this.player.x - l.entity.x) < 125,
    );
    this.hooks.onUpdate(state, {
      collected: state.collected.length,
      total: this.definition.entities.filter((e) => e.kind === "coin").length,
      completed: state.completed,
      nearLever: nearby,
      playerX: this.player.x,
      playerY: this.player.y,
    });
  }

  update(time: number) {
    if (!this.player || !this.cursors || !this.isPlaying) return;
    const typing = document.activeElement?.matches(
      'input, textarea, [contenteditable="true"]',
    );
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    if (typing) {
      body.setAccelerationX(0);
      return;
    }
    if (body.blocked.down || body.touching.down) this.lastGrounded = time;
    const left =
      this.cursors.left.isDown || this.keys.A.isDown || this.controls.left;
    const right =
      this.cursors.right.isDown || this.keys.D.isDown || this.controls.right;
    body.setAccelerationX(left ? -1850 : right ? 1850 : 0);
    // Tiny differences between drawn ground and bridge edges should not snag feet.
    if (body.blocked.down && ((right && body.blocked.right) || (left && body.blocked.left))) {
      const step = this.definition.entities.find(e => {
        if (e.kind !== 'terrain' && e.kind !== 'bridge') return false;
        const rise = body.bottom - e.y;
        const atEdge = right ? Math.abs(body.right - e.x) < 3 : Math.abs(body.left - e.x - e.width) < 3;
        return atEdge && rise > 0 && rise <= 10;
      });
      if (step) { this.player.y -= body.bottom - step.y + 1; body.updateFromGameObject(); }
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
      body.setVelocityY(-630);
      this.lastGrounded = -1000;
      this.jumpQueued = -1000;
      this.tone(260);
    }
    this.previousTouchJump = this.controls.jump;
    if (
      Phaser.Input.Keyboard.JustDown(this.keys.E) ||
      (this.controls.interact && !this.previousTouchInteract)
    ) {
      const lever = [...this.levers.values()].find(
        (l) =>
          !this.state.activated.includes(l.entity.id) &&
          Math.abs(this.player.x - l.entity.x) < 125,
      );
      if (lever) this.openLever(lever.entity.id);
    }
    this.previousTouchInteract = this.controls.interact;
    this.player.setAngle(
      body.blocked.down
        ? Phaser.Math.Clamp(body.velocity.x / 70, -4, 4)
        : Phaser.Math.Clamp(body.velocity.x / 40, -7, 7),
    );
    this.player.x = Phaser.Math.Clamp(this.player.x, 25, 1415);
    if (this.player.y > 930) {
      this.player.setPosition(this.spawn.x, this.spawn.y);
      body.setVelocity(0);
      this.hooks.onMoment("Back on your feet. Your sunseeds are still yours.");
    }
    this.shadow
      .setPosition(this.player.x, Math.min(this.player.y + 51, 692))
      .setAlpha(body.blocked.down ? 0.13 : 0.045)
      .setScale(body.blocked.down ? 1 : 0.65, 1);
    const lever = [...this.levers.values()].find(
      (l) =>
        !this.state.activated.includes(l.entity.id) &&
        Math.abs(this.player.x - l.entity.x) < 125,
    );
    this.hint.setVisible(Boolean(lever));
    if (lever) this.hint.setPosition(lever.entity.x + 25, lever.entity.y - 38);
    if (time - this.lastReport > 250) {
      this.lastReport = time;
      this.report();
    }
  }
}
