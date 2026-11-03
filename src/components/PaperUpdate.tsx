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
import { movementMode, type EntityKind, type WorldDefinition } from "../../shared/world";
import type { PaperProposal } from "../../shared/amendments";
type PaperDraft = { initialImage?: string; image: string; mark?: InkMark; kind: EntityKind; intent: string; sketch?: string; error: string };
const paperDrafts = new Map<string, PaperDraft>();
export function PaperUpdate(props: Parameters<typeof PaperUpdateSession>[0]) {
  return <PaperUpdateSession key={`${props.world.id}:${props.world.revision}`} {...props} />;
}
function PaperUpdateSession({
  world,
  configured,
  provider,
  initialImage,
  initialMark,
  initialKind,
  initialIntent,
  onIntentChange,
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
  initialIntent?: string;
  onIntentChange?: (intent: string) => void;
  onReview: (proposal: PaperProposal) => void;
  onManual: (image: string, mark?: InkMark, kind?: EntityKind) => void;
  onClose: () => void;
}) {
  const cacheKey = `${world.id}:${world.revision}`;
  const kept = paperDrafts.get(cacheKey);
  const saved = useRef(kept && (kept.initialImage === initialImage || kept.image === initialImage) ? kept : undefined).current;
  const [image, setImage] = useState(saved?.image ?? initialImage ?? "");
  const [mark, setMark] = useState<InkMark | undefined>(saved ? saved.mark : initialMark);
  const [kind, setKind] = useState<EntityKind>(saved?.kind ?? initialKind ?? "bridge");
  const [intent, setIntent] = useState(saved?.intent ?? initialIntent ?? "");
  const [sketchDraft, setSketchDraft] = useState<string | undefined>(saved?.sketch);
  const [drawing, setDrawing] = useState(false);
  const [phone, setPhone] = useState(false);
  const [aligning, setAligning] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(saved?.error ?? "");
  const uploadVersion = useRef(0);
  useEffect(() => {
    if (!image && !intent && !sketchDraft && !error) { paperDrafts.delete(cacheKey); return; }
    paperDrafts.set(cacheKey, { initialImage, image, mark, kind, intent, sketch: sketchDraft, error });
    if (paperDrafts.size > 12) paperDrafts.delete(paperDrafts.keys().next().value!);
  }, [cacheKey, initialImage, image, mark, kind, intent, sketchDraft, error]);
  const file = useRef<HTMLInputElement>(null);
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => { request.current?.abort(); uploadVersion.current++; }, []);
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
      // Keep only moving-subject masks needed to reconstruct the revised scenery.
      const context = {
        ...world,
        entities: world.entities.map(({ art, ...entity }) =>
          entity.sourceLayer || entity.kind === "player" || (entity.kind === "gate" && world.entities.some(other => other.kind === "lever" && other.targetId === entity.id))
            ? { ...entity, art } : entity),
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
      <Modal title="Update image" onClose={close} wide className="paper-update-modal" footer={
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
              Review changes <ArrowUpRight size={16} />
            </button>
          )}
        </div>
      }>
        <p className="modal-copy">
          Add to your original image. Your world and progress stay intact.
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
                <span>Draw or upload your changes</span>
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
            const version = ++uploadVersion.current;
            if (chosen)
              void readDrawingFile(chosen)
                .then((value) => {
                  if (version !== uploadVersion.current) return;
                  setAligning(value);
                  setError("");
                })
                .catch((e) => { if (version === uploadVersion.current) setError(e.message); });
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
                ["coin", "Collectible"],
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
          What did you add? (optional)
          <textarea
            maxLength={500}
            value={intent}
            onChange={(e) => {
              setIntent(e.target.value);
              onIntentChange?.(e.target.value);
            }}
            placeholder={movementMode(world) === "discover"
              ? "A new clue to find in the image…"
              : world.inputKind === "picture" || movementMode(world) === "roam"
                ? "A new object or destination to explore…"
                : "A new crossing, collectible, or destination…"}
            disabled={busy}
          />
        </label>
        <p className="small-note">
          Draft kept in this tab. Review additions before applying.
        </p>
        {!available && (
          <p className="paper-connection">
            {world.source === "example"
              ? "Use manual placement for this example."
              : world.inputKind === "picture"
                ? "Use manual placement for photo updates."
                : !configured
                  ? `${provider} needs a working key for automatic comparison. Place additions manually for now.`
                  : "Use manual placement to update this world."}
          </p>
        )}
        {error && (
          <p className="editor-error" role="alert">
            {error}
          </p>
        )}
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
          resumeImage={sketchDraft}
          onPause={setSketchDraft}
          onClose={() => setDrawing(false)}
          onUse={(value, ink) => {
            setImage(value);
            setMark(ink);
            setSketchDraft(undefined);
            setDrawing(false);
            setError("");
          }}
        />
      )}
    </>
  );
}
