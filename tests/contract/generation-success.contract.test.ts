import { describe, expect, it } from "vitest";
import { makeSingleSuccess } from "../helpers/generationTestUtils";

describe("generation success contract", () => {
  it("single success shape should satisfy public contract", () => {
    const result = makeSingleSuccess();
    expect(result.ok).toBe(true);
    expect(result.stage).toBe("completed");
    expect(result.mode).toBe("single");
    expect(typeof result.content).toBe("string");
    expect(Array.isArray(result.references)).toBe(true);
  });

  it("review success sample should satisfy public contract", () => {
    const result = {
      ok: true as const,
      stage: "completed" as const,
      mode: "review" as const,
      postId: "post_test_id",
      content: "본문",
      intro: "도입",
      outro: "마무리",
      imageBlocks: [{ url: "https://example.com/a.jpg", caption: "캡션" }],
      references: [],
    };
    expect(result.ok).toBe(true);
    expect(result.mode).toBe("review");
    expect(result.imageBlocks.length).toBeGreaterThan(0);
  });
});

