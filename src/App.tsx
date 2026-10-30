import { useEffect, useRef, useState, type ChangeEvent } from "react";
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowUpRight,
  Check,
  ChevronRight,
  CircleHelp,
  FolderHeart,
  ImagePlus,
  Layers3,
  LoaderCircle,
  Maximize2,
  Pause,
  Pencil,
  Play,
  RotateCcw,
  Settings2,
  Sparkles,
  Sprout,
  Volume2,
  VolumeX,
  WandSparkles,
  X,
} from "lucide-react";
import { WorldCanvas, type WorldCanvasHandle } from "./components/WorldCanvas";
import { Modal } from "./components/Modal";
import { SketchPad } from "./components/SketchPad";
import { EXAMPLES, freshExample } from "./lib/examples";
import {
  emptyPlayState,
  retainPlayState,
  validateWorld,
  type PlayState,
  type WorldDefinition,
} from "../shared/world";
import type { WorldTelemetry } from "./game/WorldScene";

type Connection = {
  configured: boolean;
  provider: "meta" | "baseten";
  label: string;
  credential: string;
  enforcedSchema: boolean;
  model: string;
  requestsRemaining: number;
};
type SavedWorld = { world: WorldDefinition; state: PlayState; savedAt: string };
type Dialog = "sketch" | "worlds" | "help" | "settings" | null;
const storageKey = "doodlume.worlds.v1";
function savedWorlds(): SavedWorld[] {
  try {
    const data: unknown = JSON.parse(localStorage.getItem(storageKey) ?? "[]");
    if (!Array.isArray(data)) return [];
    return data.flatMap((item: SavedWorld) => {
      try {
        validateWorld(item.world);
        if (
          !item.state ||
          !Array.isArray(item.state.collected) ||
          !Array.isArray(item.state.activated)
        )
          return [];
        return [item];
      } catch {
        return [];
      }
    });
  } catch {
    return [];
  }
}
const initialMetrics: WorldTelemetry = {
  collected: 0,
  total: 3,
  completed: false,
  nearLever: false,
  playerX: 0,
  playerY: 0,
};

export default function App() {
  const [world, setWorld] = useState(() => freshExample(EXAMPLES[0].id));
  const [initial, setInitial] = useState<PlayState>(emptyPlayState);
  const [source, setSource] = useState(EXAMPLES[0].sourceImage);
  const [sourceName, setSourceName] = useState("An original Doodlume example");
  const [customSource, setCustomSource] = useState(false);
  const [intent, setIntent] = useState(
    "Find the sunseeds, wake the gate, and bring Pip home.",
  );
  const [playing, setPlaying] = useState(false);
  const [started, setStarted] = useState(false);
  const [muted, setMuted] = useState(true);
  const [run, setRun] = useState(0);
  const [metrics, setMetrics] = useState(initialMetrics);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [saved, setSaved] = useState(savedWorlds);
  const [connection, setConnection] = useState<Connection | null>(null);
  const [connectionError, setConnectionError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [draft, setDraft] = useState<WorldDefinition | null>(null);
  const canvas = useRef<WorldCanvasHandle>(null);
  const file = useRef<HTMLInputElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const latestState = useRef<PlayState>(emptyPlayState());
  const request = useRef<AbortController | null>(null);
  const previousPlaying = useRef(false);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function checkConnection() {
    try {
      const response = await fetch("/api/status");
      if (!response.ok) throw new Error();
      const data = await response.json();
      setConnection(data);
      setConnectionError(false);
    } catch {
      setConnection(null);
      setConnectionError(true);
    }
  }
  useEffect(() => {
    void checkConnection();
    return () => {
      request.current?.abort();
      if (noticeTimer.current) clearTimeout(noticeTimer.current);
    };
  }, []);
  useEffect(() => {
    if (dialog) {
      previousPlaying.current = playing;
      setPlaying(false);
    } else if (previousPlaying.current) {
      setPlaying(true);
      previousPlaying.current = false;
    }
  }, [dialog]);
  useEffect(() => {
    function key(e: KeyboardEvent) {
      if (
        e.target instanceof Element &&
        e.target.closest('input,textarea,[contenteditable="true"]')
      )
        return;
      if (
        ["ArrowLeft", "ArrowRight", "ArrowUp", " ", "ArrowDown"].includes(
          e.key,
        ) &&
        playing &&
        !dialog
      )
        e.preventDefault();
      if (e.key === "Escape" && !dialog) setPlaying(false);
    }
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [playing, dialog]);
  useEffect(() => {
    if (metrics.completed) setPlaying(false);
  }, [metrics.completed]);

  function tell(message: string) {
    setNotice(message);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(""), 5200);
  }
  function loadWorld(next: WorldDefinition, state = emptyPlayState()) {
    request.current?.abort();
    setBusy(false);
    setWorld(next);
    setSource(next.sourceImage);
    setCustomSource(false);
    setSourceName(
      next.source === "example"
        ? "An original Doodlume example"
        : "Your original drawing",
    );
    setInitial(state);
    latestState.current = state;
    setMetrics({
      ...initialMetrics,
      collected: state.collected.length,
      total: next.entities.filter((e) => e.kind === "coin").length,
      completed: state.completed,
    });
    setRun((n) => n + 1);
    setStarted(false);
    setPlaying(false);
    setDraft(null);
    setError("");
    previousPlaying.current = false;
  }
  function start() {
    setStarted(true);
    setPlaying(true);
    stage.current?.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
      block: "center",
    });
    stage.current
      ?.querySelector<HTMLElement>(".world-canvas")
      ?.focus({ preventScroll: true });
  }
  function restart() {
    setInitial(emptyPlayState());
    latestState.current = emptyPlayState();
    setMetrics({
      ...initialMetrics,
      total: world.entities.filter((e) => e.kind === "coin").length,
    });
    setRun((n) => n + 1);
    setStarted(true);
    setPlaying(true);
    tell("A fresh start. Same little world.");
  }
  function save() {
    const state = canvas.current?.snapshot() ?? latestState.current;
    const entry: SavedWorld = {
      world,
      state,
      savedAt: new Date().toISOString(),
    };
    const next = [entry, ...saved.filter((s) => s.world.id !== world.id)].slice(
      0,
      8,
    );
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
      setSaved(next);
      tell("World saved on this device. Your progress is coming too.");
    } catch {
      setError(
        "This browser is out of storage. Your world is still open; try a smaller drawing.",
      );
    }
  }
  async function upload(e: ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0];
    e.target.value = "";
    if (!selected) return;
    setError("");
    if (!["image/png", "image/jpeg", "image/webp"].includes(selected.type)) {
      setError("Choose a PNG, JPG, or WebP image.");
      return;
    }
    if (selected.size > 12 * 1024 * 1024) {
      setError("Choose an image under 12 MB. A clear phone photo is enough.");
      return;
    }
    try {
      const bitmap = await createImageBitmap(selected);
      const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
      const surface = document.createElement("canvas");
      surface.width = Math.round(bitmap.width * scale);
      surface.height = Math.round(bitmap.height * scale);
      const ctx = surface.getContext("2d")!;
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, surface.width, surface.height);
      ctx.drawImage(bitmap, 0, 0, surface.width, surface.height);
      bitmap.close();
      useSource(surface.toDataURL("image/png"), selected.name);
    } catch {
      setError("We could not open that image. Try another photo or draw here.");
    }
  }
  function useSource(image: string, name = "A drawing, made by you") {
    setSource(image);
    setSourceName(name);
    setCustomSource(true);
    setDraft(null);
    setPlaying(false);
    setError("");
    setDialog(null);
    previousPlaying.current = false;
    tell("Your drawing is ready. Tell us what should happen in it.");
  }
  async function bringAlive() {
    setError("");
    if (!customSource) {
      tell(
        "You’re looking at a playable example. Upload or draw your own page to create a new world.",
      );
      return;
    }
    if (!connection?.configured) {
      setDialog("settings");
      return;
    }
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setPlaying(false);
    try {
      const response = await fetch("/api/interpret", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: source, intent }),
        signal: controller.signal,
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(
          result.error || "Your drawing could not be interpreted.",
        );
      setDraft(validateWorld(result.world));
      tell(
        "Your drawing has a first interpretation. Preview it before you play.",
      );
      void checkConnection();
    } catch (e) {
      if (!(e instanceof DOMException && e.name === "AbortError"))
        setError(
          e instanceof Error
            ? e.message
            : "Something interrupted the request. Your drawing is safe.",
        );
    } finally {
      if (request.current === controller) {
        setBusy(false);
        request.current = null;
      }
    }
  }
  function cancelInterpretation() {
    request.current?.abort();
    setBusy(false);
    tell("Stopped. Your drawing is still here.");
  }
  async function fullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await stage.current?.requestFullscreen();
    } catch {
      tell("Your browser does not support full screen here.");
    }
  }
  const touch = (key: "left" | "right" | "jump" | "interact", value: boolean) =>
    canvas.current?.touch(key, value);

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#studio" aria-label="Doodlume studio">
          <img src="/art/favicon.svg" alt="" />
          <span>
            doodlume<span className="brand-dot">.</span>
          </span>
        </a>
        <nav aria-label="Main navigation">
          <a className="nav-current" href="#studio">
            Studio
          </a>
          <button onClick={() => setDialog("worlds")}>
            My worlds <span className="nav-count">{saved.length}</span>
          </button>
        </nav>
        <div className="top-actions">
          <span className="local-pill">
            <span /> Local studio
          </span>
          <button
            className="icon-button"
            aria-label="How to play"
            onClick={() => setDialog("help")}
          >
            <CircleHelp size={19} />
          </button>
          <button
            className="icon-button"
            aria-label="Studio settings"
            onClick={() => setDialog("settings")}
          >
            <Settings2 size={19} />
          </button>
        </div>
      </header>
      <main id="studio">
        <section className="studio-intro">
          <div>
            <div className="eyebrow">
              <span className="tiny-star">✳</span> A little ink. A whole new
              world.
            </div>
            <h1>
              Your drawings,
              <br className="mobile-break" /> <em>alive.</em>
              <svg
                className="title-swish"
                viewBox="0 0 180 14"
                aria-hidden="true"
              >
                <path d="M3 9Q82-2 177 7M25 13Q95 3 155 11" />
              </svg>
            </h1>
            <p>Small marks. Big adventures. Made entirely yours.</p>
          </div>
          <div className="intro-note">
            <span>from page</span>
            <svg
              width="100"
              height="40"
              viewBox="0 0 100 40"
              aria-hidden="true"
            >
              <path d="M5 23Q29 2 49 21T90 16M80 14L93 15L87 26" />
            </svg>
            <span>to possibility</span>
          </div>
        </section>
        <div className="studio-workspace">
          <aside className="paper-panel" aria-label="Your drawing">
            <div className="panel-heading">
              <span className="step-label">01</span>
              <h2>The beginning</h2>
              <span className="paper-label">your page</span>
            </div>
            <div
              className={`paper-frame ${customSource ? "custom-paper" : ""}`}
            >
              <span className="paper-tape" />
              <img src={source} alt={sourceName} />
              <div className="source-caption">
                <span>{customSource ? "YOUR DRAWING" : "EXAMPLE DRAWING"}</span>
                <span>↗</span>
              </div>
            </div>
            <div className="source-actions">
              <button
                className="secondary-button"
                onClick={() => file.current?.click()}
                disabled={busy}
              >
                <ImagePlus size={17} /> Add a drawing
              </button>
              <button
                className="icon-button draw-button"
                aria-label="Draw here"
                onClick={() => setDialog("sketch")}
                disabled={busy}
              >
                <Pencil size={17} />
              </button>
              <input
                ref={file}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                hidden
                onChange={upload}
              />
            </div>
            <div className="paper-divider" />
            <label className="intent-label" htmlFor="world-intent">
              What’s the little adventure?
            </label>
            <div className="intent-box">
              <textarea
                id="world-intent"
                value={intent}
                maxLength={500}
                onChange={(e) => setIntent(e.target.value)}
                placeholder="A shy creature collecting stars on its way home…"
                disabled={busy}
              />
              <Sparkles size={15} aria-hidden="true" />
            </div>
            <p className="source-tip">
              A character, a path, a little purpose.
              <br />
              The rest starts with your imagination.
            </p>
            {busy ? (
              <button
                className="primary-button create-button"
                onClick={cancelInterpretation}
              >
                <LoaderCircle size={18} className="spin" /> Reading your page…{" "}
                <X size={16} />
              </button>
            ) : (
              <button
                className="primary-button create-button"
                onClick={bringAlive}
              >
                <WandSparkles size={18} /> Bring it alive{" "}
                <ArrowUpRight size={18} />
              </button>
            )}
            <button
              className="connection-note"
              onClick={() => setDialog("settings")}
            >
              <span
                className={`status-dot ${connection?.configured ? "connected" : ""}`}
              />
              {connection?.configured
                ? `${connection.label} · key configured`
                : connectionError
                  ? "Connection unavailable · view setup"
                  : `${connection?.label ?? "Meta model"} · setup needed`}
              <ChevronRight size={13} />
            </button>
          </aside>
          <section className="world-panel" aria-label="Your playable world">
            <div className="world-heading">
              <div>
                <div className="world-kicker">
                  <span className="step-label">02</span>
                  <span>The possibility</span>
                </div>
                <label className="world-name-label">
                  <span className="sr-only">World name</span>
                  <input
                    aria-label="World name"
                    value={world.name}
                    maxLength={80}
                    onChange={(e) =>
                      setWorld((w) => ({ ...w, name: e.target.value }))
                    }
                    onBlur={() => {
                      if (!world.name.trim())
                        setWorld((w) => ({
                          ...w,
                          name: "An untitled little world",
                        }));
                    }}
                  />
                  <Pencil size={13} aria-hidden="true" />
                </label>
              </div>
              <div className="world-heading-actions">
                <span className="example-badge">
                  {world.source === "example"
                    ? "Playable example"
                    : "From your drawing"}
                </span>
                <button
                  className="icon-button save-button"
                  aria-label="Save world on this device"
                  onClick={save}
                >
                  <ArrowDownToLine size={18} />
                </button>
              </div>
            </div>
            <div className="game-stage" ref={stage}>
              <WorldCanvas
                ref={canvas}
                world={world}
                initial={initial}
                playing={playing && !dialog && !busy}
                muted={muted}
                run={run}
                onUpdate={(s, m) => {
                  latestState.current = s;
                  setMetrics(m);
                }}
                onMoment={tell}
              />
              <div className="game-top">
                <span className="world-location">
                  <Sprout size={15} />
                  {world.theme === "moon"
                    ? "Moonlit meadows"
                    : world.theme === "sunset"
                      ? "Golden afternoon"
                      : "Somewhere lovely"}
                </span>
                <span
                  className="seed-counter"
                  aria-label={`${metrics.collected} of ${metrics.total} sunseeds collected`}
                >
                  <img src="/art/seed.svg" alt="" />
                  <b>{metrics.collected}</b>
                  <span>/ {metrics.total}</span>
                </span>
              </div>
              {!playing && !metrics.completed && !busy && (
                <div
                  className={`play-overlay ${started ? "paused-overlay" : ""}`}
                >
                  <button
                    className="play-orb"
                    onClick={start}
                    aria-label={started ? "Resume adventure" : "Play adventure"}
                  >
                    <Play size={27} fill="currentColor" />
                  </button>
                  <span className="play-caption">
                    {started
                      ? "A little pause."
                      : "Your little adventure awaits."}
                  </span>
                  <span className="play-subcaption">
                    {started
                      ? "Pick up right where you left off."
                      : "Press play. Meet your world."}
                  </span>
                </div>
              )}
              {metrics.completed && (
                <div className="completion-overlay">
                  <div className="completion-icon">
                    <Sparkles size={25} />
                  </div>
                  <span className="eyebrow">HOME, SWEET DRAWING.</span>
                  <h2>
                    A little world.
                    <br />A whole lot of you.
                  </h2>
                  <p>
                    {metrics.collected} of {metrics.total} sunseeds found. Every
                    adventure leaves a little light.
                  </p>
                  <div>
                    <button className="primary-button" onClick={restart}>
                      One more adventure <RotateCcw size={16} />
                    </button>
                    <button className="text-button" onClick={save}>
                      <FolderHeart size={17} /> Keep this world
                    </button>
                  </div>
                </div>
              )}
              {busy && (
                <div className="reading-overlay">
                  <LoaderCircle size={30} className="spin" />
                  <h3>Finding the story in your lines.</h3>
                  <p>Your current world is waiting safely here.</p>
                  <button
                    className="text-button"
                    onClick={cancelInterpretation}
                  >
                    Cancel
                  </button>
                </div>
              )}
              <div className="stage-corner">
                a world by you, a little light by doodlume
              </div>
            </div>
            <div className="game-toolbar">
              <div className="play-controls">
                <button
                  className="icon-button play-control"
                  aria-label={playing ? "Pause adventure" : "Resume adventure"}
                  disabled={metrics.completed || busy}
                  onClick={() => (playing ? setPlaying(false) : start())}
                >
                  {playing ? (
                    <Pause size={17} fill="currentColor" />
                  ) : (
                    <Play size={17} fill="currentColor" />
                  )}
                </button>
                <button
                  className="icon-button"
                  aria-label="Restart adventure"
                  onClick={restart}
                  disabled={busy}
                >
                  <RotateCcw size={17} />
                </button>
                <span className="tool-divider" />
                <button
                  className="icon-button"
                  aria-label={muted ? "Turn sound on" : "Mute sound"}
                  aria-pressed={!muted}
                  onClick={() => setMuted(!muted)}
                >
                  {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
                </button>
              </div>
              <div className="keyboard-guide">
                <span>
                  <kbd>←</kbd>
                  <kbd>→</kbd> move
                </span>
                <span>
                  <kbd>space</kbd> jump
                </span>
                <span>
                  <kbd>E</kbd> interact
                </span>
              </div>
              <button
                className="icon-button"
                aria-label="Full screen world"
                onClick={fullscreen}
              >
                <Maximize2 size={17} />
              </button>
            </div>
            <div className="touch-controls" aria-label="Touch game controls">
              {(
                [
                  ["left", ArrowLeft, "Move left"],
                  ["right", ArrowRight, "Move right"],
                  ["jump", ArrowUp, "Jump"],
                  ["interact", WandSparkles, "Use lever"],
                ] as const
              ).map(([key, Icon, label]) => (
                <button
                  key={key}
                  aria-label={label}
                  onPointerDown={(e) => {
                    e.currentTarget.setPointerCapture(e.pointerId);
                    if (!started) start();
                    touch(key, true);
                  }}
                  onPointerUp={() => touch(key, false)}
                  onPointerCancel={() => touch(key, false)}
                  onLostPointerCapture={() => touch(key, false)}
                >
                  <Icon size={20} />
                </button>
              ))}
            </div>
            <div className="world-footnote">
              <span className="tiny-star">✳</span>
              <p>
                {metrics.nearLever && playing
                  ? "You found a lever. Press E, or tap it, and see what changes."
                  : world.description}
              </p>
              <button
                onClick={() => setDialog("help")}
                aria-label="Learn how this world works"
              >
                <CircleHelp size={15} />
              </button>
            </div>
          </section>
        </div>
        {draft && (
          <section
            className="interpretation-preview"
            aria-label="Review drawing interpretation"
          >
            <div>
              <div className="eyebrow">YOUR PAGE, INTERPRETED</div>
              <h2>{draft.name}</h2>
              <p>{draft.description}</p>
              <p>
                {draft.entities.length} objects ·{" "}
                {draft.entities.filter((e) => e.kind === "coin").length}{" "}
                collectibles ·{" "}
                {draft.entities.filter((e) => e.kind === "lever").length} levers
              </p>
            </div>
            <button
              className="primary-button"
              onClick={() => {
                loadWorld(draft);
                tell(
                  "This is your drawing’s first world. Press play to explore.",
                );
              }}
            >
              Open this world <ArrowUpRight size={18} />
            </button>
            <button className="text-button" onClick={() => setDraft(null)}>
              Keep current world
            </button>
          </section>
        )}
        {error && (
          <div role="alert" className="error-notice">
            <span>{error}</span>
            <button
              className="icon-button"
              aria-label="Dismiss error"
              onClick={() => setError("")}
            >
              <X size={16} />
            </button>
          </div>
        )}
        <section className="example-section" aria-label="Example worlds">
          <div className="example-intro">
            <div className="eyebrow">A FEW SPARKS TO START</div>
            <h2>
              Every world
              <br />
              starts somewhere.
            </h2>
            <p>
              Explore three original examples.
              <br />
              Then make it unmistakably yours.
            </p>
          </div>
          <div className="example-grid">
            {EXAMPLES.map((example, i) => (
              <button
                key={example.id}
                className={`example-card example-${example.theme} ${world.id === example.id ? "selected" : ""}`}
                disabled={busy}
                onClick={() => {
                  loadWorld(freshExample(example.id));
                  setIntent(example.description);
                  tell(`${example.name} is ready to explore.`);
                }}
              >
                <div className="example-art">
                  <span className="example-number">0{i + 1}</span>
                  <div className="mini-sun" />
                  <div className="mini-hill back" />
                  <div className="mini-hill front" />
                  <img
                    className="mini-hero"
                    src={example.entities.find((e) => e.kind === "player")!.art}
                    alt=""
                  />
                  <img className="mini-seed" src="/art/seed.svg" alt="" />
                  <span className="example-open">
                    {world.id === example.id ? (
                      <Check size={16} />
                    ) : (
                      <ArrowUpRight size={17} />
                    )}
                  </span>
                </div>
                <div className="example-card-copy">
                  <strong>{example.name}</strong>
                  <span>
                    {
                      [
                        "A curious creature & a quiet grove",
                        "A stargazer & a sky full of wonder",
                        "A tiny robot & a very big day",
                      ][i]
                    }
                  </span>
                </div>
              </button>
            ))}
          </div>
        </section>
        <footer className="studio-footer">
          <span>
            <Sprout size={16} /> A playground for the things only you could
            imagine.
          </span>
          <button onClick={() => setDialog("help")}>
            Made for little wonders <ArrowUpRight size={13} />
          </button>
        </footer>
      </main>
      <div
        className={`toast ${notice ? "visible" : ""}`}
        role="status"
        aria-live="polite"
      >
        {notice && (
          <>
            <span className="toast-spark">✳</span>
            {notice}
            <button
              aria-label="Dismiss notification"
              onClick={() => setNotice("")}
            >
              <X size={14} />
            </button>
          </>
        )}
      </div>
      {dialog === "sketch" && (
        <SketchPad
          onClose={() => setDialog(null)}
          onUse={(image) => useSource(image)}
        />
      )}
      {dialog === "worlds" && (
        <Modal title="Your little worlds" onClose={() => setDialog(null)}>
          <p className="modal-copy">
            Saved in this browser, with your adventure right where you left it.
          </p>
          {saved.length ? (
            <div className="saved-worlds">
              {saved.map((entry) => (
                <button
                  key={entry.world.id}
                  onClick={() => {
                    loadWorld(
                      entry.world,
                      retainPlayState(entry.world, entry.state),
                    );
                    setDialog(null);
                  }}
                >
                  <img src={entry.world.sourceImage} alt="" />
                  <span>
                    <strong>{entry.world.name}</strong>
                    <small>
                      {entry.state.collected.length} sunseeds ·{" "}
                      {new Date(entry.savedAt).toLocaleDateString()}
                    </small>
                  </span>
                  <ChevronRight size={18} />
                </button>
              ))}
            </div>
          ) : (
            <div className="empty-worlds">
              <FolderHeart size={38} strokeWidth={1.2} />
              <h3>A home for your imagination.</h3>
              <p>
                Play a little, then use the save button beside your world’s
                name. Your first world will be waiting here.
              </p>
            </div>
          )}
        </Modal>
      )}
      {dialog === "settings" && (
        <Modal title="Your studio, connected" onClose={() => setDialog(null)}>
          <div className="connection-card">
            <div className="meta-mark">∞</div>
            <div>
              <strong>
                {connection?.label ?? "Meta drawing interpretation"}
              </strong>
              <p>
                <span
                  className={`status-dot ${connection?.configured ? "connected" : ""}`}
                />
                {connection?.configured
                  ? "Configured · ready for a first live trial"
                  : connectionError
                    ? "Local API is unavailable"
                    : "API key not configured"}
              </p>
            </div>
          </div>
          <p className="modal-copy">
            The playable examples work now. To interpret a new drawing, the
            studio needs a server connection to a Meta model. Direct Meta
            billing issues can be handled separately while you use your credited
            Baseten account.
          </p>
          <div className="setup-instructions">
            <p>
              In this project’s <code>.env.local</code>, add:
            </p>
            <pre>
              {connection?.provider === "meta"
                ? "MODEL_PROVIDER=meta\nMODEL_API_KEY=your_meta_key"
                : "MODEL_PROVIDER=baseten\nBASETEN_API_KEY=your_baseten_key"}
            </pre>
            <p>
              Restart the studio, then check the connection below. Keep the key
              on the server.
            </p>
          </div>
          <p className="small-note">
            Baseten uses Meta’s Muse Spark Open. Its JSON output is checked
            locally; a live trial is still required. To use direct Meta access,
            set MODEL_PROVIDER=meta and configure MODEL_API_KEY instead.
            Provider selection is explicit when both keys exist.
          </p>
          <div className="setup-details">
            <span>Model</span>
            <code>{connection?.model ?? "muse-wonder-1.0"}</code>
            <span>Session request limit</span>
            <span>
              {connection
                ? `${connection.requestsRemaining} remaining`
                : "Not available"}
            </span>
            <span>Current build</span>
            <span>Milestone 1 · Studio foundation</span>
          </div>
          <p className="small-note">
            The interpretation adapter is included. Live drawing quality and
            paper updates are the next milestones; example worlds are authored
            demonstrations.
          </p>
          <button
            className="secondary-button"
            onClick={() => void checkConnection()}
          >
            <RotateCcw size={16} /> Check connection
          </button>
        </Modal>
      )}
      {dialog === "help" && (
        <Modal
          title="A small guide to big possibilities"
          onClose={() => setDialog(null)}
        >
          <div className="help-lead">
            <Sprout size={30} />
            <p>
              Doodlume turns a page into a place you can explore. This first
              studio milestone gives you the canvas, the controls, and three
              real playable examples.
            </p>
          </div>
          <div className="help-steps">
            <div>
              <span>01</span>
              <section>
                <h3>Start with a page</h3>
                <p>
                  Add a clear drawing, or open the pencil to make one here. Your
                  page stays visible beside your world.
                </p>
              </section>
            </div>
            <div>
              <span>02</span>
              <section>
                <h3>Take a little adventure</h3>
                <p>
                  Move with ← → or A / D. Jump with Space, ↑, or W. Collect the
                  sunseeds. Press E near a lever to open its gate. Find home.
                </p>
              </section>
            </div>
            <div>
              <span>03</span>
              <section>
                <h3>Keep the little things</h3>
                <p>
                  Save your world to this device. Its character position,
                  sunseeds, and open gates come with it.
                </p>
              </section>
            </div>
          </div>
          <div className="help-next">
            <Layers3 size={21} />
            <div>
              <strong>Next: your paper becomes the editor.</strong>
              <p>
                Live Meta interpretation, original artwork extraction, and fresh
                drawings that change the same world are still to be verified and
                completed.
              </p>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
