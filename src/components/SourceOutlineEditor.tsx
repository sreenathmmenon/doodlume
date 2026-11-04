import { useEffect, useRef, useState, type PointerEvent } from "react";
import { Modal } from "./Modal";
import type { ArtworkBox } from "../../shared/world";
import { includeSourceRepairMargin } from "../../shared/source-outline";
import "./SourceOutlineEditor.css";

/** This tool records an explicit creator mask. It never guesses paper colors,
 * invokes recognition, or repaints the source object. */
export function SourceOutlineEditor({ image, sourceBox, existingArt, existingRepairMargin = 0, label, onConfirm, onClose }: {
  image: string; sourceBox: ArtworkBox; existingArt?: string; existingRepairMargin?: number; label: string;
  onConfirm: (mask: string, repairMargin: number) => Promise<void>; onClose: () => void;
}) {
  const cropOffset = useRef({ x: 0, y: 0 });
  const source = useRef<HTMLCanvasElement | null>(null), mask = useRef<HTMLCanvasElement | null>(null);
  const board = useRef<HTMLCanvasElement>(null), preview = useRef<HTMLCanvasElement>(null);
  const history = useRef<ImageData[]>([]), stroke = useRef<{ x: number; y: number } | null>(null);
  const [ready, setReady] = useState(false), [mode, setMode] = useState<"keep" | "remove">("remove");
  const [size, setSize] = useState(8), [maxSize, setMaxSize] = useState(80), [zoom, setZoom] = useState(1);
  const [undoCount, setUndoCount] = useState(0), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [repairMargin, setRepairMargin] = useState(existingRepairMargin);
  const [previewAspect, setPreviewAspect] = useState(1);
  const [dark, setDark] = useState(true), [aspect, setAspect] = useState(1);
  function render(margin = repairMargin) {
    if (!source.current || !mask.current || !board.current || !preview.current) return;
    const { width, height } = source.current;
    const ctx = board.current.getContext("2d")!, cutout = preview.current.getContext("2d")!;
    ctx.clearRect(0, 0, width, height); ctx.drawImage(source.current, 0, 0);
    const placedMask = document.createElement("canvas"); placedMask.width = width; placedMask.height = height;
    const placed = placedMask.getContext("2d")!;
    placed.drawImage(mask.current, cropOffset.current.x, cropOffset.current.y);
    const alpha = placed.getImageData(0, 0, width, height);
    const coverage = new Uint8Array(width * height);
    // Shared with the server compositor; this never changes the submitted alpha.
    if (margin > 0) {
      const positive = new Uint8Array(width * height);
      for (let at = 0; at < positive.length; at++) positive[at] = alpha.data[at * 4 + 3];
      includeSourceRepairMargin(coverage, positive, width, height, margin);
    }
    const overlay = ctx.createImageData(width, height);
    for (let at = 0; at < alpha.data.length; at += 4) {
      overlay.data[at] = 230; overlay.data[at + 1] = 51; overlay.data[at + 2] = 69;
      overlay.data[at + 3] = Math.round((255 - alpha.data[at + 3]) * .55);
      if (coverage[at / 4] && !alpha.data[at + 3]) {
        overlay.data[at] = 255; overlay.data[at + 1] = 178; overlay.data[at + 2] = 0; overlay.data[at + 3] = 175;
      }
    }
    const tint = document.createElement("canvas"); tint.width = width; tint.height = height;
    tint.getContext("2d")!.putImageData(overlay, 0, 0); ctx.drawImage(tint, 0, 0);
    cutout.clearRect(0, 0, width, height); cutout.globalCompositeOperation = "source-over";
    cutout.drawImage(source.current, cropOffset.current.x, cropOffset.current.y, mask.current.width, mask.current.height, 0, 0, mask.current.width, mask.current.height); cutout.globalCompositeOperation = "destination-in";
    cutout.drawImage(mask.current, 0, 0); cutout.globalCompositeOperation = "source-over";
  }
  useEffect(() => {
    let cancelled = false;
    const original = new Image();
    original.onload = async () => {
      try {
        const left = Math.min(original.naturalWidth - 1, Math.max(0, Math.round(sourceBox.x / 1000 * original.naturalWidth)));
        const top = Math.min(original.naturalHeight - 1, Math.max(0, Math.round(sourceBox.y / 1000 * original.naturalHeight)));
        const width = Math.min(original.naturalWidth - left, Math.max(1, Math.round(sourceBox.width / 1000 * original.naturalWidth)));
        const height = Math.min(original.naturalHeight - top, Math.max(1, Math.round(sourceBox.height / 1000 * original.naturalHeight)));
        if (width * height > 2_000_000) throw new Error("Choose a smaller source selection first.");
        const crop = document.createElement("canvas"), alpha = document.createElement("canvas");
        const paddingLeft = Math.min(12, left), paddingTop = Math.min(12, top);
        const paddedWidth = width + paddingLeft + Math.min(12, original.naturalWidth - left - width);
        const paddedHeight = height + paddingTop + Math.min(12, original.naturalHeight - top - height);
        crop.width = paddedWidth; crop.height = paddedHeight; alpha.width = width; alpha.height = height;
        crop.getContext("2d")!.drawImage(original, left - paddingLeft, top - paddingTop, paddedWidth, paddedHeight, 0, 0, paddedWidth, paddedHeight);
        const maskContext = alpha.getContext("2d", {willReadFrequently:true})!; maskContext.fillStyle = "white"; maskContext.fillRect(0, 0, width, height);
        if (existingArt) {
          const existing = new Image();
          await new Promise<void>((resolve, reject) => { existing.onload = () => resolve(); existing.onerror = () => reject(new Error("The saved outline could not be read.")); existing.src = existingArt; });
          if (existing.naturalWidth !== width || existing.naturalHeight !== height) throw new Error("The saved outline no longer matches this selection.");
          maskContext.clearRect(0, 0, width, height); maskContext.drawImage(existing, 0, 0);
          maskContext.globalCompositeOperation = "source-in"; maskContext.fillRect(0, 0, width, height); maskContext.globalCompositeOperation = "source-over";
        }
        if (cancelled) return;
        source.current = crop; mask.current = alpha; cropOffset.current = {x:paddingLeft,y:paddingTop};
        board.current!.width = paddedWidth; board.current!.height = paddedHeight;
        preview.current!.width = width; preview.current!.height = height;
        history.current = []; setUndoCount(0);
        const limit = Math.max(2, Math.min(100, Math.round(Math.min(width, height) * .5)));
        setMaxSize(limit); setSize(Math.max(1, Math.min(limit, Math.round(Math.min(width, height) * .15))));
        setAspect(paddedWidth / paddedHeight); setPreviewAspect(width / height); setReady(true); render();
      } catch (reason) { if (!cancelled) setError(reason instanceof Error ? reason.message : "The source could not be read."); }
    };
    original.onerror = () => { if (!cancelled) setError("The source picture could not be read."); };
    original.src = image;
    return () => { cancelled = true; };
  }, [image, sourceBox.x, sourceBox.y, sourceBox.width, sourceBox.height, existingArt]);
  function checkpoint() {
    const canvas = mask.current!;
    history.current.push(canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height));
    // Bound retained pixel memory as well as gesture count.
    const limit = Math.max(1, Math.min(16, Math.floor(16_000_000 / (canvas.width * canvas.height * 4))));
    while (history.current.length > limit) history.current.shift();
    setUndoCount(history.current.length); setError("");
  }
  function point(event: PointerEvent<HTMLCanvasElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    return { x: (event.clientX - bounds.left) / bounds.width * event.currentTarget.width - cropOffset.current.x,
      y: (event.clientY - bounds.top) / bounds.height * event.currentTarget.height - cropOffset.current.y };
  }
  function paint(from: {x:number;y:number}, to: {x:number;y:number}) {
    const context = mask.current!.getContext("2d")!;
    context.globalCompositeOperation = mode === "keep" ? "source-over" : "destination-out";
    context.strokeStyle = "white"; context.fillStyle = "white"; context.lineWidth = size; context.lineCap = "round"; context.lineJoin = "round";
    context.beginPath(); context.moveTo(from.x, from.y); context.lineTo(to.x, to.y); context.stroke();
    context.beginPath(); context.arc(to.x, to.y, size / 2, 0, Math.PI * 2); context.fill();
    context.globalCompositeOperation = "source-over"; render();
  }
  async function confirm() {
    if (!ready || !mask.current || busy) return;
    const alpha = mask.current.getContext("2d")!.getImageData(0, 0, mask.current.width, mask.current.height);
    let retained = 0; for (let i = 3; i < alpha.data.length; i += 4) if (alpha.data[i] > 20) retained++;
    if (retained < 3) { setError("Keep the whole object before using this outline."); return; }
    setBusy(true); setError("");
    try { await onConfirm(mask.current.toDataURL("image/png"), repairMargin); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "The outline could not be saved. Your brushwork is still here."); setBusy(false); }
  }
  return <Modal wide title={`Outline ${label}`} className="source-outline-modal" onClose={() => { if (!busy) onClose(); }} footer={<>
    <span className="small-note">{error ? <span role="alert">{error}</span> : "Original pixels only. Check every edge before confirming."}</span>
    <button className="primary-button" disabled={!ready || busy} onClick={() => void confirm()}>{busy ? "Saving outline…" : "Use outline"}</button>
  </>}>
    <p className="small-note">Keep the whole object, including faint outer lines. Remove its background; red stays behind.</p>
    <fieldset disabled={!ready || busy} className="source-outline-controls">
      <div role="group" aria-label="Outline brush"><button type="button" aria-pressed={mode === "remove"} onClick={() => setMode("remove")}>Remove</button><button type="button" aria-pressed={mode === "keep"} onClick={() => setMode("keep")}>Keep</button></div>
      <label>Brush size <input aria-label="Outline brush size" type="range" min="1" max={maxSize} value={size} onChange={event => setSize(Number(event.target.value))}/></label>
      <label>Zoom <select aria-label="Outline zoom" value={zoom} onChange={event => setZoom(Number(event.target.value))}><option value="1">100%</option><option value="2">200%</option><option value="4">400%</option></select></label>
      <button type="button" disabled={!undoCount} onClick={() => { const previous = history.current.pop(); if (previous) mask.current!.getContext("2d")!.putImageData(previous, 0, 0); setUndoCount(history.current.length); render(); }}>Undo brushstroke</button>
      <button type="button" onClick={() => { checkpoint(); mask.current!.getContext("2d")!.clearRect(0, 0, mask.current!.width, mask.current!.height); render(); }}>Clear selection</button>
      <button type="button" onClick={() => { checkpoint(); const context = mask.current!.getContext("2d")!; context.fillStyle = "white"; context.fillRect(0, 0, mask.current!.width, mask.current!.height); render(); }}>Keep whole selection</button>
    </fieldset>
    <div className="source-outline-cleanup">
      <label>Background edge cleanup <select aria-label="Background edge cleanup" disabled={!ready || busy} value={repairMargin} onChange={event => {
        const next = Number(event.target.value); setRepairMargin(next); render(next);
      }}>{[...new Set([0,2,4,8,12,existingRepairMargin])].sort((a,b) => a-b).map(value => <option key={value} value={value}>{value === 0 ? "Off" : `${value} px`}</option>)}</select></label>
      <p className="small-note">{repairMargin ? "Amber shows extra background to repair when the object moves. The cutout stays unchanged." : "For leftover edge marks after moving an object. The cutout stays unchanged."}</p>
    </div>
    <div className="source-outline-panes">
      <section><h3>Original selection</h3><div className="source-outline-board"><canvas ref={board} style={{width:`min(${zoom * 100}%, calc(40vh * ${aspect * zoom}))`}} aria-label="Outline brush canvas" onPointerDown={event => {
        if (!ready || busy || event.button !== 0) return; event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); checkpoint(); stroke.current = point(event); paint(stroke.current, stroke.current);
      }} onPointerMove={event => { if (!stroke.current || busy) return; const next = point(event); paint(stroke.current, next); stroke.current = next; }} onPointerUp={() => {stroke.current = null;}} onPointerCancel={() => {stroke.current = null;}} /></div></section>
      <section><div className="source-outline-preview-heading"><h3>Cutout preview</h3><button type="button" className="text-button" onClick={() => setDark(value => !value)}>{dark ? "Light background" : "Dark background"}</button></div><div className={`source-outline-preview ${dark ? "dark" : "light"}`}><canvas ref={preview} style={{width:`min(100%, calc(40vh * ${previewAspect}))`}} aria-label="Original pixels with your outline" /></div></section>
    </div>
  </Modal>;
}
