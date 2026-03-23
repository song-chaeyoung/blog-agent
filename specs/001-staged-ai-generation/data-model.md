# Data Model: 단계 분리형 AI 블로그 생성 재정의

## 개요

이번 기능의 핵심 데이터 변경은 "원문 기반 재사용"을 "요약 기반 재사용"으로 바꾸는 것이다. 따라서 영속 데이터는 `posts.summary` 계열 필드가 중심이 되고, 생성 파이프라인의 스테이지 결과는 API 계약 객체로 주고받되 필요 최소한만 저장한다.

## 영속 엔티티

### 1. User

기존 `users` 테이블을 유지한다.

| 필드 | 타입 | 설명 |
|---|---|---|
| `_id` | `Id<"users">` | Convex 문서 ID |
| `tokenIdentifier` | `string` | Clerk identity 기준 고유 식별자 |
| `name` | `string` | 표시 이름 |
| `email` | `string` | 사용자 이메일 |
| `imageUrl` | `string?` | 프로필 이미지 |
| `provider` | `string?` | 인증 제공자 |

**인덱스**

- `by_token(tokenIdentifier)`

### 2. Post

기존 `posts` 테이블을 확장한다.

| 필드 | 타입 | 설명 |
|---|---|---|
| `_id` | `Id<"posts">` | Convex 문서 ID |
| `userId` | `Id<"users">` | 글 소유 사용자 |
| `content` | `string` | 최종 저장 본문 |
| `summary` | `string?` | RAG와 문체 참고에 사용하는 축약 요약 |
| `embedding` | `float64[]?` | `summary` 기반 검색 벡터 |
| `summaryStatus` | `"pending" \| "ready" \| "failed"` | 요약 생성 상태 |
| `summaryError` | `string?` | 마지막 요약 생성 실패 사유 |
| `summaryUpdatedAt` | `number?` | 요약 최신화 시각(ms epoch) |
| `imageUrl` | `string?` | 단일 이미지 글의 대표 이미지 |
| `imageBlocks` | `{ url: string; caption: string }[]?` | 리뷰 글의 이미지-캡션 쌍 |
| `intro` | `string?` | 리뷰 글 도입부 |
| `outro` | `string?` | 리뷰 글 마무리 |

**인덱스 / 벡터 인덱스**

- `by_embedding(embedding)` + `filterFields: ["userId"]`
- 필요 시 관리성 강화를 위해 `by_user_summary_status(userId, summaryStatus)` 일반 인덱스 추가

**설계 근거**

- 기존 `embedding` 필드 이름은 유지하되, 의미를 원문 기반 벡터에서 `summary` 기반 벡터로 재정의한다.
- `summaryStatus`와 `summaryError`는 요약 백그라운드 작업의 성공/실패를 사용자가 볼 수 있는 형태로 남기기 위한 최소 상태다.

## 런타임 계약 엔티티

### 3. Summary Generation Job

별도 테이블을 만들지 않고 `posts` 문서 상태로 표현한다.

| 필드 | 타입 | 설명 |
|---|---|---|
| `postId` | `Id<"posts">` | 요약 대상 게시글 |
| `status` | `"pending" \| "ready" \| "failed"` | 현재 작업 상태 |
| `error` | `string?` | 실패 시 원인 |
| `scheduledBy` | `"create" \| "update" \| "backfill"` | 예약 계기 |

### 4. Image Observation

| 필드 | 타입 | 설명 |
|---|---|---|
| `url` | `string` | 입력 이미지 URL |
| `observation` | `string` | 이미지에서 추출한 구조화/서술형 관찰 결과 |
| `position` | `number` | 다중 이미지 순서 |

### 5. RAG Context Bundle

| 필드 | 타입 | 설명 |
|---|---|---|
| `queryText` | `string` | 이미지 분석을 바탕으로 구성한 검색 질의 |
| `references` | `ReferenceSummary[]` | 선택된 과거 글 요약 목록 |
| `selectionReason` | `string` | 참고 묶음의 선택 근거 |

`ReferenceSummary`

| 필드 | 타입 | 설명 |
|---|---|---|
| `postId` | `Id<"posts">` | 참조 게시글 |
| `summary` | `string` | 저장된 요약 |
| `score` | `number` | 유사도 점수 |

### 6. Generation Stage Result

모든 스테이지가 공통으로 따르는 반환 규약이다.

| 필드 | 타입 | 설명 |
|---|---|---|
| `ok` | `boolean` | 성공 여부 |
| `stage` | `"summary-preparation" \| "image-analysis" \| "rag-context" \| "final-draft"` | 실행 단계 |
| `code` | `string?` | 실패 코드 |
| `message` | `string` | 사용자에게 보여줄 메시지 |
| `retryable` | `boolean` | 클라이언트 재요청 가능 여부 (`true`여도 서버 내부 자동 재시도는 수행하지 않음) |
| `data` | `unknown` | 성공 시 단계 산출물 |

## 관계

- `User 1 : N Post`
- `Post 1 : 0..1 Summary Generation Job 상태`
- `Generation Request 1 : N Image Observation`
- `Generation Request 1 : 1 RAG Context Bundle`

## 상태 전이

### Post 요약 상태

```text
없음/legacy
  -> pending   (글 생성 또는 수정 직후)
  -> ready     (요약 + 벡터 생성 성공)
  -> failed    (요약 또는 임베딩 생성 실패)
  -> pending   (사용자 수정 또는 재백필)
```

### 생성 요청 상태

```text
requested
  -> summary-preparation succeeded
  -> image-analysis succeeded
  -> rag-context succeeded
  -> final-draft succeeded
  -> saved

requested
  -> any stage failed
  -> stopped
```

## 검증 규칙

- `summaryStatus = "ready"`이면 `summary`와 `embedding`이 모두 존재해야 한다.
- `summaryStatus = "failed"`이면 `summaryError`가 비어 있으면 안 된다.
- 다중 이미지 요청은 입력 배열의 모든 항목이 성공적으로 분석되어야 다음 단계로 넘어간다.
- `summary`가 없는 게시글은 RAG 참조 후보에서 제외된다.
- `rag-context` 성공 결과는 최종 참조 요약이 기본 임계값 3개 이상이어야 한다(임계값은 테스트 결과에 따라 3개 이상 상향 가능).
- 벡터 검색은 항상 `userId` 필터를 포함해야 한다.

## 마이그레이션 / 백필 전략

- 기존 게시글은 초기 배포 직후 `summaryStatus = "pending"` 또는 `undefined` 상태일 수 있다.
- 백필이 완료되기 전까지 `summary` 없는 게시글은 생성 참조 대상에서 제외한다.
- 사용자 수정이나 별도 재처리 mutation을 통해 점진적으로 `summary`를 채운다.
