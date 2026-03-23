import { describe, expect, it } from "vitest";
import { makeFailure } from "../helpers/generationTestUtils";

describe("generation failure contract", () => {
  it("failure response should include failedStage/code/message/retryable", () => {
    const failure = makeFailure({
      failedStage: "rag-context",
      code: "RAG_NOT_ENOUGH_REFERENCES",
      message: "참조 가능한 요약이 부족합니다.",
      retryable: false,
    });

    expect(failure.ok).toBe(false);
    expect(failure.failedStage).toBe("rag-context");
    expect(failure.code).toBeTruthy();
    expect(typeof failure.message).toBe("string");
    expect(typeof failure.retryable).toBe("boolean");
  });
});

