import { lazy, Suspense, useEffect, useRef, useState, type CSSProperties } from "react";
import { ArrowRight, ArrowUpRight, Pause, Pencil, Play, RotateCcw, Maximize2, Minimize2, Check } from "lucide-react";
import { retainPlayState, validateWorld, type PlayState, type WorldDefinition } from "../../shared/world";
import type { WorldCanvasHandle } from "./WorldCanvas";
import { extractSketchInk } from "../lib/ink";
import { Brand } from "./Brand";
import "./Home.css";

const LiveWorld = lazy(() => import("./WorldCanvas").then(m => ({ default: m.WorldCanvas })));
const SketchPad = lazy(() => import("./SketchPad").then(m => ({default:m.SketchPad})));
const scenes = [
  { id: "rover", title: "Invent a rescue", type: "Illustration + drawn invention", image: "/art/showcase/rover-source.webp", instruction: "Select a tool, then the object it works with.", alt: "An illustrated rover stranded among orange mesas and glowing blue crystals", aspect: "16 / 9" },
  { id: "cat-care", title: "Care for a character", type: "Rough pencil drawing → pet care", image: "/art/showcase/cat-care-source.webp", instruction: "Select the fish, then the hungry cat.", alt: "A rough pencil drawing of a cat, rooftops and a fish on lined paper", aspect: "3 / 2" },
  { id: "clockwork", title: "Explore a world", type: "Illustration → adventure", image: "/art/showcase/clockwork-0.webp", instruction: "Arrow keys to move · Space to jump", alt: "An intricate ink drawing of floating ruins, a brass beetle and a crystal doorway", aspect: "3 / 2" },
];

export default function Home() {
  const [index, setIndex] = useState(0);
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
  const inventionAction = world?.interactions?.actions.find(action => action.kind === "attach" && world.entities.some(entity=>entity.id===action.toolId && entity.art && !entity.artSource));
  const invention = world?.entities.find(entity=>entity.id===inventionAction?.toolId);
  const [inventionUsed, setInventionUsed] = useState(false);
  const stage = useRef<HTMLDivElement>(null);
  const showcase = useRef<HTMLDivElement>(null);
  const focusRequested = useRef(false);
  const scene = scenes[index];
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
    // The drawing dialog lives outside the full-screen element. Leave full
    // screen first so it stays visible and keyboard reachable.
    if (document.fullscreenElement === showcase.current) {
      try { await document.exitFullscreen(); }
      catch { setDisplayNotice("Exit full screen to draw your part."); return; }
    }
    wasPlaying.current=playing; setPlaying(false); setDrawing(true);
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
      // A deliberate Play/Resume hands keyboard control to the game. Never
      // steal focus if the visitor moved to navigation while it was loading.
      const active = document.activeElement;
      if (active === document.body || container.parentElement?.contains(active)) {
        canvas.focus({ preventScroll: true });
      }
      focusRequested.current = false;
      observer.disconnect();
    }
    const observer = new MutationObserver(focusWhenReady);
    observer.observe(container, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-ready"] });
    focusWhenReady();
    return () => observer.disconnect();
  }, [playing, world?.id, run]);
  function choose(i: number) { setIndex(i); setLoading(false); setPlaying(false); setShowSource(false); setWorld(undefined); setInitial(undefined); setDrawingDraft(undefined); setInventionUsed(false); setComplete(false); setError(""); setMoment(""); setMission(""); setProgress(""); focusRequested.current = false; setRun(n => n + 1); }
  function play() { focusRequested.current = true; setShowSource(false); setError(""); if (world) setPlaying(true); else setLoading(true); }
  function restart() { focusRequested.current = true; setInitial(undefined); setInventionUsed(false); setShowSource(false); setComplete(false); setRun(n => n + 1); setPlaying(true); }
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
      const ink=await extractSketchInk(image);
      const ratio=Math.max(.04,Math.min(25,ink.aspectRatio));
      const height=Math.max(12,Math.round(180/Math.max(1,ratio))),width=Math.max(12,Math.round(height*ratio));
      const next=validateWorld({...world,revision:world.revision+1,entities:world.entities.map(entity=>entity.id===invention.id ? {...entity,art:ink.art,width,height,x:Math.min(entity.x,world.width-width),y:Math.min(entity.y,world.height-height)} : entity)});
      const state=game.current?.snapshot();
      setInitial(state ? retainPlayState(next,state) : undefined); setWorld(next); setRun(value=>value+1);
      setDrawing(false); setDrawingDraft(undefined); setError(""); setShowSource(false); setPlaying(true); focusRequested.current=true;
    } catch(e) { setDrawingDraft(image); setError(e instanceof Error ? e.message : "Your part could not be added. The game is unchanged."); setDrawing(false); }
  }
  return <div className="home-page">
    <a className="home-skip" href="#home-content">Skip to content</a>
    <header className="home-header">
      <a href="#" className="home-brand" aria-label="Doodlume home"><Brand /></a>
      <nav aria-label="Main navigation"><a href="#how-it-works">How it works</a><a href="#studio" className="home-studio-link">Open studio <ArrowUpRight size={16}/></a></nav>
    </header>
    <main id="home-content">
      <section className="home-hero" aria-labelledby="home-title">
        <div className="home-intro">
          <div className="home-title-block"><p className="home-eyebrow">A GAME STUDIO FOR YOUR IMAGINATION</p>
          <h1 id="home-title">Play outside <em>the lines.</em></h1></div>
          <div className="home-create-rail"><p className="home-description">Your drawings and photos. Now worlds you can play.</p>
          <div className="home-create-options"><a className="home-cta" href="#studio?create=upload">Make your game <ArrowUpRight size={20}/></a>
          <a className="home-draw-link" href="#studio?create=sketch"><Pencil size={16}/> Draw instead</a></div></div>
        </div>
        <div className="home-showcase" id="play-room" tabIndex={-1} ref={showcase}>
          <div className={`home-showcase-caption ${world ? "has-mission" : ""}`}><span>{showSource ? "THE ORIGINAL" : world ? complete ? "World complete" : mission : "PLAY AN EXAMPLE"}</span><span>{world ? complete || showSource ? "" : progress : `0${index + 1} / 0${scenes.length}`}</span></div>
          <div ref={stage} style={{"--scene-aspect":scene.aspect} as CSSProperties} className={`home-live-stage ${world ? "is-live" : ""}`} onKeyDown={event => {
            // Keep game keys inside the playable stage even on the frame a
            // goal completes and the game releases its keyboard capture.
            if ((!playing || complete) && (event.target as HTMLElement).closest('[role="application"]') && ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(event.key)) event.preventDefault();
          }}>
            {world && <div className="home-game-layer" style={{visibility:showSource ? "hidden" : "visible"}} aria-hidden={showSource} inert={showSource}><Suspense fallback={<div className="home-stage-loading">Opening your world…</div>}><LiveWorld ref={game} world={world} initial={initial} controlsHost={controlsHost} playing={playing && !showSource && !drawing} muted run={run} overview={false}
              onUpdate={(state, metrics) => { const finished=metrics.completed && !metrics.exploring; setComplete(finished); setInventionUsed(Boolean(inventionAction && state.interactions?.completed.includes(inventionAction.id))); if (finished) setPlaying(false); setProgress(metrics.requiredTotal ? `${metrics.requiredDone}/${metrics.requiredTotal} done` : ""); }} onMoment={setMoment} onError={message => { setError(message); setPlaying(false); }}/></Suspense></div>}
            {(!world || showSource) && <img className="home-source" src={showSource ? scene.image : `/art/showcase/${scene.id}-preview.webp`} alt={scene.alt} fetchPriority="high" width="1536" height="1024"/>}
            {!playing && !complete && !showSource && !error && <div className={`home-play-prompt ${world ? "home-play-paused" : ""}`}>
              <button onClick={play} disabled={loading}>
                <Play size={18} fill="currentColor"/>{loading ? "Opening…" : world ? "Continue playing" : "Play this example"}
              </button>
            </div>}
            {error && <div className="home-play-prompt home-play-paused" role="alert"><p>{error}</p><button onClick={retry}>Try again</button></div>}
          </div>
          <div className="home-stage-footer"><span>{showSource ? "AI-generated test image · original source" : world ? complete ? "What will you invent?" : scene.instruction : scene.type}</span><div className="home-stage-actions">{typeof document.documentElement.requestFullscreen === "function" && <button aria-label={fullscreen ? "Exit full screen" : "Full screen example"} title={fullscreen ? "Exit full screen" : "Full screen example"} onClick={() => void toggleFullscreen()}>{fullscreen ? <Minimize2 size={17}/> : <Maximize2 size={17}/>}</button>}{complete && !showSource && <button className="home-original-toggle" onClick={restart}><RotateCcw size={14}/>Play again</button>}{world && <button className="home-original-toggle" aria-pressed={showSource} onClick={() => { setShowSource(value=>!value); setPlaying(false); }}>{showSource ? "Back to game" : "See original"}</button>}{world && !complete && <button aria-label={playing ? "Pause example" : "Resume example"} onClick={() => { if (playing) setPlaying(false); else play(); }}>{playing ? <Pause size={15}/> : <Play size={15}/>}</button>}</div><span className="sr-only" aria-live="polite">{moment}</span></div>
          {displayNotice && <p className="home-display-notice" role="status">{displayNotice}</p>}
          {world && <div className="home-example-tools" style={{visibility:showSource ? "hidden" : "visible"}} aria-hidden={showSource} inert={showSource}>
            {invention && !inventionUsed && <button className="home-invent-button" onClick={()=>void drawPart()}><Pencil size={14}/>Draw your own part</button>}
            <div ref={setControlsHost} className="home-object-controls"/>
          </div>}
          <div className="home-scene-picker" aria-label="Choose an example">
            {scenes.map((item,i) => <button key={item.id} aria-pressed={i === index} onClick={() => choose(i)}><img src={`/art/showcase/${item.id}-thumb.webp`} alt="" width="192" height="128" loading="lazy"/><span><small>{i === index ? "Selected" : `0${i+1}`}</small>{item.title}</span>{i === index && <Check size={15}/>}</button>)}
          </div>
          <p className="home-example-note">Authored examples · AI-generated source artwork</p>
        </div>
      </section>
      <section className="home-making" id="how-it-works" aria-labelledby="making-title">
        <div className="home-making-art"><img src="/art/showcase/cat-care-preview.webp" alt="An imperfect pencil drawing of a cat, rooftops and a fish" loading="lazy" width="1536" height="1024"/><a className="home-drawing-play" href="#play-room" onClick={()=>{choose(1);focusRequested.current=true;setLoading(true);}}><Play size={15} fill="currentColor"/> Play this drawing</a><span><small>AI-generated sample drawing.</small></span></div>
        <div className="home-making-content"><p className="home-eyebrow">FROM A MARK TO A MOVE</p><h2 id="making-title">A little imagination.<br/><em>A world of your own.</em></h2>
        <ol className="home-steps">
          <li><span>01</span><div><h3>Bring something yours.</h3><p>A drawing, a photograph, an unfinished idea.</p></div></li>
          <li><span>02</span><div><h3>Give it a reason to play.</h3><p>Choose what matters. Make a character care, a machine move, a place worth exploring.</p></div></li>
          <li><span>03</span><div><h3>Change the next move.</h3><p>Draw a useful part and give it an ability. Keep the world you already made.</p></div></li>
        </ol><a className="home-text-cta" href="#studio?create=upload">Make your game <ArrowUpRight size={18}/></a></div>
      </section>
    </main>
    <footer className="home-footer"><a className="home-brand" href="#" aria-label="Doodlume home"><Brand /></a><p>Powered by Meta Muse Spark Open.</p><a href="#studio">Enter the studio <ArrowRight size={15}/></a></footer>
    {drawing && <Suspense fallback={<div className="home-stage-loading">Opening your drawing…</div>}><SketchPad title="Draw your rescue part" useLabel="Add to this game" resumeImage={drawingDraft} onPause={setDrawingDraft} onClose={()=>{setDrawing(false);setPlaying(wasPlaying.current);}} onUse={image=>void useInvention(image)}/></Suspense>}
  </div>;
}
