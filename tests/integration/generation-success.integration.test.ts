import { describe, expect, it } from "vitest";
import {
  normalizeReviewRequest,
  validateSingleImageRequest,
} from "../../convex/generateValidation";

describe("generation success integration", () => {
  it("single image input should pass validation", () => {
    const validated = validateSingleImageRequest(" https://example.com/a.jpg ");
    expect(validated.ok).toBe(true);
    if (validated.ok) {
      expect(validated.imageUrl).toBe("https://example.com/a.jpg");
    }
  });

  it("review input should normalize memo and keywords", () => {
    const normalized = normalizeReviewRequest({
      imageUrls: ["https://example.com/1.jpg", "https://example.com/2.jpg"],
      memo: "  메모  ",
      keywords: ["키워드1", " ", "키워드2"],
    });
    expect(normalized.ok).toBe(true);
    if (normalized.ok) {
      expect(normalized.memo).toBe("메모");
      expect(normalized.keywords).toEqual(["키워드1", "키워드2"]);
    }
  });
});

