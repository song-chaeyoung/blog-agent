# Data Model: 단계 분리형 AI 블로그 생성 재정의

## 목적

핵심 모델링 목표는 다음 두 가지입니다.

1. 생성 파이프라인의 단계별 성공/실패를 계약으로 명확히 표현한다.
2. 과거 글 재사용 기준을 원문에서 `summary` 중심으로 전환한다.

## 영속 엔티티

### 1) `users`

| 필드 | 타입 | 설명 |
|---|---|---|
| `_id` | `Id<"users">` | 사용자 문서 ID |
| `tokenIdentifier` | `string` | Clerk identity 고유값 |
| `name` | `string` | 사용자명 |
| `email` | `string` | 이메일 |
| `imageUrl` | `string?` | 프로필 이미지 |
| `provider` | `string?` | 인증 제공자 |

인덱스: `by_token(tokenIdentifier)`

### 2) `styleProfiles`

| 필드 | 타입 | 설명 |
|---|---|---|
| `_id` | `Id<"styleProfiles">` | 프로필 문서 ID |
| `userId` | `Id<"users">` | 소유 사용자 |
| `openingMode` | `"off" \| "preferred" \| "strict"` | 도입구 정책 |
| `fixedOpening` | `string?` | strict/preferred에서 사용할 고정 시작문 |
| `openerPatterns` | `Array<{ text, repeatRate, occurrences, sampleSize, lastSeenAt }>` | 반복 시작문 통계 |
| `toneKeywords` | `string[]?` | 문체 키워드 |
| `confidence` | `number` | 추정 신뢰도 |
| `updatedAt` | `number` | 수정 시각(ms) |

인덱스: `by_user(userId)`

### 3) `posts`

| 필드 | 타입 | 설명 |
|---|---|---|
| `_id` | `Id<"posts">` | 게시글 문서 ID |
| `userId` | `Id<"users">` | 소유 사용자 |
| `content` | `string` | 저장 본문 |
| `summary` | `string?` | RAG 참조용 요약 |
| `summaryStatus` | `"pending" \| "ready" \| "failed"?` | 요약 생성 상태 |
| `summaryError` | `string?` | 요약 생성 실패 사유 |
| `summaryUpdatedAt` | `number?` | 요약 갱신 시각 |
| `embedding` | `float64[]?` | `summary` 기반 벡터 |
| `imageUrl` | `string?` | 단일 생성 대표 이미지 |
| `imageBlocks` | `Array<{ url: string; caption: string }>?` | 리뷰용 이미지-캡션 |
| `intro` | `string?` | 리뷰 도입부 |
| `outro` | `string?` | 리뷰 마무리 |
| `references` | `Array<{ postId, summary, score }>?` | 생성 시 사용한 요약 참조 |

벡터 인덱스: `by_embedding` (`dimensions: 1536`, `filterFields: ["userId"]`)

## 런타임 계약 엔티티

### 4) `ImageObservation`

| 필드 | 타입 | 설명 |
|---|---|---|
| `url` | `string` | 입력 이미지 URL |
| `observation` | `string` | 이미지 관찰 텍스트 |
| `position` | `number` | 입력 순서(0-based) |

### 5) `ReferenceSummary`

| 필드 | 타입 | 설명 |
|---|---|---|
| `postId` | `Id<"posts">` | 참조 게시글 ID |
| `summary` | `string` | 참조 요약 |
| `score` | `number` | 유사도 점수 |

### 6) `GenerationResult` (공개 API 반환)

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

type SingleSuccess = {
  ok: true;
  stage: "completed";
  mode: "single";
  postId: Id<"posts">;
  content: string;
  references: ReferenceSummary[];
};

type ReviewSuccess = {
  ok: true;
  stage: "completed";
  mode: "review";
  postId: Id<"posts">;
  content: string;
  intro: string;
  outro: string;
  imageBlocks: Array<{ url: string; caption: string }>;
  references: ReferenceSummary[];
};
```

### 7) `ReviewDraftPayload` (AI 응답 파싱 대상)

```ts
type ReviewDraftPayload = {
  intro: string;
  captions: string[];
  outro: string;
};
```

필수 규칙:

- `intro/outro/captions`가 누락된 경우 빈 값으로 보정하고, 세 필드가 모두 비어 있을 때만 실패
- `captions.length`가 `imageUrls.length`보다 작으면 누락 인덱스를 빈 캡션으로 채운다
- `captions[i]`는 입력 `images[i]` 순서에 맞춰 순차 매핑한다
- 각 caption은 trim 후 빈 문자열이어도 허용한다
- `count/order/empty` 이슈는 실패 코드 대신 경고 로그로만 기록한다

## 관계

- `User 1 : N Post`
- `User 1 : 0..1 StyleProfile`
- `Generation Request 1 : N ImageObservation`
- `Generation Request 1 : N ReferenceSummary`

## 상태 전이

### `posts.summaryStatus`

```text
undefined/legacy
  -> pending (create/update/backfill 예약)
  -> ready   (summary + embedding 생성 성공)
  -> failed  (summary 또는 embedding 생성 실패)
  -> pending (재시도/backfill)
```

### 생성 요청 단계

```text
summary-preparation
  -> style-profile-preparation
  -> image-analysis
  -> rag-context
  -> final-draft
  -> completed

any stage failed
  -> stopped (후속 단계 실행 금지)
```

## 검증 규칙

- 벡터 검색은 항상 `userId` 필터를 포함해야 한다.
- `summary` 없는 게시글은 참조 후보에서 제외한다.
- RAG 참조 수는 기본 3개 이상이어야 한다.
- 길이 정책은 trim 이후 JavaScript `string.length`로 계산한다.
- `openingMode = "strict"`면 첫 줄이 `fixedOpening`과 정확히 일치해야 한다.

## 마이그레이션/백필

- 초기 배포에서 자동 일괄 백필은 수행하지 않는다.
- 필요한 경우 `postSummaries.backfillSummary` / `postSummaries.backfillMissingSummaries`로 수동 실행한다.
- 백필 전까지 `summary`가 없는 글은 생성 참조 대상에서 제외한다.
