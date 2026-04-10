import { describe, expect, it } from "vitest";
import {
  normalizeReviewRequest,
  validateSingleImageRequest,
} from "../../convex/generateValidation";
import { composeReviewDraftStage } from "../../convex/generateDraft";

type ReviewDraftStageAi = Parameters<typeof composeReviewDraftStage>[0];

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

  it("review draft stage should keep success path when caption count mismatches", async () => {
    const ai = {
      chat: {
        completions: {
          create: async () => ({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    intro: "도입",
                    captions: ["한 개만"],
                    outro: "마무리",
                  }),
                },
              },
            ],
          }),
        },
      },
    } as unknown as ReviewDraftStageAi;

    const result = await composeReviewDraftStage(
      ai,
      [
        { url: "https://example.com/1.jpg", observation: "관찰1", position: 0 },
        { url: "https://example.com/2.jpg", observation: "관찰2", position: 1 },
      ],
      [],
      {
        openingMode: "off",
        openerPatterns: [],
        toneKeywords: [],
        confidence: 0,
      }
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.imageBlocks).toHaveLength(2);
      expect(result.imageBlocks[0]?.caption).toBe("한 개만");
      expect(result.imageBlocks[1]?.caption).toBe("");
    }
  });
});

