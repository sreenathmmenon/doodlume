import React, { lazy, Suspense, useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import "./design-system.css";
import "./styles.css";
import "./studio.css";
import { diagnosticsEnabled } from "./lib/runtime-diagnostics";
const RuntimeDiagnostics = lazy(
  () => import("./components/RuntimeDiagnostics"),
);
const Studio = lazy(() => import("./App"));
const Capture = lazy(() => import("./components/CapturePage"));
const Home = lazy(() => import("./components/Home"));
const DemoRecorder = lazy(() => import("./components/DemoRecorder").then(m => ({ default: m.DemoRecorder })));
const isCapture = location.pathname.startsWith("/capture/");
function Product() {
  const [studio, setStudio] = useState(() => location.hash.startsWith("#studio"));
  const [studioOpened, setStudioOpened] = useState(() => location.hash.startsWith("#studio"));
  useEffect(() => {
    const route = () => {
      const next = location.hash.startsWith("#studio");
      setStudio(next);
      if (next) { setStudioOpened(true); window.scrollTo(0, 0); }
    };
    window.addEventListener("hashchange", route);
    return () => window.removeEventListener("hashchange", route);
  }, []);
  return isCapture ? <Capture /> : <>
    {!studio && <Home />}
    {studioOpened && <div hidden={!studio} inert={!studio}><Studio active={studio}/></div>}
  </>;
}
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Suspense
      fallback={
        <div className="studio-loading">Opening Doodlume…</div>
      }
    >
      <Product />
      {location.search.includes("record=1") && <DemoRecorder />}
      {diagnosticsEnabled && !isCapture && <RuntimeDiagnostics />}
    </Suspense>
  </React.StrictMode>,
);
