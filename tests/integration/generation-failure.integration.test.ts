import { describe, expect, it } from "vitest";
import {
  normalizeReviewRequest,
  validateSingleImageRequest,
} from "../../convex/generateValidation";

describe("generation failure integration", () => {
  it("single image empty url should fail validation", () => {
    const validated = validateSingleImageRequest(" ");
    expect(validated.ok).toBe(false);
    if (!validated.ok) {
      expect(validated.failedStage).toBe("summary-preparation");
      expect(validated.retryable).toBe(false);
    }
  });

  it("review image count out of range should fail validation", () => {
    const normalized = normalizeReviewRequest({
      imageUrls: ["https://example.com/1.jpg"],
    });
    expect(normalized.ok).toBe(false);
    if (!normalized.ok) {
      expect(normalized.code).toBe("INVALID_IMAGE_COUNT");
    }
  });
});

