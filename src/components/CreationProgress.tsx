import { Check, Sparkles } from "lucide-react";
import "./CreationProgress.css";

/** A waiting state, not an estimate of server progress. Only the source-ready
 * step is confirmed; inference and validation share one honest pending stage. */
export function CreationProgress({ seconds }: { seconds: number }) {
  return <section className="creation-journey" aria-label="Creation progress" aria-busy="true">
    <div className="creation-journey-art" aria-hidden="true">
      <svg viewBox="0 0 280 100" fill="none">
        <path className="journey-line" d="M22 70C48 70 48 30 78 30S114 78 145 58 184 23 211 40 239 70 260 49" />
        <path className="journey-track" d="M22 70C48 70 48 30 78 30S114 78 145 58 184 23 211 40 239 70 260 49" />
        <circle cx="22" cy="70" r="6"/><circle cx="145" cy="58" r="6"/><circle cx="260" cy="49" r="6"/>
        <path className="journey-spark" d="M78 17v26m-13-13h26M211 27v26m-13-13h26" />
      </svg>
    </div>
    <div className="creation-journey-heading">
      <span className="creation-journey-icon"><Sparkles size={18}/></span>
      <div><strong>Your world is taking shape</strong><span className="creation-elapsed" aria-hidden="true">{seconds}s elapsed</span></div>
    </div>
    <p role="status">{seconds >= 65
      ? "Still working. You can stop and keep your image and idea."
      : "Finding a playable idea in your image."}</p>
    <ol className="creation-journey-steps" aria-label="Creation status">
      <li data-state="done"><span><Check size={13}/></span>Image ready</li>
      <li data-state="active" aria-current="step"><span className="journey-pulse"/>Creating & checking</li>
      <li data-state="waiting"><span/>Playable preview</li>
    </ol>
  </section>;
}
