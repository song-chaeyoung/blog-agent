import { describe, expect, it } from "vitest";
import {
  getReviewDraftLengthViolation,
  getSingleDraftLengthViolation,
  hasDraftFormatViolation,
} from "../../convex/generateDraft";

describe("draft format contract", () => {
  it("detects leaked analysis labels and markdown list", () => {
    const leaked = `이 이미지는 차분한 분위기를 전달합니다.

**상황:**
- 주전자가 테이블 중앙에 놓여 있습니다.

**감정:**
- 편안함`;

    expect(hasDraftFormatViolation(leaked)).toBe(true);
  });

  it("allows natural paragraph text", () => {
    const paragraph =
      "따뜻한 조명 아래 놓인 은색 주전자가 나무 테이블의 결을 부드럽게 살리며, 조용한 휴식의 순간을 자연스럽게 떠올리게 합니다.";

    expect(hasDraftFormatViolation(paragraph)).toBe(false);
  });

  it("detects single draft length overflow", () => {
    const tooLong = "가".repeat(1300);
    const violation = getSingleDraftLengthViolation(tooLong);
    expect(violation === null).toBe(false);
    expect(violation?.field).toBe("content");
  });

  it("detects review caption length overflow", () => {
    const violation = getReviewDraftLengthViolation(
      "도입부",
      "마무리",
      ["정상", "나".repeat(400)]
    );
    expect(violation === null).toBe(false);
    expect(violation?.field).toBe("caption");
    expect(violation?.index).toBe(1);
  });
});
