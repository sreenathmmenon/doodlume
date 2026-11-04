import { useEffect, useState } from "react";

export function ZoomPercent({ value, min, max, onChange }: {
  value: number; min: number; max: number; onChange: (value: number) => void;
}) {
  const [draft, setDraft] = useState(String(Math.round(value)));
  useEffect(() => setDraft(String(Math.round(value))), [value]);
  function commit() {
    const next = draft.trim() ? Number(draft) : NaN;
    if (Number.isFinite(next)) {
      const clamped = Math.min(max, Math.max(min, next));
      onChange(clamped);
      setDraft(String(Math.round(clamped)));
    } else setDraft(String(Math.round(value)));
  }
  return <label className="zoom-percent">
    <input aria-label="Zoom percentage" type="number" inputMode="decimal" step="any" min={Math.floor(min)} max={Math.ceil(max)}
      value={draft} onChange={event => setDraft(event.target.value)} onBlur={commit}
      onKeyDown={event => {
        if (event.key === "Enter") { event.preventDefault(); commit(); }
      }} />
    <span aria-hidden="true">%</span>
  </label>;
}
