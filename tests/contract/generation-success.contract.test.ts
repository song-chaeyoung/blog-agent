import { describe, expect, it, vi } from "vitest";
import { makeSingleSuccess } from "../helpers/generationTestUtils";
import { composeReviewDraftStage } from "../../convex/generateDraft";

describe("generation success contract", () => {
  it("single success shape should satisfy public contract", () => {
    const result = makeSingleSuccess();
    expect(result.ok).toBe(true);
    expect(result.stage).toBe("completed");
    expect(result.mode).toBe("single");
    expect(typeof result.content).toBe("string");
    expect(Array.isArray(result.references)).toBe(true);
  });

  it("review success should return imageBlocks count equal to input image count", async () => {
    const ai = {
      chat: {
        completions: {
          create: vi.fn().mockResolvedValue({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    intro: "도입",
                    captions: ["첫 번째", "두 번째"],
                    outro: "마무리",
                  }),
                },
              },
            ],
          }),
        },
      },
    } as never;

    const observations = [
      { url: "https://example.com/1.jpg", observation: "관찰1", position: 0 },
      { url: "https://example.com/2.jpg", observation: "관찰2", position: 1 },
    ];

    const result = await composeReviewDraftStage(
      ai,
      observations,
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
      expect(result.imageBlocks).toHaveLength(observations.length);
      expect(result.imageBlocks[0]?.url).toBe(observations[0]?.url);
      expect(result.imageBlocks[1]?.url).toBe(observations[1]?.url);
    }
  });
});

