import { useEffect, useState } from "react";
import {
  diagnosticSnapshot,
  startFrameRecording,
  stopFrameRecording,
} from "../lib/runtime-diagnostics";

export default function RuntimeDiagnostics() {
  const [snapshot, setSnapshot] = useState(diagnosticSnapshot);
  useEffect(() => {
    const id = setInterval(() => setSnapshot(diagnosticSnapshot()), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <aside
      aria-label="Local performance diagnostics"
      style={{
        position: "relative",
        margin: "16px 32px",
        width: "calc(100% - 64px)",
        maxHeight: "40vh",
        overflow: "auto",
        padding: 12,
        background: "#fcfaf5",
        color: "#263c35",
        border: "1px solid #74816c",
        borderRadius: 8,
        fontSize: 12,
        boxShadow: "0 3px 18px #0002",
      }}
    >
      <strong>Local QA · no data uploaded</strong>
      <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
        <button
          onClick={() => {
            startFrameRecording();
            setSnapshot(diagnosticSnapshot());
          }}
        >
          Record play frames
        </button>
        <button
          onClick={() => {
            stopFrameRecording();
            setSnapshot(diagnosticSnapshot());
          }}
        >
          Stop recording
        </button>
      </div>
      <pre
        aria-label="Performance readings"
        style={{
          whiteSpace: "pre-wrap",
          fontSize: 11,
          lineHeight: 1.5,
          marginTop: 8,
        }}
      >
        {JSON.stringify(snapshot, null, 2)}
      </pre>
    </aside>
  );
}
