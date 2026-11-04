import { InterpretationError } from "./model.js";

export class ModelCallDeadlineError extends InterpretationError {
  constructor() {
    super("The selected model took too long to finish the game plan. Your image and current world are unchanged.", 504);
    this.name = "ModelCallDeadlineError";
  }
}
export class PlanningBudgetExhaustedError extends InterpretationError {
  constructor() {
    super("The game plan needs another attempt, but there is not enough time left to build and check it safely. Your image and current world are unchanged.", 504);
    this.name = "PlanningBudgetExhaustedError";
  }
}

export interface PlanningCallLease { signal: AbortSignal; dispose(): void }
export interface PlanningExecutionBudget {
  acquireCall(parentSignal: AbortSignal): PlanningCallLease;
  canStartCall(): boolean;
  remainingMs(): number;
}
export interface PlanningBudgetOptions {
  totalMs?: number;
  reserveForCompilationMs?: number;
  maxCallMs?: number;
  minCallMs?: number;
  /** Monotonic clock injection makes scheduling tests deterministic. */
  now?: () => number;
}

/** Request-local wall-clock budget, shared by initial inference and all repairs.
 * Local extraction/compilation time counts too; no repair may spend its reserve.
 * This schedules work; it never relaxes source or gameplay validation. */
export function createPlanningBudget(options: PlanningBudgetOptions = {}): PlanningExecutionBudget {
  const totalMs = options.totalMs ?? 120_000;
  const reserveMs = options.reserveForCompilationMs ?? 30_000;
  const maxCallMs = options.maxCallMs ?? 60_000;
  const minCallMs = options.minCallMs ?? 8_000;
  for (const value of [totalMs,reserveMs,maxCallMs,minCallMs]) {
    if (!Number.isFinite(value) || value <= 0) throw new RangeError("Planning budgets must be positive finite milliseconds.");
  }
  if (reserveMs >= totalMs || minCallMs > maxCallMs || minCallMs > totalMs-reserveMs)
    throw new RangeError("Planning call limits must fit within the request after the compilation reserve.");
  const now = options.now ?? (() => performance.now());
  const deadline = now() + totalMs;
  const remainingMs = () => Math.max(0,deadline-now());
  const availableMs = () => Math.min(maxCallMs,remainingMs()-reserveMs);
  return {
    remainingMs,
    canStartCall: () => availableMs() >= minCallMs,
    acquireCall(parentSignal) {
      parentSignal.throwIfAborted();
      const timeoutMs = availableMs();
      if (timeoutMs < minCallMs) throw new PlanningBudgetExhaustedError();
      const controller = new AbortController();
      const onParentAbort = () => controller.abort(parentSignal.reason);
      parentSignal.addEventListener("abort",onParentAbort,{once:true});
      const timer = setTimeout(() => controller.abort(new ModelCallDeadlineError()),timeoutMs);
      return {
        signal:controller.signal,
        dispose() {
          clearTimeout(timer);
          parentSignal.removeEventListener("abort",onParentAbort);
        },
      };
    },
  };
}
