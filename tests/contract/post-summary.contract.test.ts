import { describe, expect, it } from "vitest";

describe("post summary contract", () => {
  it("ready status requires summary and embedding", () => {
    const post = {
      summaryStatus: "ready" as const,
      summary: "요약",
      embedding: [0.1, 0.2],
    };

    expect(post.summaryStatus).toBe("ready");
    expect(post.summary.length).toBeGreaterThan(0);
    expect(post.embedding.length).toBeGreaterThan(0);
  });

  it("failed status requires summaryError", () => {
    const post = {
      summaryStatus: "failed" as const,
      summaryError: "생성 실패",
    };
    expect(post.summaryStatus).toBe("failed");
    expect(post.summaryError.length).toBeGreaterThan(0);
  });
});

