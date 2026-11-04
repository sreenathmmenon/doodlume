import { useState } from "react";
import type { ReadBox, RuleSentence } from "../../lib/home-reading";

/** The sentence is the interface. Nouns came from the picture; verbs are highlighted because you decide them. */
export function HomeRules({ sentences, boxes, links, src, alt, onChanged }: {
  sentences: RuleSentence[]; boxes: ReadBox[]; links: Record<string, { from: string; to: string }>; src: string; alt: string; onChanged?: () => void;
}) {
  const [choice, setChoice] = useState<number[]>(() => sentences.map(() => 0));
  const [stamp, setStamp] = useState(-1);
  const byId = Object.fromEntries(boxes.map(b => [b.id, b]));
  const centre = (b: ReadBox) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });
  const active = sentences.flatMap((s, i) => (choice[i] ? s.verbs[choice[i]].actionIds : []));
  function cycle(i: number) {
    setChoice(c => c.map((v, k) => (k === i ? (v + 1) % sentences[k].verbs.length : v)));
    setStamp(i); setTimeout(() => setStamp(-1), 300);
    onChanged?.();
  }
  const on = choice.filter(Boolean).length;
  return <div className="rules">
    <div className="rules-say">
      {sentences.map((s, i) => <p key={s.id} className="rules-sentence">
        The {s.subject} <button type="button" className={`rules-chip ${stamp === i ? "is-stamp" : ""}`} aria-label={`Change what the ${s.subject} can do`} onClick={() => cycle(i)}>{s.verbs[choice[i]].label}</button> the {s.object}.
      </p>)}
    </div>
    <figure className="rules-pic">
      <img src={src} alt={alt} loading="lazy"/>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        {sentences.flatMap((s, i) => (choice[i] ? s.verbs[choice[i]].actionIds.map(id => {
          const link = links[id]; const a = link && byId[link.from], b = link && byId[link.to]; if (!a || !b) return null;
          const p = centre(a), q = centre(b);
          return <g key={id}><path className="rules-ink halo" d={`M${p.x} ${p.y} L${q.x} ${q.y}`}/><path className="rules-ink draw" d={`M${p.x} ${p.y} L${q.x} ${q.y}`}/><circle className="rules-mark pop" cx={q.x} cy={q.y} r="2.4"/></g>;
        }) : []))}
      </svg>
      <figcaption className={`rules-status ${on ? "is-on" : ""}`}><i/>{on ? `Preview · ${active.length} possible connections shown.` : "Rule preview · Tap a highlighted word."}</figcaption>
    </figure>
  </div>;
}
