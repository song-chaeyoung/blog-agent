# Tasks: 다중 이미지 리뷰 캡션 불일치 소프트 처리 (축소 범위)

**Input**: `/specs/001-staged-ai-generation/` 설계 문서  
**Scope**: 전체 재설계가 아니라 `createBlogReview`의 **캡션 수 불일치 시 노출 유지**만 대상으로 합니다.

**Tests**: 캡션 수 불일치가 실패가 아닌 보정 성공 경로로 동작하도록 테스트를 고정합니다.

## Format: `[ID] [P?] [Story] Description`

- `[P]`: 병렬 가능 태스크
- `[Story]`: 사용자 스토리 태스크는 `[US1]` 사용
- 모든 태스크는 정확한 파일 경로 포함

## Phase 1: Setup (Scope Lock)

**Purpose**: 작업 범위를 캡션 불일치 소프트 처리로 고정합니다.

- [ ] T001 캡션 불일치 시 실패 반환을 제거하도록 `specs/001-staged-ai-generation/spec.md`와 `specs/001-staged-ai-generation/contracts/generation-workflow.md`를 정리한다
- [ ] T002 [P] 테스트 시나리오를 소프트 처리 기준으로 바꾸도록 `specs/001-staged-ai-generation/quickstart.md`를 정리한다

---

## Phase 2: Foundational (Blocking)

**Purpose**: 구현 기준과 테스트 진입점을 고정합니다.

- [ ] T003 `captions.length !== observations.length`일 때 조기 실패 대신 경고 로그와 빈 캡션 보정을 적용하도록 `convex/generateDraft.ts`를 확정한다
- [ ] T004 [P] 캡션 수 불일치 시 성공/보정 경로를 `tests/contract/draft-format.contract.test.ts`에 반영한다

**Checkpoint**: 캡션 수 불일치 소프트 처리 계약이 코드와 테스트 양쪽에 명확히 고정됩니다.

---

## Phase 3: User Story 1 - 캡션 불일치 노출 유지 (Priority: P1)

**Goal**: 리뷰 생성에서 캡션 수가 이미지 수와 달라도 `final-draft` 실패로 중단하지 않고 결과를 노출·저장하도록 보장합니다.

**Independent Test**: 다중 이미지 요청에서 캡션 수를 다르게 주입했을 때 성공 응답이 반환되고 `imageBlocks.length === imageUrls.length`가 유지되며 누락 인덱스가 빈 캡션으로 보정되면 통과입니다.

### Tests for User Story 1 (MANDATORY)

- [ ] T005 [P] [US1] 캡션 수 불일치 보정 성공 통합 테스트를 `tests/integration/generation-failure.integration.test.ts`에 추가/정비한다

### Implementation for User Story 1

- [ ] T006 [US1] 캡션 수 불일치 시 조기 반환이 제거되고 보정 후 저장 경로로 진행되도록 `convex/generateDraft.ts`와 `convex/generate.ts` 흐름을 점검한다
- [ ] T007 [US1] 보정된 빈 캡션이 결과 화면에서 그대로 편집 가능하게 표시되는지 `src/app/(main)/generate/page.tsx`를 점검한다

**Checkpoint**: 캡션 수 불일치 요청이 실패 없이 결과 노출·저장됩니다.

---

## Phase 4: Polish & Verification

**Purpose**: 최소 범위 변경을 검증하고 마무리합니다.

- [ ] T008 [P] 최종 태스크/계약/코드 일치 여부를 `specs/001-staged-ai-generation/tasks.md`, `specs/001-staged-ai-generation/contracts/generation-workflow.md`, `convex/generateDraft.ts`에서 점검한다
- [ ] T009 `bun run lint`와 대상 테스트(`tests/contract/draft-format.contract.test.ts`, `tests/integration/generation-failure.integration.test.ts`)를 실행해 통과를 확인한다

---

## Dependencies & Execution Order

### Phase Dependencies

- Phase 1 → Phase 2 → Phase 3 → Phase 4 순서로 진행합니다.
- 캡션 불일치 소프트 처리는 Phase 2 완료 전에는 구현하지 않습니다.

### User Story Dependencies

- US1은 Foundational 완료 후 바로 시작 가능하며 다른 스토리 의존성이 없습니다.

### Within User Story 1

- 테스트(T005) 먼저 작성
- 구현(T006) 적용
- UI 점검(T007)으로 마무리

## Parallel Opportunities

- `T002`, `T004`, `T005`, `T008`은 병렬 가능

---

## Parallel Example: User Story 1

```bash
Task: "tests/contract/draft-format.contract.test.ts에 캡션 수 불일치 보정 성공 테스트 반영"
Task: "tests/integration/generation-failure.integration.test.ts에 캡션 수 불일치 보정 통합 테스트 반영"
```

---

## Implementation Strategy

### MVP First

1. Phase 1~2로 범위와 계약 고정
2. Phase 3에서 캡션 불일치 소프트 처리만 구현
3. Phase 4에서 lint/대상 테스트 통과 확인

### Incremental Delivery

1. 계약/문서 정리
2. 테스트 갱신
3. 코드 보강
4. 검증 완료 후 종료
