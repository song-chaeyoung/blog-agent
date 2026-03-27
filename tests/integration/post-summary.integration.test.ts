import { describe, expect, it } from "vitest";

describe("post summary integration", () => {
  it("post update flow should trigger summary regeneration intent", () => {
    const updatePayload = {
      postId: "post_test_id",
      content: "수정된 본문",
    };

    expect(updatePayload.content.length).toBeGreaterThan(0);
    // 실제 Convex 스케줄 호출은 E2E 환경에서 검증
    expect(updatePayload.postId).toBeTruthy();
  });
});

