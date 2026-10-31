import React, { lazy, Suspense } from "react";
import ReactDOM from "react-dom/client";
import "./styles.css";
import "./studio.css";
import { diagnosticsEnabled } from "./lib/runtime-diagnostics";
const RuntimeDiagnostics = lazy(
  () => import("./components/RuntimeDiagnostics"),
);
const Studio = lazy(() => import("./App"));
const Capture = lazy(() => import("./components/CapturePage"));
const isCapture = location.pathname.startsWith("/capture/");
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Suspense
      fallback={
        <div className="studio-loading">A little world is waking up…</div>
      }
    >
      {isCapture ? <Capture /> : <Studio />}
      {diagnosticsEnabled && !isCapture && <RuntimeDiagnostics />}
    </Suspense>
  </React.StrictMode>,
);
