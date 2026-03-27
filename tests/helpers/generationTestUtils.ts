import type { StageName } from "../../src/types/post";

export function makeFailure(overrides?: Partial<{
  failedStage: StageName;
  code: string;
  message: string;
  retryable: boolean;
}>) {
  return {
    ok: false as const,
    failedStage: overrides?.failedStage ?? "image-analysis",
    code: overrides?.code ?? "TEST_FAILURE",
    message: overrides?.message ?? "테스트 실패 응답",
    retryable: overrides?.retryable ?? false,
  };
}

export function makeSingleSuccess(overrides?: Partial<{
  postId: string;
  content: string;
}>) {
  return {
    ok: true as const,
    stage: "completed" as const,
    mode: "single" as const,
    postId: (overrides?.postId ?? "post_test_id") as never,
    content: overrides?.content ?? "테스트 단일 글",
    references: [],
  };
}

