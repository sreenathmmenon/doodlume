import { useEffect, useRef, useState, type PointerEvent } from "react";
import {
  ArrowUpRight,
  Check,
  Crop,
  LoaderCircle,
  RotateCw,
  Undo2,
} from "lucide-react";
import { Modal } from "./Modal";
import "./PageAlignment.css";
import {
  fullPage,
  pageTransform,
  type PageCorners,
} from "../../shared/alignment";
import { alignPage, imageSize, rotatePage } from "../lib/align-page";
const names = ["Top left", "Top right", "Bottom right", "Bottom left"];
export function PageAlignment({
  image,
  referenceImage,
  onUse,
  onClose,
}: {
  image: string;
  referenceImage?: string;
  onUse: (image: string) => void;
  onClose: () => void;
}) {
  const [photo, setPhoto] = useState(image),
    [size, setSize] = useState({ width: 1440, height: 820 });
  const [corners, setCorners] = useState<PageCorners>(fullPage),
    [selected, setSelected] = useState(0);
  const [aspect, setAspect] = useState(1440 / 820),
    [matchAspect, setMatchAspect] = useState<number | null>(null);
  const [preview, setPreview] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const resultPanel = useRef<HTMLElement>(null);
  const request = useRef<AbortController | null>(null),
    drag = useRef<number | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  useEffect(() => {
    if (!preview || !resultPanel.current) return;
    const panel = resultPanel.current;
    const body = panel.closest<HTMLElement>(".modal-scroll-body");
    panel.focus({ preventScroll: true });
    if (body) body.scrollTop += panel.getBoundingClientRect().top - body.getBoundingClientRect().top - 12;
  }, [preview]);
  useEffect(() => {
    let active = true;
    void imageSize(photo)
      .then((value) => {
        if (active) setSize(value);
      })
      .catch(() => setError("This page could not be opened."));
    return () => {
      active = false;
    };
  }, [photo]);
  useEffect(() => {
    let active = true;
    if (referenceImage) {
      const img = new Image();
      img.onload = () => {
        if (active) {
          const ratio = img.naturalWidth / img.naturalHeight;
          setMatchAspect(ratio);
          setAspect(ratio);
        }
      };
      img.src = referenceImage;
    }
    return () => {
      active = false;
    };
  }, [referenceImage]);
  let problem = "";
  try {
    pageTransform(corners);
  } catch (e) {
    problem = e instanceof Error ? e.message : "Check the corners.";
  }
  function change(index: number, x: number, y: number) {
    setCorners(
      (items) =>
        items.map((p, i) =>
          i === index
            ? { x: Math.max(0, Math.min(1, x)), y: Math.max(0, Math.min(1, y)) }
            : p,
        ) as PageCorners,
    );
    setPreview("");
    setError("");
  }
  function point(e: PointerEvent<SVGSVGElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    return {
      x: (e.clientX - r.left) / r.width,
      y: (e.clientY - r.top) / r.height,
    };
  }
  async function straighten() {
    setBusy(true);
    setError("");
    const controller = new AbortController();
    request.current = controller;
    try {
      const result = await alignPage(photo, corners, aspect, controller.signal);
      if (!controller.signal.aborted) {
        setPreview(result);
      }
    } catch (e) {
      if (!controller.signal.aborted)
        setError(
          e instanceof Error ? e.message : "This page could not be aligned.",
        );
    } finally {
      if (request.current === controller) setBusy(false);
    }
  }
  return (
    <Modal
      title="Align your page"
      className="alignment-modal"
      footer={      <div className="modal-footer">
        <button
          className="text-button"
          disabled={busy}
          onClick={() => onUse(photo)}
        >
          Use photo as it is
        </button>
        <button
          className="primary-button"
          disabled={!preview || busy}
          onClick={() => onUse(preview)}
        >
          Use aligned page <ArrowUpRight size={16} />
        </button>
      </div>}
      wide
      onClose={() => {
        request.current?.abort();
        onClose();
      }}
    >
      <p className="modal-copy">
        Put each corner on the edge of your paper. Straighten the page, then
        check that your character and new marks are still clear.
      </p>
      <div className="alignment-layout">
        <section>
          <div
            className="alignment-photo"
            style={{ aspectRatio: `${size.width}/${size.height}` }}
          >
            <img src={photo} alt="Photo to align" />
            <svg
              viewBox="0 0 1000 1000"
              preserveAspectRatio="none"
              aria-label="Page corner alignment canvas"
              onPointerDown={(e) => {
                if (busy) return;
                const p = point(e);
                const nearest = corners
                  .map((c, i) => ({ i, d: Math.hypot(c.x - p.x, c.y - p.y) }))
                  .sort((a, b) => a.d - b.d)[0];
                const index = nearest.d < 0.1 ? nearest.i : selected;
                drag.current = index;
                setSelected(index);
                e.currentTarget.setPointerCapture(e.pointerId);
                change(index, p.x, p.y);
              }}
              onPointerMove={(e) => {
                if (drag.current === null) return;
                const p = point(e);
                change(drag.current, p.x, p.y);
              }}
              onPointerUp={() => {
                drag.current = null;
              }}
              onPointerCancel={() => {
                drag.current = null;
              }}
            >
              <path
                d={`M0 0H1000V1000H0Z M${corners.map((p) => `${p.x * 1000} ${p.y * 1000}`).join("L")}Z`}
                fill="#26332375"
                fillRule="evenodd"
              />
              <polygon
                points={corners
                  .map((p) => `${p.x * 1000},${p.y * 1000}`)
                  .join(" ")}
                fill="none"
                stroke="#2457e6"
                strokeWidth="4"
              />
              {corners.map((p, i) => (
                <g key={i}>
                  <circle
                    cx={p.x * 1000}
                    cy={p.y * 1000}
                    r={i === selected ? 17 : 13}
                    fill={i === selected ? "#e8eeff" : "#ffffff"}
                    stroke="#2457e6"
                    strokeWidth="4"
                  />
                  <text
                    x={p.x * 1000}
                    y={p.y * 1000 + 4}
                    textAnchor="middle"
                    fill="#17398f"
                    fontSize="16"
                  >
                    {i + 1}
                  </text>
                </g>
              ))}
            </svg>
          </div>
          <div className="alignment-tools">
            <button
              className="secondary-button"
              disabled={busy}
              onClick={() => {
                setBusy(true);
                void rotatePage(photo)
                  .then((value) => {
                    setPhoto(value);
                    setCorners(fullPage());
                    setPreview("");
                  })
                  .catch(() => setError("The page could not be rotated."))
                  .finally(() => setBusy(false));
              }}
            >
              <RotateCw size={15} />
              Rotate page
            </button>
            <button
              className="text-button"
              disabled={busy}
              onClick={() => {
                setCorners(fullPage());
                setPreview("");
              }}
            >
              <Undo2 size={15} />
              Reset corners
            </button>
          </div>
        </section>
        <section className="alignment-settings">
          <strong>Four corners, in order</strong>
          <div className="corner-tabs">
            {names.map((name, i) => (
              <button
                key={name}
                aria-pressed={selected === i}
                disabled={busy}
                onClick={() => setSelected(i)}
              >
                {i + 1}. {name}
              </button>
            ))}
          </div>
          <p className="small-note">
            Drag a handle, or select a corner and tap its position. Arrow keys
            on a corner field make small adjustments.
          </p>
          <div className="alignment-coordinates">
            {(["x", "y"] as const).map((axis) => (
              <label key={axis}>
                {axis.toUpperCase()} %
                <input
                  aria-label={`${names[selected]} ${axis} percent`}
                  type="number"
                  min="0"
                  max="100"
                  step="0.2"
                  disabled={busy}
                  value={Math.round(corners[selected][axis] * 1000) / 10}
                  onChange={(e) => {
                    const p = corners[selected];
                    change(
                      selected,
                      axis === "x" ? Number(e.target.value) / 100 : p.x,
                      axis === "y" ? Number(e.target.value) / 100 : p.y,
                    );
                  }}
                />
              </label>
            ))}
          </div>
          <label className="alignment-ratio">
            Page shape
            <select
              aria-label="Aligned page shape"
              value={aspect}
              disabled={busy || Boolean(matchAspect)}
              onChange={(e) => {
                setAspect(Number(e.target.value));
                setPreview("");
              }}
            >
              {matchAspect ? (
                <option value={matchAspect}>Match the current page</option>
              ) : (
                <>
                  <option value={1440 / 820}>Wide world page</option>
                  <option value={Math.SQRT2}>Landscape paper</option>
                  <option value={1 / Math.SQRT2}>Portrait paper</option>
                </>
              )}
            </select>
          </label>
          {referenceImage && (
            <div className="alignment-reference">
              <img
                src={referenceImage}
                alt="Current page for alignment reference"
              />
              <span>Keep the same paper edges as this page.</span>
            </div>
          )}
          {(error || problem) && (
            <p className="editor-error" role="alert">
              {error || problem}
            </p>
          )}
          <button
            className="primary-button"
            disabled={
              busy ||
              Boolean(problem) ||
              Boolean(referenceImage && matchAspect === null)
            }
            onClick={() => void straighten()}
          >
            {busy ? (
              <LoaderCircle className="spin" size={16} />
            ) : (
              <Crop size={16} />
            )}
            Straighten & preview
          </button>
        </section>
      </div>
      {preview && (
        <section className="alignment-result" ref={resultPanel} tabIndex={-1} aria-label="Straightened page preview. Check the edges and ink before applying.">
          <div>
            <Check size={16} />
            <strong>Your straightened page</strong>
            <span>Check the edges and the ink before continuing.</span>
          </div>
          <div className="alignment-result-pair">
            <figure>
              <figcaption>Your photo</figcaption>
              <img src={photo} alt="Original photo before alignment" />
            </figure>
            <figure>
              <figcaption>Your page, straightened</figcaption>
              <img src={preview} alt="Straightened page preview" />
            </figure>
          </div>
        </section>
      )}

    </Modal>
  );
}
