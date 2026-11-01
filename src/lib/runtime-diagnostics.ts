// Opt-in local QA instrumentation. No uploads, credentials or background collection.
export const diagnosticsEnabled =
  typeof location !== "undefined" &&
  new URLSearchParams(location.search).get("diagnostics") === "1";
let recording = false,
  previousFrame = 0,
  created = 0,
  destroyed = 0,
  peak = 0;
const intervals: number[] = [];
let lcp = 0,
  cls = 0,
  longTasks = 0;
let tileSurfaces = { count: 0, maxWidth: 0, maxHeight: 0 };
let firstWorldReadyMs: number | null = null,
  latestWorldSetupMs: number | null = null;
type CreationOutcome = "accepted" | "repair" | "clarification" | "error" | "cancelled";
let creation: { startedAt: number; returnedAt?: number; acceptedAt?: number; readyAt?: number; outcome?: CreationOutcome } | undefined;
/** Opt-in timings only: no source pixels, text, IDs or credentials are recorded. */
export function recordCreationStarted() {
  if (diagnosticsEnabled) creation = { startedAt: performance.now() };
}
export function recordRecognitionReturned(outcome: CreationOutcome) {
  if (diagnosticsEnabled && creation && !creation.returnedAt) {
    creation.returnedAt = performance.now();
    creation.outcome = outcome;
  }
}
export function recordReviewAccepted() {
  if (diagnosticsEnabled && creation && ["accepted", "repair"].includes(creation.outcome ?? "")) {
    creation.acceptedAt = performance.now();
    delete creation.readyAt;
  }
}
function creationReadings() {
  if (!creation) return null;
  const duration = (end?: number, start = creation!.startedAt) => end === undefined ? null : Number((end - start).toFixed(1));
  return {
    outcome: creation.outcome ?? "pending",
    requestToReviewMs: duration(creation.returnedAt),
    reviewDelayMs: creation.returnedAt ? duration(creation.acceptedAt, creation.returnedAt) : null,
    acceptToPlayableMs: creation.acceptedAt ? duration(creation.readyAt, creation.acceptedAt) : null,
    requestToPlayableMs: duration(creation.readyAt),
  };
}
export function recordWorldReady(startedAt: number) {
  if (!diagnosticsEnabled) return;
  if (creation?.acceptedAt && !creation.readyAt) creation.readyAt = performance.now();
  firstWorldReadyMs ??= Number(performance.now().toFixed(1));
  latestWorldSetupMs = Number((performance.now() - startedAt).toFixed(1));
}
export function recordTileSurfaces(
  surfaces: { width: number; height: number }[],
) {
  if (!diagnosticsEnabled) return;
  tileSurfaces = {
    count: surfaces.length,
    maxWidth: Math.max(0, ...surfaces.map((s) => s.width)),
    maxHeight: Math.max(0, ...surfaces.map((s) => s.height)),
  };
}
if (diagnosticsEnabled && typeof PerformanceObserver !== "undefined") {
  for (const type of ["largest-contentful-paint", "layout-shift", "longtask"]) {
    try {
      new PerformanceObserver((list) => {
        for (const item of list.getEntries()) {
          if (type === "largest-contentful-paint") lcp = item.startTime;
          else if (
            type === "layout-shift" &&
            !(item as PerformanceEntry & { hadRecentInput: boolean })
              .hadRecentInput
          )
            cls += (item as PerformanceEntry & { value: number }).value;
          else if (type === "longtask") longTasks++;
        }
      }).observe({ type, buffered: true });
    } catch {
      /* Unsupported entries remain unavailable. */
    }
  }
}
export function recordGameCreated() {
  if (diagnosticsEnabled) {
    created++;
    peak = Math.max(peak, created - destroyed);
  }
}
export function recordGameDestroyed() {
  if (diagnosticsEnabled) {
    destroyed++;
    previousFrame = 0;
  }
}
export function recordRenderedFrame(playing: boolean) {
  if (!diagnosticsEnabled || !recording || !playing || document.hidden) {
    previousFrame = 0;
    return;
  }
  const now = performance.now();
  if (previousFrame && intervals.length < 36000)
    intervals.push(now - previousFrame);
  previousFrame = now;
}
export function startFrameRecording() {
  intervals.length = 0;
  previousFrame = 0;
  recording = true;
}
export function stopFrameRecording() {
  recording = false;
  previousFrame = 0;
}
export function diagnosticSnapshot() {
  const sorted = [...intervals].sort((a, b) => a - b);
  const percentile = (q: number) =>
    sorted.length
      ? Number(
          sorted[
            Math.min(sorted.length - 1, Math.floor(sorted.length * q))
          ].toFixed(2),
        )
      : null;
  const navigation = performance.getEntriesByType("navigation")[0] as
    | PerformanceNavigationTiming
    | undefined;
  const memory = (
    performance as Performance & { memory?: { usedJSHeapSize: number } }
  ).memory;
  return {
    recording,
    creation: creationReadings(),
    samples: intervals.length,
    frameP50Ms: percentile(0.5),
    frameP95Ms: percentile(0.95),
    framesOver33Ms: intervals.filter((n) => n > 33).length,
    created,
    destroyed,
    activeGames: created - destroyed,
    peakGames: peak,
    domCanvases: document.querySelectorAll(".world-canvas canvas").length,
    tileSurfaces,
    firstWorldReadyMs,
    latestWorldSetupMs,
    lcpMs: Number(lcp.toFixed(1)),
    cls: Number(cls.toFixed(4)),
    longTasks,
    documentMs: navigation ? Number(navigation.responseEnd.toFixed(1)) : null,
    heapMB: memory
      ? Number((memory.usedJSHeapSize / 1024 / 1024).toFixed(1))
      : null,
    viewport: `${innerWidth}×${innerHeight}`,
    userAgent: navigator.userAgent,
  };
}
