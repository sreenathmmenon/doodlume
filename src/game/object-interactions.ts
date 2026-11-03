import Phaser from "phaser";
import { availableInteractions, interactionState, reduceInteraction } from "../../shared/interactions";
import type { PlayState, WorldDefinition, WorldEntity } from "../../shared/world";
import { isSourceAlignedScenery, isSourceBackdrop, sourceLayerArtworkBounds } from "../../shared/source-scenery";

interface InteractionHost {
  state(): PlayState;
  change(state: PlayState): void;
  player(): { x: number; y: number; flipX?: boolean } | undefined;
  playing(): boolean;
  approach(point: { x: number; y: number }): void;
  moment(message: string): void;
  feedback(kind: "pickup" | "transfer" | "attach" | "use" | "drop"): void;
}

/** Deterministic interactions use the real world objects; this layer only owns
 * proximity, source-art placement and immediate feedback. No scene dispatch. */
export class ObjectInteractions {
  private art = new Map<string, Phaser.GameObjects.Image>();
  private marks: Phaser.GameObjects.Graphics;
  private focus: Phaser.GameObjects.Graphics;
  private prompt: Phaser.GameObjects.Text;
  private e?: Phaser.Input.Keyboard.Key;
  private q?: Phaser.Input.Keyboard.Key;
  private pending = "";
  private queuedUse = false;
  private queuedReturn = false;
  private hover = "";
  private lastNotice = -10000;
  private tap?: { x: number; y: number; id: number };

  constructor(
    private scene: Phaser.Scene,
    private world: WorldDefinition,
    private host: InteractionHost,
    private reducedMotion: boolean,
  ) {
    this.marks = scene.add.graphics().setDepth(24);
    this.focus = scene.add.graphics().setDepth(25);
    this.prompt = scene.add.text(0, 0, "", {
      fontFamily: "Manrope, sans-serif", fontSize: "14px", color: "#ffffff",
      backgroundColor: "#253340", padding: { x: 12, y: 8 }, align: "center",
      wordWrap: { width: 260, useAdvancedWrap: true },
    }).setOrigin(0.5, 1).setDepth(40).setVisible(false);
    this.e = scene.input.keyboard?.addKey("E");
    this.q = scene.input.keyboard?.addKey("Q");
    // Browser automation and quick taps can release a key between Phaser frames.
    // Keep one press until the next update; holding a key never repeats an action.
    const queueUse = (_key: Phaser.Input.Keyboard.Key, event?: KeyboardEvent) => {
      if (!event?.repeat && this.host.playing()) this.queuedUse = true;
    };
    const queueReturn = (_key: Phaser.Input.Keyboard.Key, event?: KeyboardEvent) => {
      if (!event?.repeat && this.host.playing()) this.queuedReturn = true;
    };
    this.e?.on("down", queueUse);
    this.q?.on("down", queueReturn);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.e?.off("down", queueUse);
      this.q?.off("down", queueReturn);
    });
    const backdrop = world.entities.find(e => e.kind === "decoration" && isSourceBackdrop(e));
    for (const object of world.interactions?.objects ?? []) {
      const entity = this.entity(object.entityId);
      if (!entity?.art || entity.kind !== "decoration") continue;
      // Unmoved source objects are already present in the prepared backdrop.
      // Only extracted layers get a second image that can be carried/attached.
      if (entity.artSource && !entity.sourceLayer && isSourceAlignedScenery(backdrop)) continue;
      const box = entity.sourceLayer && backdrop ? sourceLayerArtworkBounds(entity, backdrop) : entity;
      const image = scene.add.image(box.x + box.width / 2, box.y + box.height / 2, `art-${entity.id}`)
        .setDisplaySize(box.width, box.height).setDepth(16);
      image.setData("home", { x: image.x, y: image.y, width: image.displayWidth, height: image.displayHeight });
      this.art.set(entity.id, image);
    }
    scene.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      this.tap = { x: pointer.x, y: pointer.y, id: pointer.id };
    });
    scene.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
      const point = pointer.positionToCamera(scene.cameras.main) as Phaser.Math.Vector2;
      this.hover = this.objectAt(point)?.id ?? "";
    });
    scene.input.on("pointerup", (pointer: Phaser.Input.Pointer) => {
      const tap = this.tap;
      this.tap = undefined;
      if (!tap || tap.id !== pointer.id || Math.hypot(tap.x - pointer.x, tap.y - pointer.y) > 8) return;
      const point = pointer.positionToCamera(scene.cameras.main) as Phaser.Math.Vector2;
      const entity = this.objectAt(point);
      if (entity) this.interact(entity.id);
    });
    scene.input.on(Phaser.Input.Events.GAME_OUT, () => { this.hover = ""; this.tap = undefined; });
    this.render();
  }

  private entity(id: string) { return this.world.entities.find(e => e.id === id); }
  private point(entity: WorldEntity) {
    if (entity.kind === "player" && this.host.player()) return this.host.player()!;
    const art = this.art.get(entity.id);
    return art ? { x: art.x, y: art.y } : { x: entity.x + entity.width / 2, y: entity.y + entity.height / 2 };
  }
  private size(entity: WorldEntity) {
    const art = this.art.get(entity.id);
    return art ? { width: art.displayWidth, height: art.displayHeight } : entity;
  }
  private distance(entity: WorldEntity) {
    const player = this.host.player();
    if (!player || entity.kind === "player") return 0;
    const point = this.point(entity), size = this.size(entity);
    return Math.hypot(Math.max(0, Math.abs(player.x - point.x) - size.width / 2), Math.max(0, Math.abs(player.y - point.y) - size.height / 2));
  }
  private objectAt(point: { x: number; y: number }) {
    return (this.world.interactions?.objects ?? [])
      .map(o => this.entity(o.entityId)).filter((e): e is WorldEntity => Boolean(e))
      .filter(e => {
        const p = this.point(e), size = this.size(e);
        return Math.abs(point.x - p.x) <= size.width / 2 + 12 && Math.abs(point.y - p.y) <= size.height / 2 + 12;
      }).sort((a, b) => a.width * a.height - b.width * b.height)[0];
  }
  containsPoint(point: { x: number; y: number }) { return Boolean(this.objectAt(point)); }

  private choice(
    entity: WorldEntity,
    state = interactionState(this.world, this.host.state()),
    actions = availableInteractions(this.world, this.host.state()),
  ) {
    const action = actions.find(action => action.targetId === entity.id);
    if (action) return { entity, action, label: action.label };
    const object = this.world.interactions?.objects.find(o => o.entityId === entity.id);
    if (object?.carryable && !state.heldEntityId && !state.attachments[entity.id])
      return { entity, action: undefined, label: `Take ${entity.label || "object"}` };
    return undefined;
  }

  context() {
    const state = interactionState(this.world, this.host.state());
    const actions = availableInteractions(this.world, this.host.state());
    const nearby = (this.world.interactions?.objects ?? [])
      .map(o => this.entity(o.entityId)).filter((e): e is WorldEntity => Boolean(e))
      .filter(e => this.distance(e) <= 100)
      .map(e => this.choice(e, state, actions)).filter((c): c is NonNullable<typeof c> => Boolean(c))
      .sort((a, b) => Number(Boolean(b.action)) - Number(Boolean(a.action)) || this.distance(a.entity) - this.distance(b.entity))[0];
    return { heldEntityId: state.heldEntityId, label: nearby?.label ?? "", nearby };
  }

  interact(id: string) {
    if (!this.host.playing()) return false;
    const entity = this.entity(id);
    if (!entity || !this.world.interactions?.objects.some(o => o.entityId === id)) return false;
    if (this.distance(entity) > 100) {
      if (this.world.gameplay?.movement === "roam") {
        this.pending = id;
        this.host.approach(this.point(entity));
      } else this.notice("Move closer.");
      return true;
    }
    this.pending = "";
    const choice = this.choice(entity);
    if (!choice) {
      const held = interactionState(this.world, this.host.state()).heldEntityId;
      const action = this.world.interactions.actions.find(a => a.toolId === held && a.targetId === id);
      if (action) {
        const attempt = reduceInteraction(this.world, this.host.state(), { type: "perform", actionId: action.id });
        this.notice(attempt.reason || "Already done.");
      } else this.notice(held ? "Try another object. Q puts this one back." : "Find something you can use here.");
      return true;
    }
    const result = reduceInteraction(this.world, this.host.state(), choice.action
      ? { type: "perform", actionId: choice.action.id }
      : { type: "pickup", entityId: id });
    if (!result.ok) { this.notice(result.reason || "Try another object."); return true; }
    this.host.change(result.state);
    if (result.event) {
      this.host.feedback(result.event.kind);
      if (choice.action) {
        this.pulse(entity);
        if (result.event.kind === "transfer" && result.event.toolId) this.transferTrail(result.event.toolId, entity);
        this.notice(`${choice.action.label} — done`, true);
      }
    }
    this.render();
    return true;
  }

  putBack() {
    const result = reduceInteraction(this.world, this.host.state(), { type: "drop" });
    if (!result.ok || !this.host.playing()) return;
    this.pending = "";
    this.host.change(result.state);
    this.host.feedback("drop");
    this.render();
  }

  private notice(message: string, force = false) {
    if (force || this.scene.time.now - this.lastNotice > 900) {
      this.lastNotice = this.scene.time.now;
      this.host.moment(message);
    }
  }
  private pulse(entity: WorldEntity) {
    const p = this.point(entity);
    const circle = this.scene.add.circle(p.x, p.y, Math.min(70, Math.max(entity.width, entity.height) / 2 + 12))
      .setStrokeStyle(3, 0x4fbea2, 0.9).setDepth(28);
    this.scene.tweens.add({ targets: circle, alpha: 0, scale: this.reducedMotion ? 1 : 1.25,
      duration: 420, onComplete: () => circle.destroy() });
  }
  private transferTrail(toolId: string, target: WorldEntity) {
    if (this.reducedMotion) return;
    const tool = this.entity(toolId);
    if (!tool) return;
    const from = this.point(tool), to = this.point(target);
    for (let i = 0; i < 4; i++) {
      const dot = this.scene.add.circle(from.x, from.y, 4, 0x42bca4).setDepth(29);
      this.scene.tweens.add({ targets: dot, x: to.x, y: to.y, alpha: 0.3,
        delay: i * 65, duration: 360, ease: "Sine.easeInOut", onComplete: () => dot.destroy() });
    }
  }

  tick() {
    this.render();
    const use = this.queuedUse, putBack = this.queuedReturn;
    this.queuedUse = false;
    this.queuedReturn = false;
    if (!this.host.playing() || document.activeElement?.matches('input, textarea, select, button, [contenteditable="true"]') || document.activeElement?.closest('[role="dialog"], dialog')) return;
    if (putBack) this.putBack();
    const context = this.context();
    if (context.nearby && use) {
      if (this.e) Phaser.Input.Keyboard.JustDown(this.e);
      this.interact(context.nearby.entity.id);
    }
    if (this.pending) {
      const pending = this.entity(this.pending);
      if (pending && this.distance(pending) <= 100) this.interact(pending.id);
    }
  }

  private render() {
    const state = interactionState(this.world, this.host.state());
    const player = this.host.player();
    const camera = this.scene.cameras.main;
    const unit = 1 / Math.max(0.1, camera.zoom);
    for (const [id, art] of this.art) {
      const home = art.getData("home") as { x: number; y: number; width: number; height: number };
      if (state.heldEntityId === id) {
        const heldScale = Math.min(1, 86 * unit / Math.max(home.width, home.height));
        art.setDisplaySize(home.width * heldScale, home.height * heldScale).setDepth(26);
        if (player) art.setPosition(player.x + (player.flipX ? -1 : 1) * 42, player.y - 34);
        else art.setPosition(camera.worldView.centerX, camera.worldView.bottom - 58 * unit);
      } else if (state.attachments[id]) {
        const target = this.entity(state.attachments[id]);
        if (!target) continue;
        const point = target.kind === "player" && player ? player : this.point(target);
        const scale = Math.min(1, Math.max(target.width, target.height) * 0.5 / Math.max(home.width, home.height));
        art.setDisplaySize(home.width * scale, home.height * scale).setPosition(point.x + target.width * 0.25, point.y + target.height * 0.2).setDepth(23);
      } else art.setPosition(home.x, home.y).setDisplaySize(home.width, home.height).setDepth(16);
    }
    this.marks.clear();
    this.focus.clear();
    for (const object of this.world.interactions?.objects ?? []) {
      if (!object.resource) continue;
      const entity = this.entity(object.entityId);
      if (!entity) continue;
      const point = this.point(entity), width = 40 * unit, height = 5 * unit;
      const x = point.x - width / 2, y = point.y + Math.min(entity.height / 2, 52) + 10 * unit;
      this.marks.fillStyle(0x1d3041, 0.85).fillRoundedRect(x - 2 * unit, y - 2 * unit, width + 4 * unit, height + 4 * unit, 4 * unit);
      const fraction = Math.max(0, Math.min(1, (state.quantities[entity.id] ?? 0) / object.resource.capacity));
      this.marks.fillStyle(0x5bd6bb, 1).fillRoundedRect(x, y, width * fraction, height, 2 * unit);
    }
    if (!this.host.playing()) { this.prompt.setVisible(false); return; }
    const context = this.context();
    const focused = (this.hover !== state.heldEntityId ? this.entity(this.hover) : undefined) ?? context.nearby?.entity;
    if (focused) {
      const point = this.point(focused);
      const size = this.size(focused);
      const radius = Math.max(16 * unit, Math.min(90, Math.max(size.width, size.height) / 2 + 8));
      this.focus.lineStyle(2 * unit, 0x254552, 0.8).strokeCircle(point.x, point.y, radius);
      this.focus.lineStyle(1 * unit, 0xf1faf5, 0.9).strokeCircle(point.x, point.y, radius + 2 * unit);
    }
    if (context.nearby) {
      const point = this.point(context.nearby.entity);
      this.prompt.setText(`E  ${context.label}`).setScale(unit).setPosition(
        Phaser.Math.Clamp(point.x, camera.worldView.left + 100 * unit, camera.worldView.right - 100 * unit),
        Math.max(camera.worldView.top + 45 * unit, point.y - Math.min(70, context.nearby.entity.height / 2) - 12 * unit),
      ).setVisible(true);
    } else this.prompt.setVisible(false);
  }
}
