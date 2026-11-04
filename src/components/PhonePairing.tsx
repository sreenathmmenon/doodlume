import { useEffect, useRef, useState } from "react";
import {
  Check,
  Copy,
  ExternalLink,
  LoaderCircle,
  Smartphone,
  Wifi,
} from "lucide-react";
import { Modal } from "./Modal";
import type { CaptureContext, PairingDetails } from "../../shared/capture";
export function PhonePairing({
  context,
  onReceive,
  onClose,
  hosted = false,
}: {
  context: CaptureContext;
  onReceive: (image: string, context: CaptureContext) => void;
  onClose: () => void;
  hosted?: boolean;
}) {
  const [pair, setPair] = useState<PairingDetails | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [copied, setCopied] = useState(false),
    [linkIndex, setLinkIndex] = useState(0);
  const current = useRef<PairingDetails | null>(null),
    controller = useRef<AbortController | null>(null),
    receive = useRef(onReceive);
  receive.current = onReceive;
  const revoke = (p: PairingDetails) =>
    void fetch(`/api/pairings/${p.id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${p.ownerToken}`, "Content-Type": "application/json" },
      body: "{}",
      keepalive: true,
    }).catch(() => {});
  useEffect(
    () => () => {
      controller.current?.abort();
      if (current.current) revoke(current.current);
    },
    [],
  );
  useEffect(() => {
    if (!pair) return;
    let active = true,
      timer: ReturnType<typeof setTimeout>;
    const abort = new AbortController();
    let failures = 0;
    async function poll() {
      try {
        const response = await fetch(`/api/pairings/${pair!.id}`, {
          headers: { Authorization: `Bearer ${pair!.ownerToken}` },
          signal: abort.signal,
          cache: "no-store",
        });
        const result = await response.json();
        if (!active) return;
        if (!response.ok) {
          setError(result.error || "This connection expired. Open a new link.");
          return;
        }
        if (failures) setError("");
        failures = 0;
        if (result.state === "ready" && typeof result.image === "string") {
          revoke(pair!);
          current.current = null;
          receive.current(result.image, pair!.context);
          return;
        }
      } catch {
        if (!active) return;
        failures++;
        setError("The studio connection was interrupted. Reconnecting…");
      }
      if (active)
        timer = setTimeout(
          () => void poll(),
          Math.min(8000, 1500 * (1 + failures)),
        );
    }
    void poll();
    return () => {
      active = false;
      clearTimeout(timer);
      abort.abort();
    };
  }, [pair]);
  async function connect(network: boolean) {
    setBusy(true);
    setError("");
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    if (current.current) {
      revoke(current.current);
      current.current = null;
    }
    setPair(null);
    try {
      const response = await fetch("/api/pairings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ context, network }),
        signal: abort.signal,
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "The phone connection could not open.");
      if (abort.signal.aborted) return;
      current.current = result;
      setPair(result);
      setLinkIndex(0);
    } catch (e) {
      if (!abort.signal.aborted)
        setError(
          e instanceof Error
            ? e.message
            : "The phone connection could not open.",
        );
    } finally {
      if (!abort.signal.aborted) setBusy(false);
    }
  }
  const link = pair?.links[linkIndex];
  return (
    <Modal
      title="Your phone is the camera. Your page is the idea."
      onClose={onClose}
    >
      <p className="modal-copy">
        {context.purpose === "update"
          ? `Send a revised page to ${context.name}, version ${context.revision}.`
          : "Photograph your drawing and send it straight to this studio."}
      </p>
      {!pair ? (
        <div className="pair-start">
          <div className="pair-illustration">
            <Smartphone size={50} strokeWidth={1.2} />
            <span>paper → phone → your world</span>
          </div>
          <p>
            {hosted ? 'Scan a private link to send one drawing. It expires in ten minutes.' : 'Keep your phone and laptop on the same Wi-Fi. The connection accepts one drawing and expires in ten minutes.'}
          </p>
          <button
            className="primary-button"
            disabled={busy}
            onClick={() => void connect(!hosted)}
          >
            {busy ? (
              <LoaderCircle size={17} className="spin" />
            ) : (
              hosted ? <Smartphone size={17} /> : <Wifi size={17} />
            )}
            {hosted ? 'Connect your phone' : 'Connect on Wi-Fi'}
          </button>
          {!hosted && <button
            className="text-button"
            disabled={busy}
            onClick={() => void connect(false)}
          >
            Preview pairing on this computer
          </button>}
          {!hosted && <p className="small-note">
            Wi-Fi mode opens a temporary drawing-only connection on this laptop.
            It closes when you finish or cancel; model access stays private.
          </p>}
        </div>
      ) : (
        <div className="pair-connected">
          <span className="pair-target">
            <Smartphone size={15} />
            {hosted || pair.network
              ? "Scan with your phone camera"
              : "Preview connection · this computer only"}
          </span>
          {link && (
            <img
              className="pair-qr"
              src={link.qr}
              alt="QR code for this temporary drawing connection"
            />
          )}
          <ol>
            <li>Open the link and photograph your page.</li>
            <li>Check the photo, then send it here.</li>
            <li>Align the paper edges before continuing.</li>
          </ol>
          {pair.links.length > 1 && (
            <label className="pair-address">
              Laptop network address
              <select
                aria-label="Phone connection address"
                value={linkIndex}
                onChange={(e) => setLinkIndex(Number(e.target.value))}
              >
                {pair.links.map((item, i) => (
                  <option key={item.url} value={i}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="pair-link-actions">
            <button
              className="secondary-button"
              onClick={() => {
                if (link)
                  void navigator.clipboard
                    .writeText(link.url)
                    .then(() => setCopied(true))
                    .catch(() =>
                      setError(
                        "Open the capture link below, or scan the code.",
                      ),
                    );
              }}
            >
              {copied ? <Check size={15} /> : <Copy size={15} />}{" "}
              {copied ? "Link copied" : "Copy link"}
            </button>
            {link && (
              <a
                className="secondary-button"
                href={link.url}
                target="_blank"
                rel="noreferrer"
              >
                Open capture page <ExternalLink size={15} />
              </a>
            )}
          </div>
          <p className="pair-waiting" role="status">
            <LoaderCircle size={15} className="spin" />
            Waiting for your drawing…
          </p>
          <p className="small-note">
            Expires at{" "}
            {new Date(pair.expiresAt).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
            .{" "}
            {hosted ? 'Keep this window open while sending your drawing.' : pair.network
              ? "Keep this window open and both devices on the same Wi-Fi."
              : "For a physical phone, close this preview and choose Connect on Wi-Fi."}
          </p>
          <button
            className="text-button"
            onClick={() => void connect(pair.network)}
          >
            Create a fresh link
          </button>
        </div>
      )}
      {error && (
        <p className="editor-error" role="alert">
          {error}
        </p>
      )}
    </Modal>
  );
}
