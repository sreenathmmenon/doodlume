import { useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  ImagePlus,
  LoaderCircle,
  Pencil,
  Smartphone,
  Crop,
  X,
} from "lucide-react";
import { Modal } from "./Modal";
import { PhonePairing } from "./PhonePairing";
import { PageAlignment } from "./PageAlignment";
import { SketchPad } from "./SketchPad";
import { readDrawingFile } from "../lib/drawing-file";
import type { InkMark } from "../lib/ink";
import type { EntityKind, WorldDefinition } from "../../shared/world";
import type { PaperProposal } from "../../shared/amendments";
export function PaperUpdate({
  world,
  configured,
  provider,
  initialImage,
  initialMark,
  initialKind,
  onReview,
  onManual,
  onClose,
}: {
  world: WorldDefinition;
  configured: boolean;
  provider: string;
  initialImage?: string;
  initialMark?: InkMark;
  initialKind?: EntityKind;
  onReview: (proposal: PaperProposal) => void;
  onManual: (image: string, mark?: InkMark, kind?: EntityKind) => void;
  onClose: () => void;
}) {
  const [image, setImage] = useState(initialImage ?? "");
  const [mark, setMark] = useState<InkMark | undefined>(initialMark);
  const [kind, setKind] = useState<EntityKind>(initialKind ?? "bridge");
  const [intent, setIntent] = useState("");
  const [drawing, setDrawing] = useState(false);
  const [phone, setPhone] = useState(false);
  const [aligning, setAligning] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const file = useRef<HTMLInputElement>(null);
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  const available =
    configured && world.source === "meta" && world.inputKind !== "picture";
  function close() {
    request.current?.abort();
    onClose();
  }
  async function compare() {
    if (!image || !available || busy) return;
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setError("");
    try {
      // Artwork already lives in this browser; comparison needs identity/geometry and the two pages only.
      const context = {
        ...world,
        entities: world.entities.map(({ art, ...entity }) => entity),
      };
      const response = await fetch("/api/amend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ world: context, image, intent }),
        signal: controller.signal,
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(
          result.error ||
            "The page could not be compared. Your current world is safe.",
        );
      if (!controller.signal.aborted) onReview(result.proposal);
    } catch (e) {
      if (!controller.signal.aborted)
        setError(
          e instanceof Error ? e.message : "The page could not be compared.",
        );
    } finally {
      if (request.current === controller) {
        setBusy(false);
        request.current = null;
      }
    }
  }
  return (
    <>
      <Modal title="More on the page. More in your world." onClose={close} wide>
        <p className="modal-copy">
          Draw something new on the same page, or upload its revised photo. Your
          character, collected sunseeds, and used levers stay in this world.
        </p>
        <div className="paper-pair">
          <figure>
            <figcaption>Current page · version {world.revision}</figcaption>
            <img src={world.sourceImage} alt="Current world's source drawing" />
          </figure>
          <figure>
            <figcaption>Your revised page</figcaption>
            {image ? (
              <img src={image} alt="Revised drawing awaiting review" />
            ) : (
              <div className="paper-empty">
                <Pencil size={25} />
                <span>A new path starts with a new mark.</span>
              </div>
            )}
          </figure>
        </div>
        <input
          ref={file}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          hidden
          aria-label="Upload revised drawing"
          onChange={(e) => {
            const chosen = e.target.files?.[0];
            e.target.value = "";
            if (chosen)
              void readDrawingFile(chosen)
                .then((value) => {
                  setAligning(value);
                  setError("");
                })
                .catch((e) => setError(e.message));
          }}
        />
        <div className="paper-input-actions">
          <button
            className="secondary-button"
            disabled={busy}
            onClick={() => setDrawing(true)}
          >
            <Pencil size={16} />
            Draw on this page
          </button>
          <button
            className="secondary-button"
            disabled={busy}
            onClick={() => file.current?.click()}
          >
            <ImagePlus size={16} />
            Upload revised page
          </button>
          <button
            className="secondary-button"
            disabled={busy}
            onClick={() => setPhone(true)}
          >
            <Smartphone size={16} />
            Use phone camera
          </button>
          {image && !mark && (
            <button
              className="text-button"
              disabled={busy}
              onClick={() => setAligning(image)}
            >
              <Crop size={15} />
              Align revised page
            </button>
          )}
        </div>
        {mark && (
          <label className="paper-intent">
            What is your new shape?
            <select
              aria-label="Role of the new drawn shape"
              value={kind}
              onChange={(e) => setKind(e.target.value as EntityKind)}
            >
              {[
                ["bridge", "Bridge"],
                ["terrain", "Platform"],
                ["coin", "Sunseed"],
                ["lever", "Lever"],
                ["gate", "Gate"],
                ["goal", "Destination"],
                ["decoration", "Decoration"],
              ].map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <span className="small-note">
              Your new strokes become one object with their original artwork and
              page position. Draw one object per update; adjust it in review.
            </span>
          </label>
        )}
        <label className="paper-intent">
          What did you add?
          <textarea
            maxLength={500}
            value={intent}
            onChange={(e) => setIntent(e.target.value)}
            placeholder="A bridge across the gap, and a lever for the left gate…"
            disabled={busy}
          />
        </label>
        <p className="small-note">
          Keep the same crop, orientation, and framing. This update adds
          objects; it protects the objects already in play. You will review
          placement and gate connections before applying.
        </p>
        {!available && (
          <p className="paper-connection">
            {world.source === "example"
              ? "This authored example supports manual placement. Automatic comparison begins with a world interpreted from your own drawing."
              : `${provider} needs a working key for automatic comparison. You can place your new additions manually now.`}
          </p>
        )}
        {error && (
          <p className="editor-error" role="alert">
            {error}
          </p>
        )}
        <div className="paper-footer">
          <button
            className="text-button"
            disabled={!image || busy}
            onClick={() => onManual(image, mark, kind)}
          >
            {mark ? "Review my drawn object" : "Place additions myself"}{" "}
            <ArrowUpRight size={16} />
          </button>
          {busy ? (
            <button
              className="secondary-button"
              onClick={() => {
                request.current?.abort();
                setBusy(false);
              }}
            >
              <X size={16} />
              Cancel comparison
            </button>
          ) : (
            <button
              className="primary-button"
              disabled={!image || !available}
              onClick={() => void compare()}
            >
              Compare with {provider} <ArrowUpRight size={16} />
            </button>
          )}
        </div>
        {busy && (
          <div className="paper-progress" role="status">
            <LoaderCircle size={19} className="spin" />
            Comparing the two pages. Your world is unchanged.
          </div>
        )}
      </Modal>
      {phone && (
        <PhonePairing
          context={{
            purpose: "update",
            name: world.name,
            worldId: world.id,
            revision: world.revision,
          }}
          onClose={() => setPhone(false)}
          onReceive={(value, binding) => {
            if (
              binding.worldId !== world.id ||
              binding.revision !== world.revision
            ) {
              setError(
                "This capture belongs to an earlier world version. Start a fresh connection.",
              );
              setPhone(false);
              return;
            }
            setPhone(false);
            setAligning(value);
          }}
        />
      )}
      {aligning && (
        <PageAlignment
          image={aligning}
          referenceImage={world.sourceImage}
          onClose={() => setAligning(undefined)}
          onUse={(value) => {
            setImage(value);
            setMark(undefined);
            setAligning(undefined);
            setError("");
          }}
        />
      )}
      {drawing && (
        <SketchPad
          initialImage={world.sourceImage}
          onClose={() => setDrawing(false)}
          onUse={(value, ink) => {
            setImage(value);
            setMark(ink);
            setDrawing(false);
            setError("");
          }}
        />
      )}
    </>
  );
}
