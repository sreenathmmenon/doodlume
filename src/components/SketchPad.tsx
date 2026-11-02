import { useEffect, useRef, useState, type PointerEvent } from "react";
import { ArrowUpRight, Eraser, Pencil, RotateCcw, Undo2 } from "lucide-react";
import { extractInkLayer, type InkMark } from "../lib/ink";
import { Modal } from "./Modal";

const colors = ["#444b43", "#94ad7c", "#baa4cf", "#ddb46b", "#d99483"];
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
  const history = useRef<{ pixels: ImageData; hasInk: boolean }[]>([]);
  const [color, setColor] = useState(colors[0]);
  const [eraser, setEraser] = useState(false);
  const [hasInk, setHasInk] = useState(false);
  const [count, setCount] = useState(0);
  useEffect(() => {
    const c = canvas.current!,
      ctx = c.getContext("2d")!;
    if (resumeImage) {
      let active = true;
      const image = new Image();
      image.onload = () => {
        if (!active) return;
        c.width = image.naturalWidth;
        c.height = image.naturalHeight;
        ctx.drawImage(image, 0, 0);
        setHasInk(true);
        setReady(true);
      };
      image.onerror = () => {
        if (active)
          setLoadError(
            "Your paused drawing could not be reopened. Your source image is unchanged.",
          );
      };
      image.src = resumeImage;
      return () => {
        active = false;
      };
    }
    if (!initialImage) {
      ctx.fillStyle = "#fffdf8";
      ctx.fillRect(0, 0, c.width, c.height);
      return;
    }
    let active = true;
    const image = new Image();
    image.onload = () => {
      if (!active) return;
      const scale = 1440 / Math.max(image.naturalWidth, image.naturalHeight);
      c.width = Math.round(image.naturalWidth * scale);
      c.height = Math.round(image.naturalHeight * scale);
      const page = document.createElement("canvas");
      page.width = c.width;
      page.height = c.height;
      page.getContext("2d")!.drawImage(image, 0, 0, c.width, c.height);
      base.current = page;
      setReady(true);
    };
    image.onerror = () => {
      if (active)
        setLoadError(
          "The current page could not be opened. Upload a revised page instead.",
        );
    };
    image.src = initialImage;
    return () => {
      active = false;
    };
  }, [initialImage, resumeImage]);
  function useDrawing() {
    const c = canvas.current!;
    let mark: InkMark;
    try {
      mark = extractInkLayer(c);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Draw a new mark first.");
      return;
    }
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
    if (!ready) return;
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
    ctx.lineWidth = eraser ? 38 : 5;
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
      canvas.current!.getContext("2d")!.putImageData(image.pixels, 0, 0);
      setHasInk(image.hasInk);
    }
    setCount(history.current.length);
  }
  function clear() {
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
          ? "A new mark. The same world."
          : resumeImage
            ? "Continue your drawing"
            : "Draw your world"
      }
      onClose={() => {
        if (onPause && ready) {
          try {
            extractInkLayer(canvas.current!);
            onPause(canvas.current!.toDataURL("image/png"));
          } catch {
            onPause(undefined);
          }
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
              : "Your drawing stays in this draft until you use it."}
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
      <p className="modal-copy">
        {initialImage
          ? "Add to your current page. Your existing drawing is protected; the eraser and undo affect only your new strokes."
          : "Draw whatever comes to mind. Your shapes, characters and colors can become a world to play in."}
      </p>
      <div className="sketch-tools">
        <div className="swatches">
          {colors.map((c) => (
            <button
              key={c}
              aria-label={`Ink ${c}`}
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
          onClick={() => setEraser(false)}
        >
          <Pencil size={18} />
        </button>
        <button
          className={`icon-button ${eraser ? "active" : ""}`}
          aria-label="Eraser"
          onClick={() => setEraser(true)}
        >
          <Eraser size={18} />
        </button>
        <button
          className="icon-button"
          disabled={!count}
          aria-label="Undo last stroke"
          onClick={undo}
        >
          <Undo2 size={18} />
        </button>
        <button className="text-button clear-sketch" onClick={clear}>
          <RotateCcw size={15} /> Clear page
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
