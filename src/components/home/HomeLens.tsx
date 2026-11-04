import { useEffect, useRef, useState } from "react";
import type { ReadBox, ReadRelation } from "../../lib/home-reading";

/** A lens the pointer carries. Under it, the photo shows what Doodlume read in it. */
export function HomeLens({ src, alt, boxes, relations, goal, onLooked }: {
  src: string; alt: string; boxes: ReadBox[]; relations: ReadRelation[]; goal: string; onLooked?: () => void;
}) {
  const stage = useRef<HTMLDivElement>(null);
  const [touched, setTouched] = useState(false);
  useEffect(() => {
    const el = stage.current; if (!el) return;
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    let tx = -999, ty = -999, x = -999, y = -999, idle = 0, t = 0, auto = true, travel = 0, lx: number | null = null, ly = 0, looked = false, raf = 0;
    const aim = (cx: number, cy: number) => {
      const r = el.getBoundingClientRect(); tx = cx - r.left; ty = cy - r.top;
      if (lx !== null) travel += Math.hypot(tx - lx, ty - ly); lx = tx; ly = ty;
      if (!looked && travel > 320) { looked = true; onLooked?.(); }
    };
    const move = (e: PointerEvent) => { auto = false; idle = performance.now(); setTouched(true); aim(e.clientX, e.clientY); };
    const leave = () => { idle = performance.now() - 2500; };
    el.addEventListener("pointermove", move); el.addEventListener("pointerdown", move); el.addEventListener("pointerleave", leave);
    const tick = (now: number) => {
      const r = el.getBoundingClientRect();
      if (auto || now - idle > 4000) { auto = true; t += reduce ? 0 : 0.0022; tx = r.width * (0.5 + 0.36 * Math.sin(t * 0.9)); ty = r.height * (0.5 + 0.3 * Math.sin(t * 1.7 + 1.2)); }
      x += (tx - x) * 0.12; y += (ty - y) * 0.12;
      el.style.setProperty("--x", `${x.toFixed(1)}px`); el.style.setProperty("--y", `${y.toFixed(1)}px`);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); el.removeEventListener("pointermove", move); el.removeEventListener("pointerdown", move); el.removeEventListener("pointerleave", leave); };
  }, [onLooked]);
  const byId = Object.fromEntries(boxes.map(b => [b.id, b]));
  const centre = (b: ReadBox) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });
  return <div ref={stage} className={`lens-stage ${touched ? "is-touched" : ""}`} aria-label="A photo. Move the lens over it to see what Doodlume read.">
    <img className="lens-base" src={src} alt={alt} loading="lazy"/>
    <div className="lens-layer" aria-hidden="true">
      <img src={src} alt=""/>
      <i className="lens-tint"/><i className="lens-grid"/>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none">
        {relations.map(r => { const a = byId[r.from], b = byId[r.to]; if (!a || !b) return null; const p = centre(a), q = centre(b); return <path key={`${r.from}-${r.to}`} className="lens-rel" d={`M${p.x} ${p.y} L${q.x} ${q.y}`}/>; })}
        {boxes.map(b => <rect key={b.id} className="lens-box" x={b.x} y={b.y} width={b.w} height={b.h} rx={0.8}/>)}
      </svg>
      {relations.map(r => { const a = byId[r.from], b = byId[r.to]; if (!a || !b) return null; const p = centre(a), q = centre(b); return <span key={`t-${r.from}-${r.to}`} className="lens-reltag" style={{ left: `${(p.x + q.x) / 2}%`, top: `${(p.y + q.y) / 2}%` }}>{r.label}</span>; })}
      {boxes.map(b => <span key={`l-${b.id}`} className="lens-tag" style={{ left: `${b.x}%`, top: `${b.y}%` }}>{b.name} <em>{b.verb}</em></span>)}
      <p className="lens-goal">{goal}</p>
    </div>
    <i className="lens-ring"/>
    <span className="lens-nudge">Move the lens</span>
  </div>;
}
