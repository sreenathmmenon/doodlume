import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { ArrowUpRight, Pause, Pencil, Play, RotateCcw, Maximize2, Minimize2, Check } from "lucide-react";
import { emptyPlayState, retainPlayState, validateWorld, type PlayState, type WorldDefinition } from "../../shared/world";
import { entryFromExample, type StudioEntry } from "../lib/studio-entry";
import { countBeats, goalTitle, readBoxes, readRelations, ruleSentences } from "../lib/home-reading";
import type { WorldCanvasHandle } from "./WorldCanvas";
import { extractSketchInk } from "../lib/ink";
import { Brand } from "./Brand";
import { HomeLens } from "./home/HomeLens";
import { HomeRules } from "./home/HomeRules";
import { HomeCount } from "./home/HomeCount";
import catalog from "../../public/art/showcase/catalog.json";
import patioWorld from "../../public/art/showcase/patio-care.json";
import roverWorld from "../../public/art/showcase/rover.json";
import rooftopWorld from "../../public/art/showcase/rooftop-run.json";
import "./Home.css";

const LiveWorld = lazy(() => import("./WorldCanvas").then(m => ({ default: m.WorldCanvas })));
const SketchPad = lazy(() => import("./SketchPad").then(m => ({ default: m.SketchPad })));

type Scene = { id: string; title: string; kind: string; provenance: string; preview: string; href: string; purpose: string; credit?: string; source?: string };
const scenes: Scene[] = catalog.examples;
const art = (id: string, part: string) => `/art/showcase/${id}-${part}.webp`;
const aspectOf: Record<string, string> = { rover: "16 / 9", "patio-care": "3 / 2" };

/** The four moves a visitor can make on this page. The header keeps score. */
const MOVES = ["Play the drawing", "Look through the lens", "Change a rule", "Read it to the end"];
function useLoopScore() {
  const [done, setDone] = useState<boolean[]>(() => {
    try { const v = sessionStorage.getItem("doodlume-home-loop"); if (v) return JSON.parse(v); } catch { /* storage may be unavailable */ }
    return MOVES.map(() => false);
  });
  const complete = useCallback((i: number) => setDone(d => { if (d[i]) return d; const n = d.map((v, k) => (k === i ? true : v)); try { sessionStorage.setItem("doodlume-home-loop", JSON.stringify(n)); } catch { /* ignore */ } return n; }), []);
  return { done, complete };
}

export default function Home({ onContinueInStudio }: { onContinueInStudio?: (entry: StudioEntry) => void }) {
  const [index, setIndex] = useState(() => Math.max(0, scenes.findIndex(s => s.id === "rooftop-springs")));
  const [world, setWorld] = useState<WorldDefinition>();
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [complete, setComplete] = useState(false);
  const [run, setRun] = useState(0);
  const [moment, setMoment] = useState("");
  const [mission, setMission] = useState("");
  const [progress, setProgress] = useState("");
  const [showSource, setShowSource] = useState(false);
  const [controlsHost, setControlsHost] = useState<HTMLDivElement | null>(null);
  const [initial, setInitial] = useState<PlayState>();
  const [drawing, setDrawing] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [displayNotice, setDisplayNotice] = useState("");
  const [drawingDraft, setDrawingDraft] = useState<string>();
  const game = useRef<WorldCanvasHandle>(null);
  const wasPlaying = useRef(false);
  const inventionAction = world?.interactions?.actions.find(action => action.kind === "attach" && world.entities.some(entity => entity.id === action.toolId && entity.art && !entity.artSource));
  const invention = world?.entities.find(entity => entity.id === inventionAction?.toolId);
  const [inventionUsed, setInventionUsed] = useState(false);
  const stage = useRef<HTMLDivElement>(null);
  const showcase = useRef<HTMLDivElement>(null);
  const focusRequested = useRef(false);
  const scene = scenes[index];
  const score = useLoopScore();
  const scoreN = score.done.filter(Boolean).length;
  const nextMove = score.done.indexOf(false);

  const reading = useMemo(() => {
    const patio = validateWorld(patioWorld), rover = validateWorld(roverWorld), rooftop = validateWorld(rooftopWorld);
    const links = Object.fromEntries((rover.interactions?.actions ?? []).map(a => [a.id, { from: a.toolId, to: a.targetId }]));
    return {
      patio: { world: patio, boxes: readBoxes(patio), relations: readRelations(patio), goal: goalTitle(patio) },
      rover: { world: rover, boxes: readBoxes(rover), sentences: ruleSentences(rover).slice(0, 2), links },
      rooftop: { world: rooftop, boxes: readBoxes(rooftop), beats: countBeats(rooftop), goal: goalTitle(rooftop) },
    };
  }, []);

  useEffect(() => {
    const update = () => setFullscreen(document.fullscreenElement === showcase.current);
    document.addEventListener("fullscreenchange", update);
    return () => document.removeEventListener("fullscreenchange", update);
  }, []);
  async function toggleFullscreen() {
    setDisplayNotice("");
    try {
      if (document.fullscreenElement === showcase.current) await document.exitFullscreen();
      else await showcase.current?.requestFullscreen();
    } catch { setDisplayNotice("Full screen is unavailable. Keep playing here."); }
  }
  async function drawPart() {
    if (document.fullscreenElement === showcase.current) {
      try { await document.exitFullscreen(); }
      catch { setDisplayNotice("Exit full screen to draw your part."); return; }
    }
    wasPlaying.current = playing; setPlaying(false); setDrawing(true);
  }
  useEffect(() => { document.title = "Doodlume — Your imagination. Now playable."; }, []);
  useEffect(() => {
    if (!loading) return;
    const controller = new AbortController();
    fetch(`/art/showcase/${scene.id}.json`, { signal: controller.signal })
      .then(r => { if (!r.ok) throw Error("This example couldn't open. Please try again."); return r.json(); })
      .then(data => { const result = validateWorld(data); if (controller.signal.aborted) return; setWorld(result); setMission(result.gameplay?.objectiveTitle ?? result.name); setPlaying(true); })
      .catch(e => { if (!controller.signal.aborted && e.name !== "AbortError") setError(e.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [loading, scene.id]);
  useEffect(() => {
    if (!playing || !world || !focusRequested.current || !stage.current) return;
    const container = stage.current;
    function focusWhenReady() {
      const canvas = container.querySelector<HTMLElement>('[role="application"][data-ready="true"]');
      if (!canvas) return;
      const active = document.activeElement;
      if (active === document.body || container.parentElement?.contains(active)) canvas.focus({ preventScroll: true });
      focusRequested.current = false;
      observer.disconnect();
    }
    const observer = new MutationObserver(focusWhenReady);
    observer.observe(container, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-ready"] });
    focusWhenReady();
    return () => observer.disconnect();
  }, [playing, world?.id, run]);
  function choose(i: number) { setIndex(i); setLoading(false); setPlaying(false); setShowSource(false); setWorld(undefined); setInitial(undefined); setDrawingDraft(undefined); setInventionUsed(false); setComplete(false); setError(""); setMoment(""); setMission(""); setProgress(""); focusRequested.current = false; setRun(n => n + 1); }
  function play() { focusRequested.current = true; setShowSource(false); setError(""); score.complete(0); if (world) setPlaying(true); else setLoading(true); }
  function restart() { focusRequested.current = true; setInitial(undefined); setInventionUsed(false); setShowSource(false); setComplete(false); setRun(n => n + 1); setPlaying(true); }
  function keepCreating() {
    if (!world || !onContinueInStudio) return;
    try { onContinueInStudio(entryFromExample(world, game.current?.snapshot() ?? initial ?? emptyPlayState())); }
    catch { setDisplayNotice("This world couldn’t move to the studio. Your game is still here."); }
  }
  function retry() {
    setError("");
    if (drawingDraft && invention) { setDrawing(true); return; }
    focusRequested.current = true;
    if (world) {
      const state = game.current?.snapshot() ?? initial;
      setInitial(state ? retainPlayState(world, state) : undefined);
      setRun(value => value + 1); setPlaying(true);
    } else setLoading(true);
  }
  async function useInvention(image: string) {
    if (!world || !invention) return;
    try {
      const ink = await extractSketchInk(image);
      const ratio = Math.max(.04, Math.min(25, ink.aspectRatio));
      const height = Math.max(12, Math.round(180 / Math.max(1, ratio))), width = Math.max(12, Math.round(height * ratio));
      const next = validateWorld({ ...world, revision: world.revision + 1, entities: world.entities.map(entity => entity.id === invention.id ? { ...entity, art: ink.art, width, height, x: Math.min(entity.x, world.width - width), y: Math.min(entity.y, world.height - height) } : entity) });
      const state = game.current?.snapshot();
      setInitial(state ? retainPlayState(next, state) : undefined); setWorld(next); setRun(value => value + 1);
      setDrawing(false); setDrawingDraft(undefined); setError(""); setShowSource(false); setPlaying(true); focusRequested.current = true;
    } catch (e) { setDrawingDraft(image); setError(e instanceof Error ? e.message : "Your part could not be added. The game is unchanged."); setDrawing(false); }
  }
  const lensLooked = useCallback(() => score.complete(1), [score.complete]);
  const ruleChanged = useCallback(() => score.complete(2), [score.complete]);
  const countFinished = useCallback(() => score.complete(3), [score.complete]);

  return <div className="home-page">
    <a className="home-skip" href="#home-content">Skip to content</a>
    <header className="home-header">
      <a href="#" className="home-brand" aria-label="Doodlume home"><Brand/></a>
      <nav aria-label="Main navigation">
        <div className={`home-score ${scoreN === MOVES.length ? "is-done" : ""}`} role="status" aria-label={`${scoreN} of ${MOVES.length} moves made`}><span className="home-score-n"><b key={scoreN} className="is-tick">{scoreN}</b>/{MOVES.length}</span><span className="home-score-t">{nextMove === -1 ? "Four moves explored" : MOVES[nextMove]}</span></div>
        <a href="#read">Worlds</a>
        <a href="#studio" className="home-studio-link">Open studio <ArrowUpRight size={16}/></a>
      </nav>
    </header>
    <main id="home-content">
      <section className="home-hero" aria-labelledby="home-title">
        <div className="home-intro">
          <h1 id="home-title">Draw the missing part.</h1>
          <p className="home-description">Draw a part. Choose its ability. Change how your world plays.</p>
          <div className="home-create-options">
            <a className="home-cta" href="#studio?create=upload">Make your game <ArrowUpRight size={18}/></a>
            <a className="home-draw-link" href="#studio?create=sketch"><Pencil size={16}/> Draw instead</a>
          </div>
        </div>
        <div className="home-showcase" id="play-room" tabIndex={-1} ref={showcase}>
          <div className={`home-live-stage ${world ? "is-live" : ""}`} ref={stage} style={{ "--scene-aspect": aspectOf[scene.id] ?? "3 / 2" } as CSSProperties} onKeyDown={event => {
            if (event.key === "Escape" && playing && !drawing) {
              if (!game.current?.dismissObjectChoices()) setPlaying(false);
              event.preventDefault(); event.stopPropagation();
            }
            if ((!playing || complete) && (event.target as HTMLElement).closest('[role="application"]') && ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(event.key)) event.preventDefault();
          }}>
            {world && <div className="home-game-layer" style={{ visibility: showSource ? "hidden" : "visible" }} aria-hidden={showSource} inert={showSource}><Suspense fallback={<div className="home-stage-loading">Opening your world…</div>}><LiveWorld ref={game} world={world} initial={initial} controlsHost={controlsHost} playing={playing && !showSource && !drawing} muted run={run} overview={false}
              onUpdate={(state, metrics) => { const finished = metrics.completed && !metrics.exploring; setComplete(finished); setInventionUsed(Boolean(inventionAction && state.interactions?.completed.includes(inventionAction.id))); if (finished) setPlaying(false); setProgress(metrics.requiredTotal ? `${metrics.requiredDone}/${metrics.requiredTotal}` : ""); }} onMoment={setMoment} onError={message => { setError(message); setPlaying(false); }}/></Suspense></div>}
            {(!world || showSource) && <img key={`${scene.id}:${showSource ? "source" : "preview"}`} className="home-source" src={showSource ? art(scene.id, "source") : scene.preview} onError={e => { if (showSource) (e.currentTarget as HTMLImageElement).src = scene.preview; }} alt={scene.purpose} fetchPriority="high" width="1536" height="1024"/>}
            <div className={`goal-chip ${complete ? "is-done" : ""}`}><span className="goal-chip-n">{world ? (progress || "0/1") : "0/1"}</span><span>{showSource ? "The original" : complete ? "Done" : mission || scene.title}</span></div>
            {!playing && !complete && !showSource && !error && <div className={`home-play-prompt ${world ? "home-play-paused" : ""}`}>
              <button onClick={play} disabled={loading}><Play size={18} fill="currentColor"/>{loading ? "Opening…" : world ? "Continue" : "Play"}</button>
            </div>}
            {error && <div className="home-play-prompt home-play-paused" role="alert"><p>{error}</p><button onClick={retry}>Try again</button></div>}
          </div>
          <div className="home-stage-footer">
            <span className="home-stage-note">{showSource ? (scene.kind === "photograph" ? "Original photograph" : "Original drawing") : scene.provenance}</span>
            <div className="home-stage-actions">
              {typeof document.documentElement.requestFullscreen === "function" && <button aria-label={fullscreen ? "Exit full screen" : "Full screen"} title={fullscreen ? "Exit full screen" : "Full screen"} onClick={() => void toggleFullscreen()}>{fullscreen ? <Minimize2 size={17}/> : <Maximize2 size={17}/>}</button>}
              {complete && !showSource && <button className="home-original-toggle" onClick={restart}><RotateCcw size={14}/>Play again</button>}
              {world && <button className="home-original-toggle" aria-pressed={showSource} onClick={() => { setShowSource(value => !value); setPlaying(false); }}>{showSource ? "Back to game" : "See original"}</button>}
              {world && !complete && <button aria-label={playing ? "Pause" : "Resume"} onClick={() => { if (playing) setPlaying(false); else play(); }}>{playing ? <Pause size={15}/> : <Play size={15}/>}</button>}
            </div>
            <span className="sr-only" aria-live="polite">{moment}</span>
          </div>
          {displayNotice && <p className="home-display-notice" role="status">{displayNotice}</p>}
          {world && <div className="home-example-tools" style={{ visibility: showSource ? "hidden" : "visible" }} aria-hidden={showSource} inert={showSource}>
            {invention && !inventionUsed && <button className="home-invent-button" onClick={() => void drawPart()}><Pencil size={14}/>Redraw {invention.label?.toLowerCase() || "this part"}</button>}
            {onContinueInStudio && <button className="home-keep-creating" onClick={keepCreating}>{complete ? "Make it yours" : "Keep creating in studio"}<ArrowUpRight size={15}/></button>}
            <div ref={setControlsHost} className="home-object-controls"/>
          </div>}
          <div className="home-scene-picker" aria-label="Choose an example">
            {scenes.map((item, i) => <button key={item.id} aria-pressed={i === index} onClick={() => choose(i)}><img src={art(item.id, "thumb")} alt="" width="192" height="128" loading="lazy"/><span><small>{i === index ? "Selected" : item.kind}</small>{item.title}</span>{i === index && <Check size={15}/>}</button>)}
          </div>
          {scene.credit && scene.source && <p className="home-example-note"><a href={scene.source} target="_blank" rel="noreferrer">{scene.credit}</a></p>}
        </div>
      </section>

      <section className="home-beat" id="read" aria-labelledby="read-title">
        <div className="home-beat-head"><h2 id="read-title">It reads a photo the same way.</h2><span className={`home-move ${score.done[1] ? "is-done" : ""}`}><b>2</b>Look through the lens</span></div>
        <HomeLens src={art("patio-care", "preview")} alt="A photo of a person watering a potted succulent on a wooden table" boxes={reading.patio.boxes} relations={reading.patio.relations} goal={reading.patio.goal} onLooked={lensLooked}/>
        <div className="home-beat-foot"><span>Goal found: <b>{reading.patio.goal}</b></span><a className="home-play-link" href="#studio?example=patio-care"><Play size={14} fill="currentColor"/>Play the photo</a></div>
      </section>

      <section className="home-beat" id="rule" aria-labelledby="rule-title">
        <div className="home-beat-head"><h2 id="rule-title">Same picture. Your rules.</h2><span className={`home-move ${score.done[2] ? "is-done" : ""}`}><b>3</b>Change a highlighted word</span></div>
        <HomeRules sentences={reading.rover.sentences} boxes={reading.rover.boxes} links={reading.rover.links} src={art("rover", "preview")} alt="An illustrated rover among orange mesas, glowing crystals and a beacon" onChanged={ruleChanged}/>
        <div className="home-beat-foot"><span>Preview only. Edit real rules in the studio.</span><a className="home-play-link" href="#studio?example=rover"><Play size={14} fill="currentColor"/>Open game in studio</a></div>
      </section>

      <section className="home-beat" id="count" aria-labelledby="count-title">
        <div className="home-beat-head"><h2 id="count-title">A rough drawing has three things to do.</h2><span className={`home-move ${score.done[3] ? "is-done" : ""}`}><b>4</b>Read it to the end</span></div>
        <HomeCount src={art("rooftop-run", "preview")} alt="An imperfect pencil drawing of a cat on a rooftop, a ladder and a fish on the next roof" beats={reading.rooftop.beats} boxes={reading.rooftop.boxes} goal={reading.rooftop.goal} playHref="#studio?example=rooftop-run" onFinished={countFinished}/>
      </section>

      <section className="home-end" aria-labelledby="end-title">
        <h2 id="end-title">{scoreN === MOVES.length ? "Four moves. You just played a homepage." : "Now with your own picture."}</h2>
        <div className="home-create-options"><a className="home-cta" href="#studio?create=upload">Make your game <ArrowUpRight size={18}/></a><a className="home-draw-link" href="#studio?create=sketch"><Pencil size={16}/> Draw instead</a></div>
      </section>
    </main>
    <footer className="home-footer"><a className="home-brand" href="#" aria-label="Doodlume home"><Brand/></a><p>Powered by Meta Muse Spark Open.</p><a href="#studio">Enter the studio <ArrowUpRight size={15}/></a></footer>
    {drawing && <Suspense fallback={<div className="home-stage-loading">Opening your drawing…</div>}><SketchPad title="Redraw this part · keep its ability" useLabel="Use this drawing" resumeImage={drawingDraft} onPause={setDrawingDraft} onClose={() => { setDrawing(false); setPlaying(wasPlaying.current); }} onUse={image => void useInvention(image)}/></Suspense>}
  </div>;
}
