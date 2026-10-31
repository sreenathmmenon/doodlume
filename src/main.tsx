import React, { lazy, Suspense } from "react";
import ReactDOM from "react-dom/client";
import "./styles.css";
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
    </Suspense>
  </React.StrictMode>,
);
