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

    await scheduleSummaryRegeneration(ctx, "post_test_id" as never, "수정된 본문");

    expect(runAfter).toHaveBeenCalledTimes(1);
    expect(runAfter).toHaveBeenCalledWith(0, internal.posts.generateSummary, {
      postId: "post_test_id",
      content: "수정된 본문",
    });
  });
});
