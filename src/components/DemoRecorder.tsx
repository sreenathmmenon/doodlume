import { useEffect, useRef, useState } from "react";
import "./DemoRecorder.css";

type Recording = {
  recorder: MediaRecorder;
  stream: MediaStream;
  canvas?: HTMLCanvasElement;
  started: number;
};
type Download = { url: string; name: string };

/** Deliberate local capture aid. Never requests capture on mount. */
export function DemoRecorder({ active: enabled = true }: { active?: boolean } = {}) {
  if (
    !enabled ||
    typeof window === "undefined" ||
    !["localhost", "127.0.0.1", "[::1]"].includes(window.location.hostname) ||
    new URLSearchParams(window.location.search).get("record") !== "1"
  ) return null;
  return <LocalRecorder />;
}

function LocalRecorder() {
  const active = useRef<Recording | null>(null);
  const alive = useRef(true);
  const requesting = useRef(false);
  const [phase, setPhase] = useState<"idle" | "requesting" | "recording" | "saving">("idle");
  const [collapsed, setCollapsed] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState("");
  const [download, setDownload] = useState<Download | null>(null);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      const current = active.current;
      active.current = null;
      if (current) {
        current.recorder.ondataavailable = null;
        current.recorder.onstop = null;
        current.recorder.onerror = null;
        if (current.recorder.state !== "inactive") current.recorder.stop();
        current.stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  useEffect(() => () => {
    if (download) URL.revokeObjectURL(download.url);
  }, [download]);

  useEffect(() => {
    if (phase !== "recording") return;
    const timer = window.setInterval(() => {
      const current = active.current;
      if (!current) return;
      setSeconds(Math.floor((performance.now() - current.started) / 1000));
      if (current.canvas && !current.canvas.isConnected) {
        setError("The game canvas changed. This clip has stopped; start another clip for the new game.");
        stop();
      }
    }, 500);
    return () => window.clearInterval(timer);
  }, [phase]);

  function stop() {
    const current = active.current;
    if (!current || current.recorder.state === "inactive") return;
    setPhase("saving");
    current.recorder.stop();
  }

  async function start(source: "tab" | "game") {
    if (active.current || requesting.current) return;
    requesting.current = true;
    setError("");
    setPhase("requesting");
    let stream: MediaStream | undefined;
    try {
      if (typeof MediaRecorder === "undefined") throw new Error("This browser cannot record video. Use desktop Chrome.");
      const mimeType = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"]
        .find((type) => MediaRecorder.isTypeSupported(type));
      if (!mimeType) throw new Error("WebM recording is unavailable. Use desktop Chrome.");
      let canvas: HTMLCanvasElement | undefined;
      if (source === "tab") {
        if (!navigator.mediaDevices?.getDisplayMedia) throw new Error("Tab capture is unavailable. Try Record game only, or use desktop Chrome.");
        // The browser chooser remains authoritative; this is a preference, not a forced source.
        const options: DisplayMediaStreamOptions & { preferCurrentTab: boolean } = {
          video: { frameRate: { ideal: 30, max: 30 }, displaySurface: "browser" },
          audio: false,
          preferCurrentTab: true,
        };
        stream = await navigator.mediaDevices.getDisplayMedia(options);
      } else {
        canvas = Array.from(document.querySelectorAll<HTMLCanvasElement>(".world-canvas canvas"))
          .find((element) => element.width > 0 && element.height > 0 && element.getBoundingClientRect().width > 0);
        if (!canvas) throw new Error("Open a game first, then choose Record game only.");
        if (typeof canvas.captureStream !== "function") throw new Error("Game capture is unavailable in this browser.");
        // Capture the actual rendered game; no synthetic frames, actions, or alternate scene.
        stream = canvas.captureStream(30);
      }
      if (!alive.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 12_000_000 });
      const chunks: Blob[] = [];
      const current: Recording = { recorder, stream, canvas, started: performance.now() };
      active.current = current;
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunks.push(event.data);
      };
      recorder.onerror = () => {
        if (alive.current) setError("Recording interrupted. Any captured frames will be offered as a partial clip.");
        if (recorder.state !== "inactive") recorder.stop();
        stream?.getTracks().forEach((track) => track.stop());
      };
      recorder.onstop = () => {
        current.stream.getTracks().forEach((track) => track.stop());
        if (active.current === current) active.current = null;
        if (!alive.current) return;
        setPhase("idle");
        setCollapsed(false);
        const blob = new Blob(chunks, { type: recorder.mimeType || mimeType });
        if (!blob.size) {
          setError("No video frames were recorded. Try again after the game is visible.");
          return;
        }
        const file = {
          url: URL.createObjectURL(blob),
          name: `doodlume-${source}-${new Date().toISOString().replace(/[:.]/g, "-")}.webm`,
        };
        setDownload(file);
        const anchor = document.createElement("a");
        anchor.href = file.url;
        anchor.download = file.name;
        document.body.append(anchor);
        anchor.click();
        anchor.remove();
      };
      current.stream.getVideoTracks().forEach((track) => {
        track.addEventListener("ended", () => {
          if (recorder.state !== "inactive") {
            if (alive.current) setPhase("saving");
            recorder.stop();
          }
        }, { once: true });
      });
      recorder.start(1000);
      setSeconds(0);
      setPhase("recording");
      setCollapsed(true);
    } catch (cause) {
      stream?.getTracks().forEach((track) => track.stop());
      active.current = null;
      if (alive.current) {
        setPhase("idle");
        const cancelled = cause instanceof DOMException && cause.name === "NotAllowedError";
        const inactive = cause instanceof DOMException && cause.name === "InvalidStateError";
        setError(cancelled ? "Capture was not allowed. Choose this tab in the browser picker, or use Record game only." : inactive ? "Select this browser tab first, then start recording again." : cause instanceof Error ? cause.message : "Could not start recording.");
      }
    } finally {
      requesting.current = false;
    }
  }

  const time = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  const recording = phase === "recording";
  return (
    <aside className={`demo-recorder${collapsed ? " demo-recorder--collapsed" : ""}`} aria-label="Local demo recorder">
      <div className="demo-recorder__bar">
        <strong>{recording ? <><span className="demo-recorder__dot" /> {time}</> : "Local capture"}</strong>
        {recording && <button type="button" onClick={stop}>Stop &amp; download</button>}
        <button type="button" className="demo-recorder__toggle" aria-expanded={!collapsed} aria-label={collapsed ? "Expand recorder" : "Collapse recorder"} onClick={() => setCollapsed(!collapsed)}>{collapsed ? "+" : "−"}</button>
      </div>
      {!collapsed && <div className="demo-recorder__body">
        <p>Local video only. No audio or uploads.</p>
        {phase === "idle" && <div className="demo-recorder__actions">
          <button type="button" onClick={() => void start("tab")}>Record this tab</button>
          <button type="button" onClick={() => void start("game")}>Record game only</button>
        </div>}
        {phase === "requesting" && <p role="status">Choose this tab in the browser picker.</p>}
        {phase === "saving" && <p role="status">Preparing your clip…</p>}
        {error && <p className="demo-recorder__error" role="alert">{error}</p>}
        {download && <a href={download.url} download={download.name}>Download last clip again</a>}
      </div>}
    </aside>
  );
}
