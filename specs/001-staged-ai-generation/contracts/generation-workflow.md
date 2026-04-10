# Contract: 단계 분리형 생성 워크플로

## 공통 응답 규약

```ts
type StageName =
  | "summary-preparation"
  | "style-profile-preparation"
  | "image-analysis"
  | "rag-context"
  | "final-draft";

type GenerationFailure = {
  ok: false;
  failedStage: StageName;
  code: string;
  message: string;
  retryable: boolean;
};
```

규칙:

- 서버 내부 자동 재시도는 수행하지 않는다.
- `retryable`은 클라이언트 재요청 가능성만 표현한다.
- 실패 단계 이후 스테이지는 실행하지 않는다.

## 1) Public Convex Contracts

### `api.generate.createBlogFromImage`

Request

```ts
{
  imageUrl: string;
}
```

Preconditions

- 이미지 정확히 1장
- `imageUrl.trim().length > 0`

Success

```ts
{
  ok: true;
  stage: "completed";
  mode: "single";
  postId: Id<"posts">;
  content: string;
  references: Array<{
    postId: Id<"posts">;
    summary: string;
    score: number;
  }>;
}
```

Failure

```ts
GenerationFailure
```

### `api.generate.createBlogReview`

Request

```ts
{
  imageUrls: string[]; // 2~20
  memo?: string;       // trim 후 빈 문자열 제거
  keywords?: string[]; // trim 후 빈 값 제거, 최대 10개
}
```

Success

```ts
{
  ok: true;
  stage: "completed";
  mode: "review";
  postId: Id<"posts">;
  content: string;
  intro: string;
  outro: string;
  imageBlocks: Array<{
    url: string;
    caption: string;
  }>;
  references: Array<{
    postId: Id<"posts">;
    summary: string;
    score: number;
  }>;
}
```

Failure

```ts
GenerationFailure
```

리뷰 추가 계약:

- `intro/outro/imageBlocks`는 항상 존재해야 한다.
- `imageBlocks.length === imageUrls.length`
- `captions` 길이가 부족하면 누락 인덱스를 빈 문자열로 채워 `imageBlocks.length === imageUrls.length`를 유지한다.

### `api.posts.createPost` / `api.posts.updatePost`

- 저장/수정 직후 `summaryStatus = "pending"`으로 재설정
- `internal.posts.generateSummary`를 비동기 예약
- 기존 실패 요청의 중간 산출물 재사용 금지

## 2) Internal Stage Contracts

### `style-profile-preparation`

입력: `userId`

성공:

```ts
{
  ok: true;
  styleProfile: {
    openingMode: "off" | "preferred" | "strict";
    fixedOpening?: string;
    openerPatterns: Array<{ text: string; repeatRate: number }>;
    toneKeywords: string[];
    confidence: number;
  };
}
```

정책:

- 조회 실패/프로필 없음은 `openingMode = "off"`로 폴백
- `openingMode = "strict"`인데 `fixedOpening`이 비어 있으면 실패 대신 `openingMode = "off"`로 폴백

### `image-analysis`

입력: `{ imageUrls, mode }`

성공:

```ts
{
  ok: true;
  observations: Array<{
    url: string;
    observation: string;
    position: number;
  }>;
}
```

실패 조건:

- 단일 이미지 관찰 결과 비어 있음
- 다중 이미지 중 하나라도 실패(부분 성공 금지)

### `rag-context`

입력: `{ userId, observations }`

성공:

```ts
{
  ok: true;
  queryText: string;
  references: Array<{
    postId: Id<"posts">;
    summary: string;
    score: number;
  }>;
  selectionReason: string;
}
```

실패 조건:

- 질의 텍스트 생성 실패
- 참조 가능한 요약 부족(기본 최소 3개)
- 벡터 검색/조회 오류

### `final-draft` (single/review)

단일 성공:

```ts
{
  ok: true;
  content: string;
}
```

리뷰 성공:

```ts
{
  ok: true;
  content: string;
  intro: string;
  outro: string;
  imageBlocks: Array<{ url: string; caption: string }>;
}
```

실패 조건:

- 빈 응답 또는 파싱 실패
- 단일 글: 형식 위반, 길이 정책 위반, `openingMode = "strict"`이고 `fixedOpening`이 존재할 때 시작문 위반
- 리뷰 글: `intro/outro/captions`가 모두 비어 있을 때만 `DRAFT_EMPTY` 실패

길이 계산 규칙:

- 모든 텍스트는 trim 후 JavaScript `string.length`로 계산

### `internal.posts.generateSummary`

입력:

```ts
{
  postId: Id<"posts">;
  content: string;
}
```

후속 동작:

- 성공 시 `summary`, `embedding`, `summaryStatus="ready"` 저장
- 실패 시 `summaryStatus="failed"`, `summaryError` 저장

## 3) Failure Code Baseline

| Stage | 대표 코드 예시 | Retryable |
|---|---|---|
| `summary-preparation` | `INVALID_IMAGE_COUNT`, `INVALID_IMAGE_URL`, `UNAUTHENTICATED` | false |
| `style-profile-preparation` | `STYLE_PROFILE_STRICT_OPENING_MISSING` | false |
| `image-analysis` | `IMAGE_ANALYSIS_EMPTY`, `IMAGE_ANALYSIS_PARTIAL_FAILED` | true |
| `rag-context` | `RAG_NOT_ENOUGH_REFERENCES`, `RAG_BUILD_FAILED` | false/true |
| `final-draft` | `DRAFT_PARSE_FAILED`, `DRAFT_FORMAT_VIOLATION`, `DRAFT_TOO_LONG`, `DRAFT_EMPTY` | true |

## 4) Frontend Type Impact

- [`src/types/post.ts`](../../../src/types/post.ts)는 `GenerationFailure` 유니온을 계속 유지해야 한다.
- [`src/app/(main)/generate/page.tsx`](../../../src/app/(main)/generate/page.tsx)는 `failedStage`/`retryable`에 따라 reset 또는 업로드 상태 복원을 분기해야 한다.
