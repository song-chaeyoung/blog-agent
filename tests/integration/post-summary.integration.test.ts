import { describe, expect, it, vi } from "vitest";
import { internal } from "../../convex/_generated/api";
import { scheduleSummaryRegeneration } from "../../convex/posts";

describe("post summary integration", () => {
  it("post update flow should trigger summary regeneration intent", async () => {
    const runAfter = vi.fn(async () => undefined);
    const ctx = {
      scheduler: {
        runAfter,
      },
    } as Parameters<typeof scheduleSummaryRegeneration>[0];

    const summaryToken = 123;
    await scheduleSummaryRegeneration(
      ctx,
      "post_test_id" as never,
      "updated body",
      summaryToken,
    );

    expect(runAfter).toHaveBeenCalledTimes(1);
    expect(runAfter).toHaveBeenCalledWith(0, internal.posts.generateSummary, {
      postId: "post_test_id",
      content: "updated body",
      expectedSummaryUpdatedAt: summaryToken,
    });
  });
});
