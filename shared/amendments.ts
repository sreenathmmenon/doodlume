import type { WorldPatch } from "./revisions.js";
export interface PaperProposal {
  patch: WorldPatch;
  summary: string;
  warnings: string[];
  evidence: { id: string; confidence: "high" | "review"; reason: string }[];
  elapsedMs: number;
  provider: string;
}
