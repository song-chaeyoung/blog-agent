# Contract: 단계 분리형 생성 워크플로

## 공통 응답 규약

모든 생성 API는 성공/실패를 판별 가능한 유니온으로 반환한다.

```ts
type StageName =
  | "summary-preparation"
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

- 서버는 실패 스테이지에 대해 내부 자동 재시도를 수행하지 않는다.
- `retryable = true`는 클라이언트가 동일 요청을 다시 시도할 수 있음을 뜻하고, `retryable = false`는 입력/계약 위반 등 비재시도성 실패를 뜻한다.

## 1. Public Convex Contracts

### `api.generate.createBlogFromImage`

**목적**: 단일 이미지 기반 새 글 생성

**Request**

```ts
{
  imageUrl: string;
}
```

**Preconditions**

- `/generate`에서 이미지 1장만 선택된 경우에만 호출한다.
- `imageUrl`은 trim 후 비어 있으면 안 된다.

**Success Response**

```ts
{
  ok: true;
  stage: "completed";
  postId: Id<"posts">;
  content: string;
  references: Array<{
    postId: Id<"posts">;
    summary: string;
    score: number;
  }>;
}
```

**Failure Response**

```ts
GenerationFailure
```

### `api.generate.createBlogReview`

**목적**: 다중 이미지 기반 리뷰 글 생성

**Request**

```ts
{
  imageUrls: string[];
  memo?: string;
  keywords?: string[];
}
```

**Preconditions**

- `/generate`에서 이미지가 2~20장 선택된 경우에만 호출한다.
- `imageUrls`의 각 항목은 trim 후 비어 있으면 안 된다.
- `memo`는 trim 후 빈 문자열이면 제거한다.
- `keywords`는 trim 후 빈 값을 제거하고 최대 10개까지만 허용한다.

**Success Response**

```ts
{
  ok: true;
  stage: "completed";
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

**Failure Response**

```ts
GenerationFailure
```

### `api.posts.createPost`

**목적**: 일반 게시글 저장 후 `summary` 생성 예약

**Request**

```ts
{
  content: string;
}
```

**Response**

```ts
Id<"posts">
```

**후속 보장**

- 저장 직후 `summaryStatus = "pending"`으로 전환
- 비동기 `generateSummary` 작업 예약

### `api.posts.updatePost`

**목적**: 게시글 수정 후 `summary` 재생성 예약

**Request**

```ts
{
  postId: Id<"posts">;
  content: string;
  imageBlocks?: Array<{ url: string; caption: string }>;
  intro?: string;
  outro?: string;
}
```

**Response**

```ts
void
```

**후속 보장**

- 수정 즉시 `summaryStatus = "pending"` 재설정
- 이전 실패 산출물 재사용 금지

## 2. Internal Stage Contracts

### `internal.posts.generateSummary`

**입력**

```ts
{
  postId: Id<"posts">;
  content: string;
  scheduledBy: "create" | "update" | "backfill";
}
```

**성공 결과**

```ts
{
  ok: true;
  summary: string;
  embedding: number[];
  updatedAt: number;
}
```

**실패 결과**

```ts
{
  ok: false;
  code: "SUMMARY_EMPTY" | "SUMMARY_PARSE_FAILED" | "SUMMARY_EMBED_FAILED";
  message: string;
}
```

### `internal.generate.prepareSummaryCandidates`

**입력**

```ts
{
  userId: Id<"users">;
}
```

**성공 결과**

```ts
{
  ok: true;
  stage: "summary-preparation";
  data: {
    availableSummaries: Array<{
      postId: Id<"posts">;
      summary: string;
      embedding: number[];
    }>;
  };
}
```

**실패 조건**

- 사용자의 준비된 `summary`가 하나도 없음

### `internal.generate.analyzeImages`

**입력**

```ts
{
  imageUrls: string[];
  mode: "single" | "review";
}
```

**성공 결과**

```ts
{
  ok: true;
  stage: "image-analysis";
  data: {
    observations: Array<{
      url: string;
      observation: string;
      position: number;
    }>;
  };
}
```

**실패 조건**

- 단일 이미지 관찰 결과가 비어 있음
- 다중 이미지 중 하나라도 분석 실패
- JSON/형식 파싱 실패

### `internal.generate.buildRagContext`

**입력**

```ts
{
  userId: Id<"users">;
  observations: Array<{
    url: string;
    observation: string;
    position: number;
  }>;
}
```

**성공 결과**

```ts
{
  ok: true;
  stage: "rag-context";
  data: {
    queryText: string;
    references: Array<{
      postId: Id<"posts">;
      summary: string;
      score: number;
    }>;
    selectionReason: string;
  };
}
```

**실패 조건**

- 참조 가능한 `summary`를 찾지 못함
- 최종 선택된 참고 요약이 기본 임계값 3개 미만
- JSON/형식 파싱 실패

### `internal.generate.composeDraft`

**입력**

```ts
{
  mode: "single" | "review";
  observations: Array<{
    url: string;
    observation: string;
    position: number;
  }>;
  references: Array<{
    postId: Id<"posts">;
    summary: string;
    score: number;
  }>;
  memo?: string;
  keywords?: string[];
}
```

**단일 이미지 성공 결과**

```ts
{
  ok: true;
  stage: "final-draft";
  data: {
    content: string;
  };
}
```

**리뷰 글 성공 결과**

```ts
{
  ok: true;
  stage: "final-draft";
  data: {
    content: string;
    intro: string;
    outro: string;
    imageBlocks: Array<{
      url: string;
      caption: string;
    }>;
  };
}
```

**실패 조건**

- 빈 응답
- JSON/형식 파싱 실패
- 요구된 이미지 수와 캡션 수 불일치

## 3. 프런트 타입 영향

- [`src/types/post.ts`](/C:/Users/adcapsule/Desktop/ts-study/blog-agent/src/types/post.ts)의 `ResultData`는 성공 타입 전용이므로, `GenerationFailure`와 성공 유니온을 받을 수 있게 확장해야 한다.
- [`src/app/(main)/generate/page.tsx`](/C:/Users/adcapsule/Desktop/ts-study/blog-agent/src/app/(main)/generate/page.tsx)는 실패 시 예외 toast 하나만 보여주지 말고 `failedStage`를 해석할 수 있어야 한다.
