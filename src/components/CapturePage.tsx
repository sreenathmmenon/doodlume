import { useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  Camera,
  Check,
  ImagePlus,
  LoaderCircle,
  RotateCw,
  Sprout,
} from "lucide-react";
import type { CaptureContext } from "../../shared/capture";
import { readDrawingFile } from "../lib/drawing-file";
import { rotatePage } from "../lib/align-page";
export default function CapturePage() {
  const id = location.pathname.split("/").pop() ?? "",
    secret = useRef(location.hash.slice(1));
  const [context, setContext] = useState<CaptureContext | null>(null),
    [image, setImage] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [sent, setSent] = useState(false);
  const sending = useRef<AbortController | null>(null);
  useEffect(() => () => sending.current?.abort(), []);
  const camera = useRef<HTMLInputElement>(null),
    gallery = useRef<HTMLInputElement>(null),
    uploadId = useRef("");
  useEffect(() => {
    const controller = new AbortController();
    void fetch(`/api/capture/${id}`, {
      headers: { Authorization: `Bearer ${secret.current}` },
      signal: controller.signal,
      cache: "no-store",
    })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok)
          throw new Error(data.error || "Open a fresh link from your studio.");
        setContext(data.context);
        setSent(data.state === "sent");
      })
      .catch((e) => {
        if (!controller.signal.aborted)
          setError(e.message || "The studio could not be reached.");
      });
    return () => controller.abort();
  }, [id]);
  async function choose(file?: File) {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      setImage(await readDrawingFile(file));
      uploadId.current = Array.from(
        crypto.getRandomValues(new Uint8Array(16)),
        (b) => b.toString(16).padStart(2, "0"),
      ).join("");
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "The photo could not be opened.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function send() {
    const controller = new AbortController();
    sending.current = controller;
    const timeout = setTimeout(() => controller.abort(), 30_000);
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/capture/${id}`, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${secret.current}`,
        },
        body: JSON.stringify({ image, uploadId: uploadId.current }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "Your drawing could not be sent.");
      setSent(true);
      setImage("");
    } catch (e) {
      setError(
        controller.signal.aborted
          ? "Sending took too long. Keep your photo here, check the laptop connection, and retry."
          : e instanceof Error
            ? e.message
            : "The studio could not be reached. Keep this page open and retry.",
      );
    } finally {
      clearTimeout(timeout);
      sending.current = null;
      setBusy(false);
    }
  }
  return (
    <main className="capture-page">
      <header>
        <span className="capture-brand">
          <Sprout size={24} />
          doodlume.
        </span>
        <span>from page to possibility</span>
      </header>
      {sent ? (
        <section className="capture-success">
          <div>
            <Check size={35} />
          </div>
          <h1>
            A little ink,
            <br />
            <em>on its way.</em>
          </h1>
          <p>
            Your drawing has reached the studio. Return to your laptop to align
            the page and keep creating.
          </p>
          <small>
            This connection has finished. Start a new one in the studio for your
            next drawing.
          </small>
        </section>
      ) : (
        <>
          <section className="capture-intro">
            <span className="eyebrow">YOUR PHONE, YOUR PAGE</span>
            <h1>
              Make room for
              <br />
              <em>a little wonder.</em>
            </h1>
            <p>
              {context?.purpose === "update"
                ? `A fresh page for ${context.name}. Your adventure stays on the laptop.`
                : "Photograph your drawing. A whole little world starts here."}
            </p>
          </section>
          {context && (
            <>
              <div className="capture-target">
                <Check size={15} />
                {context.name}
                {context.revision ? ` · version ${context.revision}` : ""}
              </div>
              <div className={`capture-photo ${image ? "has-photo" : ""}`}>
                {image ? (
                  <img src={image} alt="Drawing photo ready to send" />
                ) : (
                  <div>
                    <Camera size={48} strokeWidth={1.2} />
                    <span>
                      All four paper corners in view.
                      <br />
                      Bright light. A steady hand.
                    </span>
                  </div>
                )}
              </div>
              <input
                ref={camera}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                capture="environment"
                hidden
                aria-label="Photograph drawing"
                onChange={(e) => {
                  void choose(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
              <input
                ref={gallery}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                hidden
                aria-label="Choose drawing photo"
                onChange={(e) => {
                  void choose(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
              <div className="capture-choose">
                <button
                  className="primary-button"
                  disabled={busy}
                  onClick={() => camera.current?.click()}
                >
                  <Camera size={18} />
                  {image ? "Retake photo" : "Take a photo"}
                </button>
                <button
                  className="secondary-button"
                  disabled={busy}
                  onClick={() => gallery.current?.click()}
                >
                  <ImagePlus size={18} />
                  Choose a photo
                </button>
              </div>
              {image && (
                <>
                  <button
                    className="text-button capture-rotate"
                    disabled={busy}
                    onClick={() => {
                      setBusy(true);
                      void rotatePage(image)
                        .then(setImage)
                        .catch(() =>
                          setError("The photo could not be rotated."),
                        )
                        .finally(() => setBusy(false));
                    }}
                  >
                    <RotateCw size={15} />
                    Rotate photo
                  </button>
                  <button
                    className="primary-button capture-send"
                    disabled={busy}
                    onClick={() => void send()}
                  >
                    {busy ? (
                      <LoaderCircle size={18} className="spin" />
                    ) : (
                      <ArrowUpRight size={18} />
                    )}
                    Send drawing to studio
                  </button>
                </>
              )}
              <p className="capture-note">
                Your photo goes to the paired laptop. It is not sent to a model
                until you choose to interpret it in the studio.
              </p>
            </>
          )}
          {error && (
            <p className="editor-error" role="alert">
              {error}
            </p>
          )}
          {!context && !error && (
            <p className="pair-waiting" role="status">
              <LoaderCircle className="spin" size={17} />
              Connecting to your studio…
            </p>
          )}
        </>
      )}
      <footer>A small mark. A new possibility.</footer>
    </main>
  );
}
