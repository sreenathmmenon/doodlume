import { useEffect, useRef, useState } from "react";
import { Play } from "lucide-react";
import type { CountBeat, ReadBox } from "../../lib/home-reading";

/** Scrolling is the first play-through: the drawing gains its purposes one beat at a time. */
export function HomeCount({ src, alt, beats, boxes, goal, playHref, onFinished }: {
  src: string; alt: string; beats: CountBeat[]; boxes: ReadBox[]; goal: string; playHref: string; onFinished?: () => void;
}) {
  const [step, setStep] = useState(0);
  const [tick, setTick] = useState(0);
  const steps = useRef<(HTMLElement | null)[]>([]);
  useEffect(() => {
    const io = new IntersectionObserver(entries => {
      let best: IntersectionObserverEntry | null = null;
      for (const e of entries) if (e.isIntersecting && (!best || e.intersectionRatio > best.intersectionRatio)) best = e;
      if (best) { const n = Number((best.target as HTMLElement).dataset.step); setStep(s => { if (n > s) setTick(t => t + 1); return n; }); }
    }, { threshold: [0.35, 0.5, 0.65] });
    steps.current.forEach(el => el && io.observe(el));
    return () => io.disconnect();
  }, []);
  const done = step >= beats.length;
  useEffect(() => { if (done) onFinished?.(); }, [done, onFinished]);
  const byId = Object.fromEntries(boxes.map(b => [b.id, b]));
  return <div className="count">
    <div className="count-sticky">
      <div className="count-frame">
        <img src={src} alt={alt} loading="lazy"/>
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          {beats.map((b, i) => b.entityIds.map(id => { const e = byId[id]; if (!e) return null; const cx = e.x + e.w / 2, cy = e.y + e.h / 2, rx = e.w / 2 + 2.5, ry = e.h / 2 + 3;
            return <ellipse key={`${i}-${id}`} className={`count-mark ${step > i ? "is-on" : ""}`} cx={cx} cy={cy} rx={rx} ry={ry}/>; }))}
        </svg>
        {beats.map((b, i) => { const e = byId[b.entityIds[0]]; if (!e) return null; return <span key={i} className={`count-note ${step > i ? "is-on" : ""}`} style={{ left: `${e.x + e.w / 2}%`, top: `${Math.max(4, e.y - 7)}%` }}>{b.note.replace(/^A |\.$/g, "").toLowerCase()}</span>; })}
        <div className={`goal-chip ${done ? "is-done" : ""}`}><span className="goal-chip-n"><b key={tick} className="is-tick">{Math.min(step, beats.length)}</b>/{beats.length}</span><span>{done ? "Playable" : goal}</span></div>
        <a className={`count-play ${done ? "is-on" : ""}`} href={playHref}><Play size={14} fill="currentColor"/>Play this drawing</a>
      </div>
    </div>
    <div className="count-steps">
      {beats.map((b, i) => <div key={i} className="count-step" data-step={i + 1} ref={el => { steps.current[i] = el; }}>
        <span className="count-k">{i + 1} of {beats.length}</span>
        <h3>{b.title}</h3>
        <p>{b.note}</p>
      </div>)}
    </div>
  </div>;
}
