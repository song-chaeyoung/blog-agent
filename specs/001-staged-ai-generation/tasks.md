# Tasks: 단계 분리형 AI 블로그 생성 재정의

**Input**: `/specs/001-staged-ai-generation/`의 설계 문서  
**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/generation-workflow.md`

**Tests**: 테스트 태스크를 포함합니다. 최소 `bun run lint` 1회와 계약/통합 테스트를 함께 계획합니다.

**Organization**: 각 태스크는 사용자 스토리별로 묶어 독립 구현과 독립 검증이 가능하도록 구성합니다.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 병렬 작업 가능
- **[Story]**: 사용자 스토리 라벨 (`[US1]`, `[US2]`, `[US3]`)
- 모든 태스크는 정확한 파일 경로를 포함합니다.

## Phase 1: Setup (공통 개발 기반)

**Purpose**: 테스트 러너와 검증 실행 기반을 추가합니다.

- [X] T001 테스트 스크립트와 의존성을 `package.json`에 추가한다
- [X] T002 [P] Vitest 실행 설정을 `vitest.config.ts`에 추가한다
- [X] T003 [P] 공통 테스트 초기화 코드를 `tests/setup.ts`에 추가한다
- [X] T004 [P] Convex/OpenAI 목 헬퍼를 `tests/helpers/generationTestUtils.ts`에 추가한다

---

## Phase 2: Foundational (모든 스토리를 막는 기반 작업)

**Purpose**: 스키마, 공통 타입, 스테이지 모듈 골격을 먼저 정리합니다.

**⚠️ CRITICAL**: 이 단계가 끝나기 전에는 어떤 사용자 스토리도 시작하지 않습니다.

- [X] T005 `summary` 계열 필드와 벡터 인덱스를 `convex/schema.ts`에 추가한다
- [X] T006 [P] 스테이지 결과/실패 유니온 타입을 `convex/generateTypes.ts`에 정의한다
- [X] T007 [P] 생성 스테이지 상수와 품질 기준을 `convex/constants.ts`에 정리한다
- [X] T008 [P] 생성 성공/실패 프런트 타입 골격을 `src/types/post.ts`에 정의한다
- [X] T009 요약 후보 조회와 사용자 해석 공통 쿼리를 `convex/generateHelpers.ts`에 정리한다
- [X] T010 스테이지별 내부 함수 골격을 `convex/generateStages.ts`에 추가한다
- [X] T011 [P] 생성 요청 preflight 입력 검증 유틸을 `convex/generateValidation.ts`에 구현한다
- [X] T012 [P] Clerk identity 해석과 `userId` 범위 가드를 `convex/generateAuth.ts`에 구현한다

**Checkpoint**: 공통 스키마와 타입이 준비되어 사용자 스토리 구현을 시작할 수 있습니다.

---

## Phase 3: User Story 1 - 이미지 기반 새 글 생성 품질 개선 (Priority: P1) 🎯 MVP

**Goal**: 이미지 관찰 결과와 과거 글 `summary`를 함께 반영한 새 글/리뷰 글 생성 경로를 완성합니다.

**Independent Test**: 단일 이미지와 다중 이미지 요청이 모두 `summary` 기반 참고 맥락을 사용해 성공 결과를 반환하면 독립적으로 검증할 수 있습니다.

### Tests for User Story 1 (MANDATORY) ⚠️

> **NOTE**: 이 테스트들은 구현 전에 먼저 작성하고, 초기에는 실패해야 합니다.

- [X] T013 [P] [US1] 단일/다중 생성 성공 응답 계약 테스트를 `tests/contract/generation-success.contract.test.ts`에 작성한다
- [X] T014 [P] [US1] `summary` 기반 새 글 생성 통합 테스트를 `tests/integration/generation-success.integration.test.ts`에 작성한다

### Implementation for User Story 1

- [X] T015 [P] [US1] 이미지 분석 스테이지를 `convex/generateStages.ts`에 구현한다
- [X] T016 [P] [US1] `summary` 전용 RAG 조회 로직과 “최종 참조 기본 3개 이상(테스트로 3개 이상 상향 가능)” 기준을 `convex/generateRag.ts`에 구현한다
- [X] T017 [P] [US1] 최종 초안 합성 스테이지를 `convex/generateDraft.ts`에 구현한다
- [X] T018 [US1] `createBlogFromImage`와 `createBlogReview`가 `internalAction`/`internalQuery`/`internalMutation` 스테이지를 오케스트레이션하도록 `convex/generate.ts`에 리팩터링한다
- [X] T019 [US1] 생성 결과 저장 헬퍼를 `convex/generateHelpers.ts`에 맞게 갱신한다
- [X] T020 [US1] `/generate` 화면에서 이미지 1장은 단일 생성, 2~20장은 리뷰 생성으로 분기하도록 `src/app/(main)/generate/page.tsx`에 반영한다
- [X] T021 [US1] 성공 응답 기반 편집 상태 관리를 `src/hooks/useResultEditor.ts`에 반영한다

**Checkpoint**: User Story 1이 끝나면 이미지 기반 생성 결과를 독립적으로 성공 검증할 수 있어야 합니다.

---

## Phase 4: User Story 2 - 단계별 실패 지점 확인 (Priority: P1)

**Goal**: 실패 시 `failedStage`, `code`, `message`를 반환하고 이후 단계를 중단하는 실패 계약을 완성합니다.

**Independent Test**: 이미지 분석 실패, RAG 실패, 파싱 실패를 각각 유도했을 때 응답이 해당 단계에서 즉시 종료되면 독립적으로 검증할 수 있습니다.

### Tests for User Story 2 (MANDATORY) ⚠️

- [X] T022 [P] [US2] 단계 실패 응답 계약 테스트를 `tests/contract/generation-failure.contract.test.ts`에 작성한다
- [X] T023 [P] [US2] 조기 중단 동작 통합 테스트를 `tests/integration/generation-failure.integration.test.ts`에 작성한다

### Implementation for User Story 2

- [X] T024 [P] [US2] 실패 응답 팩토리와 `failedStage`/`code`/`retryable` 매핑을 `convex/generateTypes.ts`에 보강한다
- [X] T025 [P] [US2] 빈 응답, 파싱 실패, 다중 이미지 부분 실패, 입력 검증 실패 가드를 `convex/generateStages.ts`와 `convex/generateValidation.ts`에 구현한다
- [X] T026 [US2] 스테이지 실패 즉시 반환, 서버 내부 자동 재시도 금지, 실패 요청 중간 산출물 재사용 금지 로직을 `convex/generate.ts`에 반영한다
- [X] T027 [US2] 단계명 기반 실패 표시 UI를 `src/app/(main)/generate/page.tsx`에 구현한다
- [X] T028 [US2] 실패 유니온 분기를 반영한 결과 타입을 `src/types/post.ts`에 확정한다

**Checkpoint**: User Story 2가 끝나면 실패 요청이 어느 단계에서 멈췄는지 사용자와 개발자가 모두 확인할 수 있어야 합니다.

---

## Phase 5: User Story 3 - 요약 기반 과거 글 재사용 (Priority: P2)

**Goal**: 게시글 저장/수정 후 `summary`를 비동기 생성·갱신하고, 생성 요청이 원문 대신 `summary`만 사용하도록 완성합니다.

**Independent Test**: 글 저장 또는 수정 후 `summaryStatus`가 갱신되고, 생성 요청이 `summary` 없는 글을 제외한 채 동작하면 독립적으로 검증할 수 있습니다.

### Tests for User Story 3 (MANDATORY) ⚠️

- [X] T029 [P] [US3] `summary` 상태 전이 계약 테스트를 `tests/contract/post-summary.contract.test.ts`에 작성한다
- [X] T030 [P] [US3] 저장/수정 후 `summary` 비동기 갱신 통합 테스트를 `tests/integration/post-summary.integration.test.ts`에 작성한다

### Implementation for User Story 3

- [X] T031 [P] [US3] 자동 일괄 배치 없이 수동 `summary` 생성/재시도/backfill mutation을 `convex/postSummaries.ts`에 구현한다
- [X] T032 [US3] 저장/수정 시 `summary` 작업 예약을 `convex/posts.ts`에 반영한다
- [X] T033 [P] [US3] `summary` 없는 게시글 제외 및 `embedding`(summary 기반) 검색을 `convex/generateRag.ts`에 반영한다
- [X] T034 [US3] 게시글 조회/편집 시 `summary` 상태 노출을 `convex/posts.ts`에 반영한다
- [X] T035 [US3] 편집 후 `summary` 재생성 흐름을 `src/hooks/usePostEditor.ts`에 반영한다

**Checkpoint**: User Story 3이 끝나면 원문 기반 재사용이 아니라 `summary` 기반 재사용 경로가 완성되어야 합니다.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: 전 스토리에 걸친 마무리와 검증을 수행합니다.

- [X] T036 [P] 빠른 검증 절차, 단일/다중 이미지 시나리오, 10건 블라인드 비교 절차를 `specs/001-staged-ai-generation/quickstart.md`에 최종 반영한다
- [X] T037 [P] 상수/스키마/타입 동기화 최종 점검을 `convex/schema.ts`에 반영한다
- [X] T038 전역 생성 상수와 임계값 정리를 `convex/constants.ts`에 마무리한다
- [X] T039 `bun run lint` 결과를 확인하고 필요한 정리를 `package.json`에 반영한다

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: 즉시 시작 가능
- **Phase 2 (Foundational)**: Setup 완료 후 시작, 모든 사용자 스토리를 막는 선행 단계
- **Phase 3 (US1)**: Foundational 완료 후 시작 가능, MVP 우선순위
- **Phase 4 (US2)**: Foundational 완료 후 시작 가능하지만 `convex/generate.ts`, `convex/generateValidation.ts`, `src/app/(main)/generate/page.tsx`를 함께 다루므로 US1 이후 진행이 가장 안전
- **Phase 5 (US3)**: Foundational 완료 후 시작 가능, `summary` 생성과 재사용 완성을 위해 US1과 병합 순서를 조정하며 진행
- **Phase 6 (Polish)**: 모든 목표 사용자 스토리 완료 후 진행

### User Story Dependencies

- **US1 (P1)**: Foundational 이후 바로 시작 가능, MVP
- **US2 (P1)**: 생성 파이프라인 골격은 US1 결과를 활용하므로 구현 순서는 US1 다음이 적절
- **US3 (P2)**: 독립 구현 가능하지만 `summary`를 실제 소비하는 경로는 US1과 연결되므로 병합 시점은 US1 이후가 안전

### Within Each User Story

- 테스트를 먼저 작성하고 실패를 확인합니다.
- 데이터/스테이지 로직을 먼저 구현합니다.
- 오케스트레이션과 UI를 마지막에 연결합니다.
- 각 스토리 완료 후 quickstart 기준으로 독립 검증합니다.

### Parallel Opportunities

- Phase 1의 `T002`, `T003`, `T004`는 병렬 가능
- Phase 2의 `T006`, `T007`, `T008`, `T011`, `T012`는 병렬 가능
- US1의 `T013`, `T014`와 `T015`, `T016`, `T017`은 병렬 가능
- US2의 `T022`, `T023`와 `T024`, `T025`는 병렬 가능
- US3의 `T029`, `T030`와 `T031`, `T033`은 병렬 가능

---

## Parallel Example: User Story 1

```bash
# 테스트를 병렬로 작성:
Task: "단일/다중 생성 성공 응답 계약 테스트를 tests/contract/generation-success.contract.test.ts에 작성한다"
Task: "summary 기반 새 글 생성 통합 테스트를 tests/integration/generation-success.integration.test.ts에 작성한다"

# 스테이지 로직을 병렬로 구현:
Task: "이미지 분석 스테이지를 convex/generateStages.ts에 구현한다"
Task: "summary 전용 RAG 조회 로직과 최종 참조 기본 3개 이상(테스트로 상향 가능) 기준을 convex/generateRag.ts에 구현한다"
Task: "최종 초안 합성 스테이지를 convex/generateDraft.ts에 구현한다"
```

---

## Parallel Example: User Story 3

```bash
# summary 작업과 소비 경로를 병렬로 구현:
Task: "자동 일괄 배치 없이 수동 summary 생성/재시도/backfill mutation을 convex/postSummaries.ts에 구현한다"
Task: "summary 없는 게시글 제외 및 embedding(summary 기반) 검색을 convex/generateRag.ts에 반영한다"
```

---

## Implementation Strategy

### MVP First (US1 우선)

1. Phase 1 Setup 완료
2. Phase 2 Foundational 완료
3. Phase 3 US1 완료
4. quickstart의 성공 시나리오로 독립 검증
5. 필요하면 이 시점에 첫 데모 진행

### Incremental Delivery

1. Setup + Foundational로 공통 기반 확정
2. US1 추가 후 이미지 기반 생성 성공 경로 배포 가능 상태 확보
3. US2 추가 후 단계 실패 가시성과 조기 중단 계약 강화
4. US3 추가 후 `summary` 비동기 생성과 장기 재사용 완성
5. Polish에서 문서와 상수 동기화 마무리

### Parallel Team Strategy

1. 한 명은 Setup/Foundational을 마무리합니다.
2. 이후 병렬 분담 시:
   - 개발자 A: US1 스테이지 구현
   - 개발자 B: US2 실패 계약/테스트
   - 개발자 C: US3 `summary` 작업과 backfill
3. 다만 `convex/generate.ts`, `src/app/(main)/generate/page.tsx`, `convex/posts.ts`는 충돌 가능성이 높아 순차 병합이 안전합니다.

---

## Notes

- `[P]` 태스크만 병렬 수행 대상으로 간주합니다.
- 각 사용자 스토리는 자체 테스트와 체크포인트를 가집니다.
- `summary` 관련 변경은 `convex/schema.ts`, `convex/posts.ts`, `convex/postSummaries.ts`, `convex/generateRag.ts`, `src/types/post.ts`를 함께 검토해야 합니다.
- 구현 중에는 raw `content` 기반 RAG가 다시 섞이지 않도록 계약 문서와 데이터 모델을 기준으로 검토합니다.
