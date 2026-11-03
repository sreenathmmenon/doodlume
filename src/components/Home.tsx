import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { ArrowRight, ArrowUpRight, Pause, Play, RotateCcw } from "lucide-react";
import { validateWorld, type WorldDefinition } from "../../shared/world";
import "./Home.css";

const LiveWorld = lazy(() => import("./WorldCanvas").then(m => ({ default: m.WorldCanvas })));
const scenes = [
  { id: "clockwork", title: "An imagined world", type: "Illustration → adventure", image: "/art/showcase/clockwork-0.webp", instruction: "Arrow keys to move · Space to jump" },
  { id: "dino", title: "A little imagination", type: "Crayon drawing → platformer", image: "/art/showcase/dino-0.webp", instruction: "Arrow keys to move · Space to jump" },
  { id: "kitchen", title: "An everyday place", type: "Room image → exploration", image: "/art/showcase/kitchen-0.webp", instruction: "Click to explore · Arrow keys to steer" },
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
  const stage = useRef<HTMLDivElement>(null);
  const focusRequested = useRef(false);
  const scene = scenes[index];
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
  function choose(i: number) { setIndex(i); setLoading(false); setPlaying(false); setWorld(undefined); setComplete(false); setError(""); setMoment(""); setMission(""); setProgress(""); focusRequested.current = false; setRun(n => n + 1); }
  function play() { focusRequested.current = true; setError(""); if (world) setPlaying(true); else setLoading(true); }
  return <div className="home-page">
    <header className="home-header">
      <a href="#" className="home-brand" aria-label="Doodlume home">doodlume<span>.</span></a>
      <nav aria-label="Main navigation"><a href="#how-it-works">How it works</a><a href="#studio" className="home-studio-link">Open studio <ArrowUpRight size={16}/></a></nav>
    </header>
    <main>
      <section className="home-hero" aria-labelledby="home-title">
        <div className="home-intro">
          <p className="home-eyebrow">FROM YOUR WORLD. INTO PLAY.</p>
          <h1 id="home-title">Your imagination.<br/><span>Now playable.</span></h1>
          <p className="home-description">Turn a drawing or photo into a game.<br/>Keep your art. Change the rules. Make it yours.</p>
          <a className="home-cta" href="#studio?create=upload">Make a game <ArrowRight size={19}/></a>
          <a className="home-draw-link" href="#studio?create=sketch">Or start with a drawing <ArrowUpRight size={14}/></a>
        </div>
        <div className="home-showcase">
          <div className={`home-showcase-caption ${world ? "has-mission" : ""}`}><span>{world ? complete ? "World complete" : mission : "MADE IN DOODLUME"}</span><span>{world ? complete ? "" : progress : `0${index + 1} / 03`}</span></div>
          <div ref={stage} className={`home-live-stage ${world ? "is-live" : ""}`} onKeyDown={event => {
            // Keep game keys inside the playable stage even on the frame a
            // goal completes and the game releases its keyboard capture.
            if ((!playing || complete) && (event.target as HTMLElement).closest('[role="application"]') && ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(event.key)) event.preventDefault();
          }}>
            {world ? <Suspense fallback={<div className="home-stage-loading">Opening your world…</div>}><LiveWorld world={world} playing={playing} muted run={run} overview={false}
              onUpdate={(_s, metrics) => { setComplete(metrics.completed); if (metrics.completed) setPlaying(false); setProgress(metrics.requiredTotal ? `${metrics.requiredDone}/${metrics.requiredTotal} done` : ""); }} onMoment={setMoment} onError={message => { setError(message); setPlaying(false); }}/></Suspense>
              : <img className="home-source" src={scene.image} alt={scene.title === "An imagined world" ? "An intricate ink drawing of floating ruins, a brass beetle and a crystal doorway" : scene.id === "dino" ? "A hand-drawn green dinosaur, purple platforms and a yellow star" : "An AI-generated kitchen scene with oranges, mugs and a notebook"} fetchPriority="high" width="1536" height="1024"/>}
            {(!playing || complete) && !error && <div className={`home-play-prompt ${world ? "home-play-paused" : ""}`}>
              <button onClick={() => { if (complete) { focusRequested.current = true; setComplete(false); setRun(n => n + 1); setPlaying(true); } else play(); }} disabled={loading}>
                {complete ? <RotateCcw size={18}/> : <Play size={18} fill="currentColor"/>}{loading ? "Opening…" : complete ? "Play again" : world ? "Continue playing" : "Play this example"}
              </button>
            </div>}
            {error && <div className="home-play-prompt home-play-paused" role="alert"><p>{error}</p><button onClick={() => { focusRequested.current = true; setWorld(undefined); setLoading(true); setError(""); }}>Try again</button></div>}
          </div>
          <div className="home-stage-footer"><span>{world ? complete ? "World complete. What will you make?" : scene.instruction : scene.type}</span>{world && !complete && <button aria-label={playing ? "Pause example" : "Resume example"} onClick={() => { if (playing) setPlaying(false); else play(); }}>{playing ? <Pause size={15}/> : <Play size={15}/>}</button>}<span className="sr-only" aria-live="polite">{moment}</span></div>
          <div className="home-scene-picker" aria-label="Choose an example">
            {scenes.map((item,i) => <button key={item.id} aria-pressed={i === index} onClick={() => choose(i)}><img src={item.image} alt="" width="64" height="44"/><span>{item.title}</span><ArrowUpRight size={15}/></button>)}
          </div>
        </div>
      </section>
      <section className="home-making" id="how-it-works" aria-labelledby="making-title">
        <div className="home-making-title"><p className="home-eyebrow">THE NEXT MOVE IS YOURS</p><h2 id="making-title">Don't just play a world.<br/>Make one.</h2></div>
        <ol className="home-steps">
          <li><span>01</span><div><h3>Start with something yours.</h3><p>A sketch, an illustration, a photograph. Add the idea you have in mind.</p></div></li>
          <li><span>02</span><div><h3>See it become playable.</h3><p>Review the characters, paths and goals. Then step into your image.</p></div></li>
          <li><span>03</span><div><h3>Keep changing the possibilities.</h3><p>Move a platform. Connect a switch. Make a new challenge in the same world.</p></div></li>
        </ol>
      </section>
      <section className="home-closing"><p>Your art is the beginning.</p><a href="#studio?create=upload">What happens next? <ArrowUpRight size={32}/></a></section>
    </main>
    <footer className="home-footer"><a className="home-brand" href="#">doodlume<span>.</span></a><p>Powered by Meta Muse Spark Open.</p><a href="#studio">Enter the studio <ArrowRight size={15}/></a></footer>
  </div>;
}
