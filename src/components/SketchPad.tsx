import { useEffect, useRef, useState, type PointerEvent } from "react";
import { ArrowUpRight, Eraser, Pencil, RotateCcw, Undo2 } from "lucide-react";
import { Modal } from "./Modal";

const colors = ["#444b43", "#94ad7c", "#baa4cf", "#ddb46b", "#d99483"];
export function SketchPad({
  onUse,
  onClose,
}: {
  onUse: (image: string) => void;
  onClose: () => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const history = useRef<{ pixels: ImageData; hasInk: boolean }[]>([]);
  const [color, setColor] = useState(colors[0]);
  const [eraser, setEraser] = useState(false);
  const [hasInk, setHasInk] = useState(false);
  const [count, setCount] = useState(0);
  useEffect(() => {
    const ctx = canvas.current!.getContext("2d")!;
    ctx.fillStyle = "#fffdf8";
    ctx.fillRect(0, 0, 1200, 760);
  }, []);
  function point(e: PointerEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    return [
      ((e.clientX - rect.left) * 1200) / rect.width,
      ((e.clientY - rect.top) * 760) / rect.height,
    ];
  }
  function start(e: PointerEvent<HTMLCanvasElement>) {
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
    ctx.fillStyle = "#fffdf8";
    ctx.fillRect(0, 0, c.width, c.height);
    setCount(history.current.length);
    setHasInk(false);
  }
  return (
    <Modal title="A blank page. A little possibility." onClose={onClose} wide>
      <p className="modal-copy">
        Draw a character, some ground, and somewhere to go. Keep shapes separate
        and give your character a clear outline.
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
      <div className="sketch-surface">
        <canvas
          ref={canvas}
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
      <div className="modal-footer">
        <p>
          Your page stays in this browser until you choose to bring it alive.
        </p>
        <button
          className="primary-button"
          disabled={!hasInk}
          onClick={() => onUse(canvas.current!.toDataURL("image/png"))}
        >
          Use this drawing <ArrowUpRight size={18} />
        </button>
      </div>
    </Modal>
  );
}
