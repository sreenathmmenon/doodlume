import { InterpretationError, ModelPlanError } from "./model.js";
import { RecognitionReviewError } from "./recognition-error.js";
import type { RecognitionReview } from "../shared/recognition-review.js";

/** Serialize only at the HTTP boundary. The original error keeps its precise
 * diagnostic for the bounded model correction; artwork review stays editable. */
export function interpretationErrorResponse(error: unknown): {
  status: number; body: {error:string; recovery?:RecognitionReview};
} | undefined {
  if (error instanceof RecognitionReviewError)
    return {status:error.status,body:{error:error.message,recovery:error.recovery}};
  if (error instanceof ModelPlanError)
    return {status:error.status,body:{error:"The game rules could not be completed this time. Your image and current world are unchanged. Edit your request or try again."}};
  if (error instanceof InterpretationError)
    return {status:error.status,body:{error:error.message}};
}
