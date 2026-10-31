import { useState } from "react";
import { Modal } from "./Modal";

export function SourceInspector({
  image,
  name,
  onClose,
}: {
  image: string;
  name: string;
  onClose: () => void;
}) {
  const [zoom, setZoom] = useState(100);
  return (
    <Modal title="Original image" wide onClose={onClose}>
      <div className="source-inspector-controls">
        <label>
          Image zoom{" "}
          <input
            type="range"
            min="100"
            max="400"
            step="25"
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
          />{" "}
          <output>{zoom}%</output>
        </label>
        <button className="secondary-button" onClick={() => setZoom(100)}>
          Fit image
        </button>
      </div>
      <div
        className="source-inspector-view"
        tabIndex={0}
        role="region"
        aria-label="Original image detail. Use arrow keys to scroll when zoomed."
      >
        <img src={image} alt={name} style={{ width: `${zoom}%` }} />
      </div>
      <div className="review-actions">
        <button className="primary-button" onClick={onClose}>
          Back to creation
        </button>
      </div>
    </Modal>
  );
}
