import { useEffect, useRef, useState } from "react";
import { ZoomIn, ZoomOut } from "lucide-react";
import { Modal } from "./Modal";
import { ZoomPercent } from "./ZoomPercent";
import "./SourceInspector.css";

export function SourceInspector({
  image,
  name,
  onClose,
  backLabel = "Back to creation",
}: {
  image: string;
  name: string;
  onClose: () => void;
  backLabel?: string;
}) {
  const [zoom, setZoom] = useState(100);
  const view = useRef<HTMLDivElement>(null);
  const [viewSize, setViewSize] = useState({ width: 0, height: 0 });
  const [imageAspect, setImageAspect] = useState(1);
  useEffect(() => {
    const node = view.current!;
    const measure = () => setViewSize({ width: node.clientWidth, height: node.clientHeight });
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    measure();
    return () => observer.disconnect();
  }, []);
  const fitWidth = Math.min(viewSize.width, viewSize.height * imageAspect);
  const imageWidth = fitWidth * zoom / 100;
  const imageHeight = imageWidth / imageAspect;
  const changeZoom = (value: number) => setZoom(Math.min(400, Math.max(100, value)));
  return (
    <Modal
      title="Original image"
      wide
      className="source-inspector-modal"
      onClose={onClose}
      footer={
        <div className="review-actions">
          <button className="primary-button" onClick={onClose}>{backLabel}</button>
        </div>
      }
    >
      <div className="source-inspector-controls" role="group" aria-label="Original image zoom, relative to fitted image">
        <button className="secondary-button source-zoom-step" aria-label="Zoom out" disabled={zoom <= 100} onClick={() => changeZoom(zoom / 1.5)}>
          <ZoomOut size={16} />
        </button>
        <input
          aria-label="Original image zoom, percent of fitted image"
          type="range"
          min="100"
          max="400"
          step="1"
          value={zoom}
          onChange={(e) => changeZoom(Number(e.target.value))}
        />
        <ZoomPercent value={zoom} min={100} max={400} onChange={changeZoom} />
        <button className="secondary-button source-zoom-step" aria-label="Zoom in" disabled={zoom >= 400} onClick={() => changeZoom(zoom * 1.5)}>
          <ZoomIn size={16} />
        </button>
        <button className="secondary-button" aria-pressed={zoom === 100} onClick={() => {
          setZoom(100);
          view.current?.scrollTo({ left: 0, top: 0 });
        }}>
          Fit image
        </button>
      </div>
      <div
        ref={view}
        className="source-inspector-view"
        tabIndex={0}
        role="region"
        aria-label="Original image detail. Use arrow keys to scroll when zoomed."
      >
        <div className="source-inspector-art" style={{
          width: Math.max(viewSize.width, imageWidth),
          height: Math.max(viewSize.height, imageHeight),
        }}>
          <img
            src={image}
            alt={name}
            onLoad={(event) => setImageAspect(event.currentTarget.naturalWidth / event.currentTarget.naturalHeight)}
            style={{ width: imageWidth || "100%" }}
          />
        </div>
      </div>
    </Modal>
  );
}
