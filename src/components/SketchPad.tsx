import { useEffect, useRef, useState, type PointerEvent } from "react";
import { ArrowUpRight, Eraser, Pencil, RotateCcw, Undo2, Redo2 } from "lucide-react";
import { extractInkLayer, type InkMark } from "../lib/ink";
import { Modal } from "./Modal";
import "./SketchPad.css";

type StrokeSnapshot = { pixels: ImageData; hasInk: boolean };
// Keep the last paused drawing's reversible stroke history for this session.
let pausedDrawing: { image: string; source?: string; undo: StrokeSnapshot[]; redo: StrokeSnapshot[]; hasInk: boolean; color: string; eraser: boolean; brushSize: number } | undefined;
const colors = ["#444b43", "#94ad7c", "#baa4cf", "#ddb46b", "#d99483"];
const inkNames: Record<string, string> = { "#444b43": "Graphite", "#94ad7c": "Sage", "#baa4cf": "Lavender", "#ddb46b": "Gold", "#d99483": "Coral" };
export function SketchPad({
  onUse,
  onClose,
  initialImage,
  resumeImage,
  onPause,
}: {
  onUse: (image: string, mark?: InkMark) => void;
  onClose: () => void;
  initialImage?: string;
  resumeImage?: string;
  onPause?: (image: string | undefined) => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const base = useRef<HTMLCanvasElement | null>(null);
  const [ready, setReady] = useState(!initialImage && !resumeImage);
  const [loadError, setLoadError] = useState("");
  const resumed = useRef(resumeImage && pausedDrawing?.image === resumeImage && pausedDrawing.source === initialImage ? pausedDrawing : undefined).current;
  const history = useRef<StrokeSnapshot[]>(resumed?.undo.slice() ?? []);
  const future = useRef<StrokeSnapshot[]>(resumed?.redo.slice() ?? []);
  const [redoCount, setRedoCount] = useState(future.current.length);
  const [brushSize, setBrushSize] = useState(resumed?.brushSize ?? 5);
  const [color, setColor] = useState(resumed?.color ?? colors[0]);
  const [eraser, setEraser] = useState(resumed?.eraser ?? false);
  const [hasInk, setHasInk] = useState(false);
  const [count, setCount] = useState(history.current.length);
  useEffect(() => {
    let active = true;
    const c = canvas.current!, ctx = c.getContext("2d")!;
    const load = (url: string) => new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("Your drawing could not be opened. Your source image is unchanged."));
      image.src = url;
    });
    void (async () => {
      const [source, draft] = await Promise.all([
        initialImage ? load(initialImage) : Promise.resolve(null),
        resumeImage ? load(resumeImage) : Promise.resolve(null),
      ]);
      if (!active) return;
      if (draft) { c.width = draft.naturalWidth; c.height = draft.naturalHeight; }
      else if (source) {
        const scale = 1440 / Math.max(source.naturalWidth, source.naturalHeight);
        c.width = Math.round(source.naturalWidth * scale);
        c.height = Math.round(source.naturalHeight * scale);
      }
      if (source) {
        const page = document.createElement("canvas");
        page.width = c.width; page.height = c.height;
        page.getContext("2d")!.drawImage(source, 0, 0, c.width, c.height);
        base.current = page;
      } else {
        ctx.fillStyle = "#fffdf8"; ctx.fillRect(0, 0, c.width, c.height);
      }
      if (draft) ctx.drawImage(draft, 0, 0);
      setHasInk(draft ? resumed?.hasInk ?? true : false);
      setReady(true);
    })().catch(error => { if (active) setLoadError(error.message); });
    return () => { active = false; };
  }, [initialImage, resumeImage, resumed]);
  function useDrawing() {
    const c = canvas.current!;
    let mark: InkMark;
    try {
      mark = extractInkLayer(c);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Draw a new mark first.");
      return;
    }
    pausedDrawing = undefined;
    if (!base.current) return onUse(c.toDataURL("image/png"));
    const page = document.createElement("canvas");
    page.width = c.width;
    page.height = c.height;
    const ctx = page.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(base.current, 0, 0);
    ctx.drawImage(c, 0, 0);
    onUse(page.toDataURL("image/png"), mark);
  }
  function point(e: PointerEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    return [
      ((e.clientX - rect.left) * e.currentTarget.width) / rect.width,
      ((e.clientY - rect.top) * e.currentTarget.height) / rect.height,
    ];
  }
  function start(e: PointerEvent<HTMLCanvasElement>) {
    if (!ready || drawing.current || e.button !== 0) return;
    future.current = []; setRedoCount(0);
    const c = canvas.current!,
      ctx = c.getContext("2d")!;
    history.current.push({
      pixels: ctx.getImageData(0, 0, c.width, c.height),
      hasInk,
    });
    if (history.current.length > 16) history.current.shift();
    setCount(history.current.length);
    drawing.current = true;
    c.setPointerCapture(e.pointerId);
    const [x, y] = point(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineWidth = eraser ? brushSize * 4 : brushSize;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.globalCompositeOperation =
      initialImage && eraser ? "destination-out" : "source-over";
    ctx.strokeStyle = eraser ? "#fffdf8" : color;
    ctx.lineTo(x + 0.1, y + 0.1);
    ctx.stroke();
    setHasInk(true);
  }
  function move(e: PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const ctx = canvas.current!.getContext("2d")!;
    const [x, y] = point(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  }
  function undo() {
    const image = history.current.pop();
    if (image) {
      const c = canvas.current!, ctx = c.getContext("2d")!;
      future.current.push({ pixels: ctx.getImageData(0, 0, c.width, c.height), hasInk });
      setRedoCount(future.current.length);
      ctx.putImageData(image.pixels, 0, 0);
      setHasInk(image.hasInk);
    }
    setCount(history.current.length);
  }
  function redo() {
    const image = future.current.pop();
    if (!image) return;
    const c = canvas.current!, ctx = c.getContext("2d")!;
    history.current.push({ pixels: ctx.getImageData(0, 0, c.width, c.height), hasInk });
    ctx.putImageData(image.pixels, 0, 0);
    setHasInk(image.hasInk); setCount(history.current.length); setRedoCount(future.current.length);
  }
  function clear() {
    future.current = []; setRedoCount(0);
    const c = canvas.current!,
      ctx = c.getContext("2d")!;
    history.current.push({
      pixels: ctx.getImageData(0, 0, c.width, c.height),
      hasInk,
    });
    if (history.current.length > 16) history.current.shift();
    ctx.globalCompositeOperation = "source-over";
    if (initialImage) ctx.clearRect(0, 0, c.width, c.height);
    else {
      ctx.fillStyle = "#fffdf8";
      ctx.fillRect(0, 0, c.width, c.height);
    }
    setCount(history.current.length);
    setHasInk(false);
  }
  return (
    <Modal
      title={
        initialImage
          ? "Draw on your image"
          : resumeImage
            ? "Continue your drawing"
            : "Draw your world"
      }
      onClose={() => {
        if (onPause && ready) {
          const image = canvas.current!.toDataURL("image/png");
          if (hasInk || history.current.length || future.current.length) {
            pausedDrawing = { image, source: initialImage, undo: history.current.slice(), redo: future.current.slice(), hasInk, color, eraser, brushSize };
            onPause(image);
          } else { pausedDrawing = undefined; onPause(undefined); }
        }
        onClose();
      }}
      wide
      className="sketch-modal"
      footer={
        <div className="modal-footer">
          <p>
            {initialImage
              ? "Your existing world stays unchanged until you apply."
              : "Saved as a draft when you close."}
          </p>
          <button
            className="primary-button"
            disabled={!hasInk || !ready}
            onClick={useDrawing}
          >
            Use this drawing <ArrowUpRight size={18} />
          </button>
        </div>
      }
    >
      {initialImage && <p className="modal-copy">Eraser and undo affect only your new strokes.</p>}
      <div className="sketch-tools">
        <div className="swatches">
          {colors.map((c) => (
            <button
              key={c}
              aria-label={`${inkNames[c]} ink`}
              title={`${inkNames[c]} ink`}
              aria-pressed={!eraser && color === c}
              style={{ "--swatch": c } as React.CSSProperties}
              onClick={() => {
                setColor(c);
                setEraser(false);
              }}
            />
          ))}
        </div>
        <span className="tool-divider" />
        <button
          className={`icon-button ${!eraser ? "active" : ""}`}
          aria-label="Pencil"
          title="Pencil"
          aria-pressed={!eraser}
          onClick={() => setEraser(false)}
        >
          <Pencil size={18} />
        </button>
        <button
          className={`icon-button ${eraser ? "active" : ""}`}
          aria-label="Eraser"
          title="Eraser"
          aria-pressed={eraser}
          onClick={() => setEraser(true)}
        >
          <Eraser size={18} />
        </button>
        <button
          className="icon-button"
          disabled={!ready || !count}
          aria-label="Undo last stroke"
          title="Undo last stroke"
          onClick={undo}
        >
          <Undo2 size={18} />
        </button>
        <button className="icon-button" disabled={!ready || !redoCount} aria-label="Redo last stroke" title="Redo last stroke" onClick={redo}>
          <Redo2 size={18} />
        </button>
        <label className="sketch-brush-size">Size
          <input type="range" min="2" max="24" value={brushSize} aria-valuetext={`${eraser ? brushSize * 4 : brushSize} pixels`} aria-label={eraser ? "Eraser size" : "Brush size"} onChange={event => setBrushSize(Number(event.target.value))} />
          <output>{eraser ? brushSize * 4 : brushSize}</output>
        </label>
        <button className="text-button clear-sketch" disabled={!ready || !hasInk} onClick={clear}>
          <RotateCcw size={15} /> {initialImage ? "Clear new strokes" : "Clear page"}
        </button>
      </div>
      {loadError && (
        <p role="alert" className="editor-error">
          {loadError}
        </p>
      )}
      <div className="sketch-surface">
        <canvas
          ref={canvas}
          style={
            initialImage
              ? {
                  backgroundImage: `url("${initialImage}")`,
                  backgroundSize: "100% 100%",
                  backgroundColor: "transparent",
                }
              : undefined
          }
          width={1200}
          height={760}
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={() => {
            drawing.current = false;
          }}
          onPointerCancel={() => {
            drawing.current = false;
          }}
          aria-label="Drawing canvas. Draw with your pointer or upload a drawing from the studio."
        />
      </div>
    </Modal>
  );
}
