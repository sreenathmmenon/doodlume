import Phaser from "phaser";
import { carriedArtworkPosition, attachedPlayerArtwork } from "./artwork-raster";
import { interactionMoveDestination } from "./interaction-move-geometry";
import { layoutResourceBadges } from "./resource-badge-layout";
import { objectName } from "../lib/object-name";
import type { InteractionAction } from "../../shared/interactions";
import { activeInteractionSource, selectInteractionSourceCommand, playerAvailableInteractions, interactionEffects, interactionState, reduceInteraction } from "../../shared/interactions";
import { canSelectInteractionSource, previewInteraction, inspectInteractionTarget, incompatibleTargetReason, interactionOutcomeMessage, type ActionPreview } from "../../shared/interaction-preview";
import type { PlayState, WorldDefinition, WorldEntity } from "../../shared/world";
import { isSourceAlignedScenery, isSourceBackdrop, sourceLayerArtworkBounds } from "../../shared/source-scenery";

const resourceNumber = new Intl.NumberFormat("en", {maximumSignificantDigits: 6});

interface InteractionHost {
  state(): PlayState;
  change(state: PlayState): void;
  settled(): void;
  player(): { x: number; y: number; flipX?: boolean; body?: {bottom:number} | null } | undefined;
  playerArtBounds?(): {x:number;y:number;width:number;height:number} | undefined;
  playing(): boolean;
  approach(point: { x: number; y: number }): void;
  stopApproach(): void;
  moment(message: string): void;
  feedback(kind: "pickup" | "selectSource" | "transfer" | "attach" | "use" | "place" | "operate" | "drop"): void;
}

/** Deterministic interactions use the real world objects; this layer only owns
 * proximity, source-art placement and immediate feedback. No scene dispatch. */
export class ObjectInteractions {
  private art = new Map<string, Phaser.GameObjects.Image>();
  private resourceLabels = new Map<string, Phaser.GameObjects.Text>();
  private marks: Phaser.GameObjects.Graphics;
  private focus: Phaser.GameObjects.Graphics;
  private destinationMark: Phaser.GameObjects.Graphics;
  private externalPreviewAction?: string;
  private prompt: Phaser.GameObjects.Text;
  private e?: Phaser.Input.Keyboard.Key;
  private q?: Phaser.Input.Keyboard.Key;
  private pending = "";
  private pendingActionId?: string;
  private queuedUse = false;
  private queuedReturn = false;
  private hover = "";
  private lastNotice = -10000;
  private displayedQuantities = new Map<string, number>();
  private movedObjects = new Map<string, { x: number; y: number; width: number; height: number; actionId: string }>();
  private lastRenderTime = 0;
  private pendingMotions = 0;
  private actionMenu?: Phaser.GameObjects.Container;
  private menuTarget = "";
  private menuOptions: { text: Phaser.GameObjects.Text; run: () => void; actionId?: string }[] = [];
  private menuIndex = 0;
  private menuInputConsumed = false;
  private hintTarget = "";
  private hintUntil = 0;
  private hintMark: Phaser.GameObjects.Graphics;
  private hintLabel: Phaser.GameObjects.Text;
  private tap?: { x: number; y: number; id: number };
  private inspectedKey = "";
  private inspectedActions: ActionPreview[] = [];

  constructor(
    private scene: Phaser.Scene,
    private world: WorldDefinition,
    private host: InteractionHost,
    private reducedMotion: boolean,
  ) {
    this.marks = scene.add.graphics().setDepth(24);
    this.focus = scene.add.graphics().setDepth(25);
    this.destinationMark = scene.add.graphics().setDepth(25);
    this.hintMark = scene.add.graphics().setDepth(41);
    this.hintLabel = scene.add.text(0, 0, "", {
      fontFamily: "Manrope, sans-serif", fontSize: "13px", color: "#ffffff",
      backgroundColor: "#264eb4", padding: { x: 10, y: 6 },
    }).setOrigin(0.5, 1).setDepth(42).setVisible(false);
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
    const navigateChoices = (event: KeyboardEvent) => {
      if (!this.actionMenu || !this.host.playing() || this.inputOutsideGame()) return;
      if (!["ArrowDown", "KeyS", "ArrowUp", "KeyW", "Enter", "NumpadEnter", "Escape", "KeyE"].includes(event.code)) return;
      event.preventDefault();
      if (event.repeat) return;
      this.menuInputConsumed = true;
      this.queuedUse = false;
      if (event.code === "Escape") this.closeChoices();
      else if (["Enter", "NumpadEnter", "KeyE"].includes(event.code)) this.menuOptions[this.menuIndex]?.run();
      else {
        const delta = ["ArrowUp", "KeyW"].includes(event.code) ? -1 : 1;
        this.menuIndex = (this.menuIndex + delta + this.menuOptions.length) % this.menuOptions.length;
        this.highlightChoice();
      }
    };
    scene.input.keyboard?.on("keydown", navigateChoices);
    const clearInspection = () => this.clearInspection();
    window.addEventListener("blur", clearInspection);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      window.removeEventListener("blur", clearInspection);
      this.e?.off("down", queueUse);
      this.q?.off("down", queueReturn);
      scene.input.keyboard?.off("keydown", navigateChoices);
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
        .setDisplaySize(box.width, box.height).setDepth(this.objectDepth(entity.id));
      image.setData("home", { x: image.x, y: image.y, width: image.displayWidth, height: image.displayHeight });
      this.art.set(entity.id, image);
    }
    for (const object of world.interactions?.objects ?? []) if (object.resource) {
      this.resourceLabels.set(object.entityId, scene.add.text(0, 0, "", {
        fontFamily: "Manrope, sans-serif", fontSize: "14px", fontStyle: "bold", color: "#253340",
      }).setOrigin(0.5, 0).setDepth(25));
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
      else { this.cancelApproach(); this.closeChoices(); }
    });
    scene.input.on(Phaser.Input.Events.GAME_OUT, () => { this.hover = ""; this.tap = undefined; });
    this.syncMoves(false);
    this.render();
  }

  private entity(id: string) { return this.world.entities.find(e => e.id === id); }
  private objectDepth(id: string) {
    return this.world.interactions?.objects.find(object => object.entityId === id)?.layer === "surface" ? 15 : 16;
  }
  private selectionDepth(id: string) { return this.art.get(id)?.depth ?? this.objectDepth(id); }
  private inspect(id: string) {
    const state = this.host.state();
    const key = JSON.stringify([id, state.interactions]);
    if (key !== this.inspectedKey) {
      this.inspectedKey = key;
      this.inspectedActions = inspectInteractionTarget(this.world, state, id);
    }
    return this.inspectedActions;
  }
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
    const state = interactionState(this.world, this.host.state());
    const actions = playerAvailableInteractions(this.world, this.host.state());
    let candidates = (this.world.interactions?.objects ?? [])
      .map(o => this.entity(o.entityId)).filter((e): e is WorldEntity => Boolean(e))
      // A fitted part must not block selecting the machine beneath it. Parts
      // remain independently selectable when they are themselves usable targets.
      .filter(e => !state.attachments[e.id] || actions.some(action => action.targetId === e.id))
      .filter(e => {
        const p = this.point(e), size = this.size(e);
        return Math.abs(point.x - p.x) <= size.width / 2 + 12 && Math.abs(point.y - p.y) <= size.height / 2 + 12;
      });
    // An explicit underlay should not steal the empty center of a pencil-drawn
    // chair or loop. Favor an ordinary prop's forgiving selection envelope;
    // the exposed underlay remains selectable around it or in Object controls.
    if (candidates.some(entity => this.selectionDepth(entity.id) >= 16))
      candidates = candidates.filter(entity => this.selectionDepth(entity.id) >= 16);
    // At an overlap, select the artwork the player actually sees. Transparent
    // parts of a cutout must not steal a click from the object underneath it.
    // Keep the forgiving bounds fallback for isolated thin pencil strokes.
    if (candidates.length > 1) {
      const visible = candidates.filter(entity => {
        const art = this.art.get(entity.id);
        if (!art) return true;
        const x = Math.floor((point.x - art.x + art.displayWidth / 2) / art.displayWidth * art.frame.width);
        const y = Math.floor((point.y - art.y + art.displayHeight / 2) / art.displayHeight * art.frame.height);
        return (this.scene.textures.getPixelAlpha(x, y, art.texture.key, art.frame.name) ?? 0) > 20;
      });
      if (visible.length) return visible.sort((a, b) =>
        this.selectionDepth(b.id) - this.selectionDepth(a.id) ||
        this.world.interactions!.objects.findIndex(object => object.entityId === b.id) -
        this.world.interactions!.objects.findIndex(object => object.entityId === a.id))[0];
    }
    return candidates.sort((a, b) => this.selectionDepth(b.id) - this.selectionDepth(a.id) || a.width * a.height - b.width * b.height)[0];
  }
  containsPoint(point: { x: number; y: number }) { return Boolean(this.objectAt(point)); }

  private choice(
    entity: WorldEntity,
    state = interactionState(this.world, this.host.state()),
    actions = playerAvailableInteractions(this.world, this.host.state()),
  ) {
    const action = actions.find(action => action.targetId === entity.id);
    if (action) return { entity, action, label: action.label };
    const object = this.world.interactions?.objects.find(o => o.entityId === entity.id);
    const activeSource = activeInteractionSource(state);
    const toolHasActionHere = activeSource && this.world.interactions?.actions.some(candidate =>
      candidate.toolId === activeSource && candidate.targetId === entity.id && !state.completed.includes(candidate.id));
    if (object && canSelectInteractionSource(this.world, this.host.state(), entity.id, state) && !toolHasActionHere)
      return { entity, action: undefined, label: `${object.usableInPlace ? "Select" : "Take"} ${objectName(this.world, entity.id, 28)}` };
    return undefined;
  }

  context() {
    const state = interactionState(this.world, this.host.state());
    if (this.hasPendingMotion() || (this.host.state().completed && !this.host.state().exploring)) return { heldEntityId: state.heldEntityId, label: "", nearby: undefined };
    const actions = playerAvailableInteractions(this.world, this.host.state());
    const nearby = (this.world.interactions?.objects ?? [])
      .map(o => this.entity(o.entityId)).filter((e): e is WorldEntity => Boolean(e))
      .filter(e => this.distance(e) <= 100)
      .map(e => this.choice(e, state, actions)).filter((c): c is NonNullable<typeof c> => Boolean(c))
      .sort((a, b) => Number(b.entity.id === this.hover) - Number(a.entity.id === this.hover) || Number(Boolean(b.action)) - Number(Boolean(a.action)) || this.distance(a.entity) - this.distance(b.entity))[0];
    const count = nearby ? actions.filter(action => action.targetId === nearby.entity.id).length : 0;
    return { heldEntityId: state.heldEntityId, label: count > 1 ? "Choose action" : nearby?.label ?? "", nearby };
  }

  availableActions() {
    if (this.hasPendingMotion()) return [];
    return playerAvailableInteractions(this.world, this.host.state()).map(({ id, label, targetId }) => ({ id, label, targetId }));
  }

  interact(id: string, actionId?: string) {
    if (!this.host.playing() || this.hasPendingMotion()) return false;
    const entity = this.entity(id);
    if (!entity || !this.world.interactions?.objects.some(o => o.entityId === id)) return false;
    const incompatible = incompatibleTargetReason(this.world, this.host.state(), id);
    if (incompatible) { this.cancelApproach(); this.notice(incompatible, true); return true; }
    const previews = this.inspect(id);
    const selectedPreview = actionId ? previews.find(action => action.id === actionId) : previews.length === 1 ? previews[0] : undefined;
    const selectableController = previews.some(action => this.world.interactions!.actions.some(candidate => candidate.id === action.id && candidate.kind === "operate")) &&
      this.world.interactions.objects.some(object => object.entityId === id && object.usableInPlace) &&
      canSelectInteractionSource(this.world, this.host.state(), id);
    if (selectedPreview && !selectedPreview.available && (actionId || !selectableController)) {
      this.cancelApproach();
      this.notice(selectedPreview.reason || "This action is unavailable.", true);
      return true;
    }
    if (!actionId && (previews.length > 1 || selectableController)) {
      this.cancelApproach();
      this.host.stopApproach();
      const actions = this.world.interactions.actions.filter(action => previews.some(preview => preview.id === action.id));
      this.showChoices(entity, actions);
      return true;
    }
    if (actionId) this.closeChoices();
    if (this.distance(entity) > 100) {
      if (this.world.gameplay?.movement === "roam") {
        this.pending = id;
        this.pendingActionId = actionId;
        this.host.approach(this.point(entity));
      } else this.notice("Move closer.");
      return true;
    }
    this.cancelApproach();
    this.host.stopApproach();
    const alternatives = playerAvailableInteractions(this.world, this.host.state()).filter(action => action.targetId === id);
    if (!actionId && alternatives.length > 1) {
      this.showChoices(entity, alternatives);
      return true;
    }
    const selected = actionId ? alternatives.find(action => action.id === actionId) : undefined;
    if (actionId && !selected) { this.notice("That action is not available now."); return true; }
    this.closeChoices();
    const choice = selected ? { entity, action: selected, label: selected.label } : this.choice(entity);
    if (!choice) {
      const held = activeInteractionSource(interactionState(this.world, this.host.state()));
      const action = this.world.interactions.actions.find(a => (a.kind === "operate" || a.toolId === held) && a.targetId === id);
      if (action) {
        const attempt = reduceInteraction(this.world, this.host.state(), { type: "perform", actionId: action.id });
        const prerequisite = action.requires?.find(required => !interactionState(this.world, this.host.state()).completed.includes(required));
        const previous = this.world.interactions.actions.find(candidate => candidate.id === prerequisite);
        this.notice(previous ? `First: ${previous.label}` : attempt.reason || "Already done.");
      } else {
        const state = interactionState(this.world, this.host.state());
        const next = this.world.interactions.actions.find(candidate => candidate.targetId === id && !state.completed.includes(candidate.id));
        const tool = next && this.entity(next.toolId);
        this.notice(tool ? `Use ${objectName(this.world, tool.id, 28)} here.` : state.selectedSourceId ? "Q clears this selection." : held ? "Q puts this object back." : "This object is ready.");
      }
      return true;
    }
    const current = this.host.state();
    const held = activeInteractionSource(interactionState(this.world, current));
    // A deliberate click on another loose tool switches hands in one state
    // change. Both commands validate before publishing; neither consumes stock.
    const dropping = !choice.action && held && held !== id
      ? reduceInteraction(this.world, current, { type: "drop" }) : undefined;
    if (dropping && !dropping.ok) { this.notice(dropping.reason || "Try another object."); return true; }
    const result = reduceInteraction(this.world, dropping?.state ?? current, choice.action
      ? { type: "perform", actionId: choice.action.id }
      : selectInteractionSourceCommand(this.world, id));
    if (!result.ok) { this.notice(result.reason || "Try another object."); return true; }
    this.syncMoves(true, result.state);
    this.host.change(result.state);
    if (result.event) {
      this.host.feedback(result.event.kind);
      if (choice.action) {
        this.pulse(entity);
        if (result.event.toolId && result.event.kind !== "operate") this.toolGesture(result.event.toolId, result.event.kind);
        if (result.event.kind === "transfer" && result.event.toolId) this.transferTrail(result.event.toolId, entity);
        this.notice(interactionOutcomeMessage(this.world, current, result.state, choice.action), true);
      }
    }
    this.render();
    return true;
  }

  putBack() {
    if (this.hasPendingMotion()) return;
    const result = reduceInteraction(this.world, this.host.state(), { type: "drop" });
    if (!result.ok || !this.host.playing()) return;
    this.cancelApproach();
    this.closeChoices();
    this.host.change(result.state);
    this.host.feedback("drop");
    this.render();
  }

  /** A fixed controller can also supply a resource. Choose that role explicitly
   * rather than treating selection as an operation or spending anything. */
  selectFixedSource(id: string) {
    if (!this.host.playing() || this.hasPendingMotion()) return false;
    const entity = this.entity(id);
    if (!entity || !this.world.interactions?.objects.some(object => object.entityId === id && object.usableInPlace)) return false;
    if (!canSelectInteractionSource(this.world, this.host.state(), id)) { this.notice("This source has no remaining action to select.", true); return false; }
    const result = reduceInteraction(this.world, this.host.state(), {type: "selectSource", entityId: id});
    if (!result.ok) { this.notice(result.reason || "This source cannot be selected.", true); return false; }
    this.cancelApproach(); this.host.stopApproach(); this.closeChoices();
    this.host.change(result.state); this.host.feedback("selectSource"); this.render();
    return true;
  }

  /** A new movement intent must cancel a previous click-to-use command. */
  cancelApproach() {
    const hadPending = Boolean(this.pending);
    this.pending = "";
    this.pendingActionId = undefined;
    // A ground click listener may already have established a newer movement
    // target. Never cancel that target after the old object command is cleared.
    if (hadPending) this.host.stopApproach();
  }

  hasChoices() { return Boolean(this.actionMenu); }

  dismissChoices() {
    if (!this.actionMenu) return this.menuInputConsumed;
    this.menuInputConsumed = true;
    this.closeChoices();
    return true;
  }

  revealHint(entityId: string) {
    if (!this.host.playing() || !this.entity(entityId) ||
        !this.world.interactions?.objects.some(object => object.entityId === entityId)) return false;
    this.hintTarget = entityId;
    this.hintUntil = this.scene.time.now + 3000;
    this.render();
    return true;
  }

  /** Keep the selection key from also jumping or pulling a nearby lever. */
  consumeChoiceInput() {
    const consumed = this.menuInputConsumed;
    this.menuInputConsumed = false;
    return consumed;
  }

  private inputOutsideGame() {
    const active = document.activeElement;
    return Boolean(active?.matches('input, textarea, select, button, [contenteditable="true"]') || active?.closest('[role="dialog"], dialog'));
  }

  clearInspection() {
    this.hover = "";
    this.externalPreviewAction = undefined;
    this.destinationMark.clear();
    this.closeChoices();
  }

  previewAction(actionId?: string) {
    this.externalPreviewAction = actionId;
    this.destinationMark.clear();
  }

  private highlightChoice() {
    this.menuOptions.forEach(({ text }, index) => {
      text.setColor(index === this.menuIndex ? "#ffffff" : "#d7e0e4");
      text.setBackgroundColor(index === this.menuIndex ? "#355567" : "transparent");
    });
  }

  private closeChoices() {
    this.actionMenu?.destroy(true);
    this.actionMenu = undefined;
    this.menuTarget = "";
    this.menuOptions = [];
    this.menuIndex = 0;
  }

  private showChoices(entity: WorldEntity, actions: InteractionAction[], page = 0) {
    this.closeChoices();
    this.menuTarget = entity.id;
    const camera = this.scene.cameras.main, unit = 1 / Math.max(0.1, camera.zoom);
    const container = this.scene.add.container(0, 0).setDepth(45).setScale(unit);
    this.actionMenu = container;
    const backdrop = this.scene.add.graphics();
    container.add(backdrop);
    let y = 10;
    const addButton = (label: string, action: () => void, actionId?: string) => {
      const text = this.scene.add.text(12, y, label, { fontFamily: "Manrope, sans-serif", fontSize: "14px", color: "#ffffff", wordWrap: { width: 240 }, padding: { x: 6, y: 9 } })
        .setInteractive({ useHandCursor: true });
      text.setFixedSize(252, text.height);
      text.on("pointerdown", (_pointer: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => { this.tap = undefined; event.stopPropagation(); });
      text.on("pointerup", (_pointer: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => { this.tap = undefined; event.stopPropagation(); action(); });
      const index = this.menuOptions.length;
      this.menuOptions.push({ text, run: action, actionId });
      text.on("pointerover", () => { this.menuIndex = index; this.highlightChoice(); });
      container.add(text);
      y += text.height + 3;
    };
    const previews = this.inspect(entity.id);
    const pageSize = camera.worldView.height / unit < 480 ? 1 : 2;
    if (page === 0 && actions.some(action => action.kind === "operate") &&
        this.world.interactions?.objects.some(object => object.entityId === entity.id && object.usableInPlace) &&
        canSelectInteractionSource(this.world, this.host.state(), entity.id)) {
      addButton(`Select ${objectName(this.world, entity.id, 32)} as a source`, () => this.selectFixedSource(entity.id));
    }
    for (const action of actions.slice(page * pageSize, page * pageSize + pageSize)) {
      const preview = previews.find(candidate => candidate.id === action.id);
      const fullDetail = preview?.available ? preview.canvasConsequence ?? preview.consequence : preview?.reason;
      const detail = fullDetail && fullDetail.length > 160 ? `${fullDetail.slice(0,157)}…` : fullDetail;
      addButton(`${action.label}${detail ? `\n${detail}` : ""}`, () => this.interact(entity.id, action.id), action.id);
    }
    if (page > 0) addButton("‹ Previous", () => this.showChoices(entity, actions, page - 1));
    if ((page + 1) * pageSize < actions.length) addButton("More ›", () => this.showChoices(entity, actions, page + 1));
    addButton("Cancel", () => this.closeChoices());
    this.highlightChoice();
    const hint = this.scene.add.text(18, y + 3, "↑ ↓ Choose   ·   E / Enter Select", {
      fontFamily: "Manrope, sans-serif", fontSize: "11px", color: "#c3d1d9",
    });
    container.add(hint);
    y += hint.height + 15;
    backdrop.fillStyle(0x20323f, 0.98).fillRoundedRect(0, 0, 276, y + 6, 12);
    backdrop.lineStyle(1, 0x698491, 0.7).strokeRoundedRect(0, 0, 276, y + 6, 12);
    const p = this.point(entity);
    container.setPosition(
      Phaser.Math.Clamp(p.x - 138 * unit, camera.worldView.left + 12 * unit, camera.worldView.right - 288 * unit),
      Phaser.Math.Clamp(p.y - (y + 20) * unit, camera.worldView.top + 12 * unit, camera.worldView.bottom - (y + 18) * unit));
    this.prompt.setVisible(false);
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
  private toolGesture(toolId: string, kind: string) {
    const art = this.art.get(toolId);
    if (!art || this.reducedMotion || this.world.interactions?.objects.some(object => object.entityId === toolId && object.usableInPlace) || (kind === "attach" || kind === "place")) return;
    this.scene.tweens.killTweensOf(art);
    art.setRotation(0);
    this.scene.tweens.add({ targets: art, angle: kind === "transfer" ? -24 : 12,
      duration: 160, yoyo: true, ease: "Sine.easeInOut" });
  }

  /** Receipts determine destination; animation is presentation, never saved state. */
  hasPendingMotion() { return this.pendingMotions > 0; }

  private syncMoves(animate: boolean, state = this.host.state()) {
    const moves = interactionEffects(this.world, state).objectMoves;
    for (const [id, move] of Object.entries(moves)) {
      if (this.movedObjects.get(id)?.actionId === move.actionId) continue;
      const entity = this.entity(id), art = this.art.get(id);
      if (!entity || !art) continue;
      const home = art.getData("home") as { x: number; y: number; width: number; height: number };
      const position = { x: art.x, y: art.y, width: art.displayWidth, height: art.displayHeight, actionId: move.actionId };
      const destination = interactionMoveDestination(entity, home, move);
      this.movedObjects.set(id, position);
      if (!animate || this.reducedMotion) Object.assign(position, destination);
      else {
        this.pendingMotions++;
        this.scene.tweens.add({ targets: position, ...destination,
          duration: move.durationMs ?? 900, ease: "Sine.easeInOut",
          onComplete: () => {
            this.pendingMotions--;
            this.render();
            this.pulse(entity);
            if (!this.hasPendingMotion()) this.host.settled();
          } });
      }
    }
  }

  private transferTrail(toolId: string, target: WorldEntity) {
    if (this.reducedMotion) return;
    const tool = this.entity(toolId);
    if (!tool) return;
    const from = this.point(tool), to = this.point(target);
    const unit = 1 / Math.max(0.1, this.scene.cameras.main.zoom);
    // Curved droplets make the direction readable without painting over the art.
    for (let i = 0; i < 6; i++) {
      const dot = this.scene.add.circle(from.x, from.y, 3 * unit, 0x239d88).setDepth(29);
      const travel = { progress: 0 };
      this.scene.tweens.add({ targets: travel, progress: 1,
        delay: i * 45, duration: 380, ease: "Sine.easeInOut",
        onUpdate: () => {
          const t = travel.progress;
          dot.setPosition(Phaser.Math.Linear(from.x, to.x, t), Phaser.Math.Linear(from.y, to.y, t) - Math.sin(t * Math.PI) * 22 * unit);
          dot.setAlpha(1 - Math.max(0, t - 0.75) * 3);
        }, onComplete: () => dot.destroy() });
    }
  }

  tick() {
    this.render();
    const use = this.queuedUse, putBack = this.queuedReturn;
    this.queuedUse = false;
    this.queuedReturn = false;
    if (!this.host.playing() || this.inputOutsideGame() || this.menuInputConsumed || this.hasChoices()) return;
    if (putBack) this.putBack();
    const context = this.context();
    if (context.nearby && use) {
      if (this.e) Phaser.Input.Keyboard.JustDown(this.e);
      this.interact(context.nearby.entity.id);
    }
    if (this.pending) {
      const pending = this.entity(this.pending);
      if (pending && this.distance(pending) <= 100) this.interact(pending.id, this.pendingActionId);
    }
  }

  private render() {
    const state = interactionState(this.world, this.host.state());
    const player = this.host.player();
    const camera = this.scene.cameras.main;
    const unit = 1 / Math.max(0.1, camera.zoom);
    const delta = Math.min(64, Math.max(0, this.scene.time.now - this.lastRenderTime));
    this.lastRenderTime = this.scene.time.now;
    for (const [id, art] of this.art) {
      const home = art.getData("home") as { x: number; y: number; width: number; height: number };
      if (state.heldEntityId === id) {
        const heldScale = Math.min(1, 86 * unit / Math.max(home.width, home.height));
        art.setDisplaySize(home.width * heldScale, home.height * heldScale).setDepth(26);
        if (player) {
          const hero = this.world.entities.find(entity => entity.kind === "player");
          const bounds = this.host.playerArtBounds?.() ?? {x:player.x-(hero?.width??0)/2,y:player.y-(hero?.height??0)/2,width:hero?.width??0,height:hero?.height??0};
          const at = carriedArtworkPosition(bounds,{width:art.displayWidth,height:art.displayHeight},Boolean(player.flipX),unit);
          art.setPosition(at.x,at.y);
        }
        else art.setPosition(camera.worldView.centerX, camera.worldView.bottom - 58 * unit);
      } else if (state.attachments[id]) {
        // Attached art is placed after all moving targets have updated below.
        continue;
      } else {
        const position = this.movedObjects.get(id) ?? home;
        art.setPosition(position.x, position.y).setDisplaySize(position.width, position.height).setDepth(this.objectDepth(id));
      }
    }
    for (const [id, targetId] of Object.entries(state.attachments)) {
      const art = this.art.get(id), target = this.entity(targetId);
      if (!art || !target) continue;
      const home = art.getData("home") as { width: number; height: number };
      const point = this.point(target);
      if (target.kind === "player" && player) {
        const bounds=this.host.playerArtBounds?.()??{x:player.x-target.width/2,y:player.y-target.height/2,width:target.width,height:target.height};
        const mount=attachedPlayerArtwork(bounds,home,player.body?.bottom??bounds.y+bounds.height,Boolean(player.flipX));
        art.setDisplaySize(mount.width,mount.height).setPosition(mount.x,mount.y).setDepth(23);
      } else {
        const scale = Math.min(1, Math.max(target.width, target.height) * 0.5 / Math.max(home.width, home.height));
        const targetSize = this.size(target);
        const attachedHeight = home.height * scale;
        // Independent inventions retain their mount above the receiving object.
        art.setDisplaySize(home.width * scale, attachedHeight)
          .setPosition(point.x + targetSize.width * 0.15,point.y - attachedHeight / 2)
          .setDepth(23);
      }
    }
    this.marks.clear();
    this.focus.clear();
    this.destinationMark.clear();
    this.hintMark.clear();
    this.hintLabel.setVisible(false);
    if (this.host.playing() && this.scene.time.now < this.hintUntil) {
      const entity = this.entity(this.hintTarget);
      if (entity) {
        const point = this.point(entity), view = camera.worldView;
        const onScreen = view.contains(point.x, point.y);
        if (onScreen) this.targetCorners(entity, unit, 0x264eb4, 1, this.hintMark);
        const x = Phaser.Math.Clamp(point.x, view.left + 90 * unit, view.right - 90 * unit);
        const y = Phaser.Math.Clamp(point.y - this.size(entity).height / 2 - 18 * unit,
          view.top + 65 * unit, view.bottom - 35 * unit);
        this.hintLabel.setText(objectName(this.world, entity.id, 24)).setScale(unit)
          .setPosition(x, y).setVisible(true);
        if (!onScreen) {
          const angle = Math.atan2(point.y - view.centerY, point.x - view.centerX);
          const tip = { x: x + Math.cos(angle) * 18 * unit, y: y + 16 * unit + Math.sin(angle) * 18 * unit };
          this.hintMark.lineStyle(3 * unit, 0x264eb4, 1).beginPath()
            .moveTo(tip.x - Math.cos(angle - 0.6) * 11 * unit, tip.y - Math.sin(angle - 0.6) * 11 * unit)
            .lineTo(tip.x, tip.y)
            .lineTo(tip.x - Math.cos(angle + 0.6) * 11 * unit, tip.y - Math.sin(angle + 0.6) * 11 * unit).strokePath();
        }
      }
    }
    const badgeView = {x:0,y:0,width:camera.worldView.width/unit,height:camera.worldView.height/unit};
    const badgeObjects = (this.world.interactions?.objects ?? []).filter(object => object.resource && state.heldEntityId !== object.entityId);
    const reservedBadgeSpace = [this.prompt,this.hintLabel].filter(label=>label.visible).map(label=>{
      const bounds=label.getBounds();
      return {x:(bounds.x-camera.worldView.left)/unit,y:(bounds.y-camera.worldView.top)/unit,width:bounds.width/unit,height:bounds.height/unit};
    });
    const backdrop = this.world.entities.find(isSourceBackdrop);
    const openedGates = new Set(interactionEffects(this.world, this.host.state()).openGateIds);
    for (const id of this.host.state().activated) {
      const gateId = this.entity(id)?.targetId;
      if (gateId) openedGates.add(gateId);
    }
    const badgeArtwork = this.world.entities.flatMap(entity => {
      if (isSourceBackdrop(entity) || (!entity.art && !entity.artSource) || openedGates.has(entity.id)) return [];
      const art = this.art.get(entity.id);
      if (art && (!art.visible || art.alpha === 0)) return [];
      // Use current animated/attached artwork, not the original selected box.
      // Stationary source details may have a collider smaller than their art.
      const point = this.point(entity), size = this.size(entity);
      const box = entity.kind === "player" && this.host.playerArtBounds?.()
        || (art ? {x:point.x-size.width/2,y:point.y-size.height/2,width:size.width,height:size.height}
          : backdrop && entity.artSource ? entity.sourceLayer ? sourceLayerArtworkBounds(entity,backdrop)
            : {x:backdrop.x+entity.artSource.x/1000*backdrop.width,y:backdrop.y+entity.artSource.y/1000*backdrop.height,
              width:entity.artSource.width/1000*backdrop.width,height:entity.artSource.height/1000*backdrop.height}
          : {x:point.x-size.width/2,y:point.y-size.height/2,width:size.width,height:size.height});
      return [{id:entity.id,bounds:{x:(box.x-camera.worldView.left)/unit,y:(box.y-camera.worldView.top)/unit,
        width:box.width/unit,height:box.height/unit}}];
    });
    const placements = layoutResourceBadges(badgeObjects.flatMap(object => {
      const entity = this.entity(object.entityId), text = this.resourceLabels.get(object.entityId);
      if (!entity || !text || !object.resource) return [];
      const point = this.point(entity), size = this.size(entity);
      // Capacity is fixed. Reserve its full width so spending never moves labels.
      if (!text.getData("badgeWidth")) {
        const capacity = resourceNumber.format(object.resource.capacity);
        text.setText(`${capacity} / ${capacity}`);
        text.setData("badgeWidth",Math.max(56,text.width+16));
      }
      return [{id:entity.id,width:text.getData("badgeWidth") as number,height:32,
        bounds:{x:(point.x-size.width/2-camera.worldView.left)/unit,y:(point.y-size.height/2-camera.worldView.top)/unit,
          width:size.width/unit,height:size.height/unit}}];
    }),badgeView,reservedBadgeSpace,badgeArtwork);
    for (const text of this.resourceLabels.values()) text.setVisible(false);
    for (const placement of placements) {
      const object = badgeObjects.find(object => object.entityId === placement.id)!;
      const entity = this.entity(placement.id)!;
      if (!object.resource) continue;
      const actual = state.quantities[entity.id] ?? 0;
      const text = this.resourceLabels.get(entity.id)!;
      text.setText(`${resourceNumber.format(actual)} / ${resourceNumber.format(object.resource.capacity)}`).setScale(unit).setVisible(true);
      const badgeWidth = placement.width * unit, badgeHeight = placement.height * unit;
      const x = camera.worldView.left + placement.x * unit, y = camera.worldView.top + placement.y * unit;
      const centerX = x + badgeWidth / 2;
      if (placement.leader || placement.overlaps) {
        const anchorX = camera.worldView.left + placement.anchor.x * unit, anchorY = camera.worldView.top + placement.anchor.y * unit;
        this.marks.lineStyle(1.5 * unit, 0x355b69, .8).beginPath().moveTo(anchorX, anchorY)
          .lineTo(Phaser.Math.Clamp(anchorX,x,x+badgeWidth),Phaser.Math.Clamp(anchorY,y,y+badgeHeight)).strokePath();
        this.marks.fillStyle(0x355b69,.8).fillCircle(anchorX,anchorY,2*unit);
      }
      const full = actual >= object.resource.capacity;
      const delivered = full && this.world.interactions!.actions.some(action => action.kind === "transfer" && action.targetId === entity.id && state.completed.includes(action.id));
      if (delivered) this.marks.lineStyle(6 * unit, 0x5bd6bb, 0.13)
        .strokeRoundedRect(x - 2 * unit, y - 2 * unit, badgeWidth + 4 * unit, badgeHeight + 4 * unit, 10 * unit);
      this.marks.fillStyle(delivered ? 0xf0faf6 : 0xffffff, 0.97)
        .fillRoundedRect(x, y, badgeWidth, badgeHeight, 8 * unit);
      this.marks.lineStyle(unit, delivered ? 0x23846e : 0xb4c3cc, 0.95)
        .strokeRoundedRect(x, y, badgeWidth, badgeHeight, 8 * unit);
      text.setPosition(centerX, y + 3 * unit).setColor(delivered ? "#17694f" : "#253340");
      const previous = this.displayedQuantities.get(entity.id) ?? actual;
      const displayed = this.reducedMotion || Math.abs(actual - previous) < 0.01 ? actual
        : Phaser.Math.Linear(previous, actual, 1 - Math.exp(-delta / 105));
      this.displayedQuantities.set(entity.id, displayed);
      const fraction = Math.max(0, Math.min(1, displayed / object.resource.capacity));
      const meterX = x + 8 * unit, meterY = y + 25 * unit, meterWidth = badgeWidth - 16 * unit;
      this.marks.fillStyle(0xd8e3e9, 1).fillRoundedRect(meterX, meterY, meterWidth, 3 * unit, 1.5 * unit);
      this.marks.fillStyle(0x23846e, 1).fillRoundedRect(meterX, meterY, meterWidth * fraction, 3 * unit, 1.5 * unit);
    }
    // A check means the target's required work is done, not merely that one
    // transfer occurred. Partial receivers retain only their honest fill meter.
    const actions = this.world.interactions?.actions ?? [];
    const requiredActions = new Set(this.world.goalRules?.requiredInteractionIds ?? []);
    const completedTargets = new Set(actions
      .filter(action => state.completed.includes(action.id))
      .map(action => action.targetId)
      .filter(id => {
        const resource = this.world.interactions?.objects.find(object => object.entityId === id)?.resource;
        if (resource && (state.quantities[id] ?? 0) < resource.capacity) return false;
        return actions.filter(action => action.targetId === id && requiredActions.has(action.id))
          .every(action => state.completed.includes(action.id));
      }));
    for (const id of completedTargets) {
      const entity = this.entity(id);
      if (!entity) continue;
      const p = this.point(entity), size = this.size(entity);
      const x = p.x + Math.min(size.width / 2, 50 * unit), y = p.y - Math.min(size.height / 2, 50 * unit);
      this.marks.fillStyle(0xeffaf5, 0.96).fillCircle(x, y, 7 * unit);
      this.marks.lineStyle(1.8 * unit, 0x23846e, 1).beginPath()
        .moveTo(x - 3 * unit, y).lineTo(x - unit, y + 2 * unit).lineTo(x + 3 * unit, y - 2 * unit).strokePath();
    }
    if (!this.host.playing()) { this.prompt.setVisible(false); this.closeChoices(); return; }
    this.renderDestinationPreview(unit);
    if (this.actionMenu) {
      const target = this.entity(this.menuTarget);
      if (!target) this.closeChoices();
      else { this.prompt.setVisible(false); return; }
    }
    if (this.hasPendingMotion()) { this.prompt.setVisible(false); return; }
    if (this.hover) {
      const pointer = this.scene.input.activePointer;
      const point = pointer.positionToCamera(camera) as Phaser.Math.Vector2;
      this.hover = this.objectAt(point)?.id ?? "";
    }
    const context = this.context();
    const available = playerAvailableInteractions(this.world, this.host.state());
    // Held tools reveal only targets that can really accept them now.
    for (const id of new Set(available.map(action => action.targetId))) {
      const entity = this.entity(id);
      if (!entity) continue;
      this.targetCorners(entity, unit, 0x218b77, 0.8);
    }
    const selectedSource = state.selectedSourceId ? this.entity(state.selectedSourceId) : undefined;
    if (selectedSource) this.targetCorners(selectedSource, unit, 0x264eb4, 1);
    const focused = (this.hover !== activeInteractionSource(state) ? this.entity(this.hover) : undefined) ?? context.nearby?.entity;
    if (focused && !available.some(action => action.targetId === focused.id)) {
      this.targetCorners(focused, unit, 0x355b69, 0.8);
    }
    // The requested hint owns this brief attention moment. A second E prompt
    // in the same space would obscure both the object name and the action.
    if (this.hintLabel.visible) { this.prompt.setVisible(false); return; }
    const inspected = this.hover ? this.entity(this.hover) : undefined;
    if (inspected && this.host.playing() && !this.hasPendingMotion()) {
      const previews = this.inspect(inspected.id);
      const incompatible = incompatibleTargetReason(this.world, this.host.state(), inspected.id);
      if (previews.length > 0 || incompatible) {
        const preview = previews[0], point = this.point(inspected);
        const cue = this.world.gameplay?.movement === "discover" ? "Click" : this.distance(inspected) <= 100 ? "E" : "Approach";
        const multiple = previews.length > 1 ? `Click · Choose action\n${previews.filter(action => action.available).length} of ${previews.length} available` : undefined;
        this.prompt.setText(incompatible || multiple || (preview.available ? `${cue} · ${preview.label}\n${preview.canvasConsequence ?? preview.consequence}` : preview.reason || "Unavailable"))
          .setScale(unit).setVisible(true);
        this.prompt.setPosition(Phaser.Math.Clamp(point.x, camera.worldView.left + 150 * unit, camera.worldView.right - 150 * unit),
          Phaser.Math.Clamp(point.y - this.size(inspected).height / 2 - 12 * unit,
            camera.worldView.top + (this.prompt.height + 12) * unit, camera.worldView.bottom - 12 * unit));
        return;
      }
    }
    if (context.nearby) {
      const point = this.point(context.nearby.entity);
      const discovery = this.world.gameplay?.movement === "discover";
      const previews = discovery && context.nearby.action ? this.inspect(context.nearby.entity.id) : [];
      const preview = discovery && context.nearby.action
        ? previews.find(candidate => candidate.id === context.nearby!.action!.id) ?? previewInteraction(this.world,this.host.state(),context.nearby.action)
        : undefined;
      const cue = discovery ? "Click" : "E";
      const detail = previews.length > 1 ? `${cue} · Choose action\n${previews.filter(candidate => candidate.available).length} of ${previews.length} available`
        : preview ? `${cue} · ${preview.label}\n${preview.available ? preview.canvasConsequence ?? preview.consequence : preview.reason ?? "Unavailable"}`
        : `${cue} · ${context.label}`;
      this.prompt.setText(detail).setScale(unit);
      const half = Math.min(camera.worldView.width / 2, (this.prompt.width / 2 + 12) * unit);
      this.prompt.setPosition(
        Phaser.Math.Clamp(point.x, camera.worldView.left + half, camera.worldView.right - half),
        Math.max(camera.worldView.top + (this.prompt.height + 12) * unit,
          point.y - this.size(context.nearby.entity).height / 2 - 12 * unit),
      ).setVisible(true);
    } else if (activeInteractionSource(state) && !available.length) {
      const tool = this.entity(activeInteractionSource(state)!);
      if (tool) {
        const point = this.point(tool);
        this.prompt.setText(state.selectedSourceId ? "Q  Clear selection" : "Q  Put back").setScale(unit).setPosition(
          Phaser.Math.Clamp(point.x, camera.worldView.left + 75 * unit, camera.worldView.right - 75 * unit),
          Math.max(camera.worldView.top + 45 * unit, point.y - 55 * unit)).setVisible(true);
      }
    } else this.prompt.setVisible(false);
  }

  /** Only an explicitly inspected, executable action gets an endpoint. No
   * route planning, inferred positions, animation, or persistent overlay. */
  private renderDestinationPreview(unit: number) {
    if (!document.hasFocus() || this.hasPendingMotion() || this.host.state().completed) return;
    let actionId = this.actionMenu ? this.menuOptions[this.menuIndex]?.actionId : this.externalPreviewAction;
    if (!this.actionMenu && !actionId && this.hover && !this.inputOutsideGame()) {
      const previews = this.inspect(this.hover).filter(preview => preview.available);
      if (previews.length === 1) actionId = previews[0].id;
    }
    const action = this.world.interactions?.actions.find(candidate => candidate.id === actionId);
    if (!action || !this.inspect(action.targetId).some(preview => preview.id === action.id && preview.available)) return;
    for (const effect of action.effects ?? []) {
      if (effect.kind !== "moveObject") continue;
      const entity = this.entity(effect.entityId), art = this.art.get(effect.entityId);
      if (!entity || !art) continue;
      const destination = interactionMoveDestination(entity, art.getData("home"), effect);
      const length = Math.min(12 * unit, destination.width / 3, destination.height / 3);
      // Two quiet strokes remain legible on light and dark source artwork.
      // Corners follow the exact rendered rectangle, including cutout padding.
      for (const [width, color, alpha] of [[4, 0xffffff, .72], [2, 0x218b77, .95]]) {
        this.destinationMark.lineStyle(width * unit, color, alpha);
        for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
          const x = destination.x + sx * destination.width / 2;
          const y = destination.y + sy * destination.height / 2;
          this.destinationMark.beginPath().moveTo(x - sx * length, y).lineTo(x, y)
            .lineTo(x, y - sy * length).strokePath();
        }
      }
    }
  }

  private targetCorners(entity: WorldEntity, unit: number, color: number, alpha: number, graphics = this.focus) {
    const point = this.point(entity), size = this.size(entity);
    const w = Math.max(20 * unit, size.width / 2 + 7 * unit);
    const h = Math.max(20 * unit, size.height / 2 + 7 * unit);
    const length = 9 * unit;
    graphics.lineStyle(2 * unit, color, alpha);
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
      const x = point.x + sx * w, y = point.y + sy * h;
      graphics.beginPath().moveTo(x - sx * length, y).lineTo(x, y).lineTo(x, y - sy * length).strokePath();
    }
  }
}
