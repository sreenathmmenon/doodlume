import { InterpretationError } from './model.js';
import type { RecognitionReview } from '../shared/recognition-review.js';

export class RecognitionReviewError extends InterpretationError {
  constructor(public recovery: RecognitionReview) {
    super('Some recognized objects need your correction. Your current world is unchanged.', 422);
  }
}
