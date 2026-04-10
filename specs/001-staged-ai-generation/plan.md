# Implementation Plan: 단계 분리형 AI 블로그 생성 재정의

**Branch**: `001-staged-ai-generation` | **Date**: 2026-04-10 | **Spec**: [spec.md](/C:/Users/adcapsule/Desktop/ts-study/blog-agent/specs/001-staged-ai-generation/spec.md)
**Input**: Feature specification from `/specs/001-staged-ai-generation/spec.md`

## Summary

`/generate`의 단일/다중 이미지 생성 흐름을 단계별 파이프라인으로 고정하고, 실패 시 즉시 중단·반환되는 계약을 명확히 정의합니다. 과거 글 참조는 원문이 아니라 `summary + embedding` 기반으로 제한하며, 사용자별 `styleProfile`을 별도 준비 단계로 반영해 개인화와 안정성을 동시에 확보합니다.

## Technical Context

**Language/Version**: TypeScript 5.x (Next.js 16 App Router + React 19)  
**Primary Dependencies**: Convex 1.x, Clerk, OpenAI SDK 6.x, Tailwind CSS v4, Sonner  
**Storage**: Convex Database (`users`, `posts`, `styleProfiles`), Convex Storage(이미지), Convex Vector Index(`posts.by_embedding`)  
**Testing**: Vitest (`tests/unit`, `tests/contract`, `tests/integration`) + ESLint (`bun run lint`)  
**Target Platform**: Web app(Next.js client) + Convex serverless backend  
**Project Type**: 단일 리포지토리 웹 애플리케이션 (frontend + Convex functions)  
**Performance Goals**: SC-001/SC-003 준수(요청의 95% 이상에서 종료 스테이지 식별 가능, 실패 시 후속 스테이지 0% 실행)  
**Constraints**: `gpt-4o-mini` 고정, 서버 내부 자동 재시도 금지, 실패 응답 `retryable` 포함, 다중 이미지(2~20) 부분 성공 금지, RAG 최소 참조 3개  
**Scale/Scope**: 사용자별 격리(`userId`)를 전제로 단일 요청당 이미지 1~20장, RAG 기본 상위 3개 요약 참조

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### Pre-Design Gate

- [x] 인증 경계가 명시되었는가?  
  근거: [`convex/generateAuth.ts`](/C:/Users/adcapsule/Desktop/ts-study/blog-agent/convex/generateAuth.ts), [`convex/posts.ts`](/C:/Users/adcapsule/Desktop/ts-study/blog-agent/convex/posts.ts)
- [x] 사용자 데이터 격리 규칙이 설계에 반영되었는가?  
  근거: [`convex/generateRag.ts`](/C:/Users/adcapsule/Desktop/ts-study/blog-agent/convex/generateRag.ts)의 `filter: q.eq("userId", userId)`, [`convex/schema.ts`](/C:/Users/adcapsule/Desktop/ts-study/blog-agent/convex/schema.ts)의 vectorIndex `filterFields`
- [x] 입력/업로드 검증 규칙이 정의되었는가?  
  근거: [`convex/generateValidation.ts`](/C:/Users/adcapsule/Desktop/ts-study/blog-agent/convex/generateValidation.ts), [`convex/constants.ts`](/C:/Users/adcapsule/Desktop/ts-study/blog-agent/convex/constants.ts)
- [x] AI 출력 계약이 고정되었는가?  
  근거: [`convex/generateTypes.ts`](/C:/Users/adcapsule/Desktop/ts-study/blog-agent/convex/generateTypes.ts), [`convex/generateDraft.ts`](/C:/Users/adcapsule/Desktop/ts-study/blog-agent/convex/generateDraft.ts)
- [x] 상수/스키마/타입 동기화 대상 파일이 식별되었는가?  
  근거: [`convex/schema.ts`](/C:/Users/adcapsule/Desktop/ts-study/blog-agent/convex/schema.ts), [`convex/constants.ts`](/C:/Users/adcapsule/Desktop/ts-study/blog-agent/convex/constants.ts), [`src/constants.ts`](/C:/Users/adcapsule/Desktop/ts-study/blog-agent/src/constants.ts), [`src/types/post.ts`](/C:/Users/adcapsule/Desktop/ts-study/blog-agent/src/types/post.ts)
- [x] 검증 계획이 포함되었는가?  
  근거: [`tests/contract`](/C:/Users/adcapsule/Desktop/ts-study/blog-agent/tests/contract), [`tests/integration`](/C:/Users/adcapsule/Desktop/ts-study/blog-agent/tests/integration), [`specs/001-staged-ai-generation/quickstart.md`](/C:/Users/adcapsule/Desktop/ts-study/blog-agent/specs/001-staged-ai-generation/quickstart.md)

### Post-Design Re-Check

- [x] 설계 산출물(`research.md`, `data-model.md`, `contracts/`, `quickstart.md`)에 헌장 원칙 I~V가 반영됨
- [x] 미해결 `NEEDS CLARIFICATION` 항목 없음
- [x] 복잡도 예외(헌장 위반) 없음

## Project Structure

### Documentation (this feature)

```text
specs/001-staged-ai-generation/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── generation-workflow.md
└── tasks.md
```

### Source Code (repository root)

```text
src/
├── app/
│   ├── (main)/
│   │   ├── generate/
│   │   ├── import/
│   │   └── posts/
│   └── providers.tsx
├── components/
├── hooks/
└── types/

convex/
├── generate.ts
├── generateAuth.ts
├── generateDraft.ts
├── generateRag.ts
├── generateStages.ts
├── generateTypes.ts
├── generateValidation.ts
├── posts.ts
├── styleProfiles.ts
└── schema.ts

tests/
├── contract/
├── integration/
└── unit/
```

**Structure Decision**: 기존 Next.js + Convex 단일 프로젝트 구조를 유지하고, 생성 파이프라인은 `convex/generate*.ts` 계층으로 분리합니다. UI는 `src/app/(main)/generate/page.tsx`, 데이터 계약은 `convex/*`와 `src/types/post.ts`를 동기화 대상으로 고정합니다.

## Phase 0 Output

- 연구 산출물: [`research.md`](/C:/Users/adcapsule/Desktop/ts-study/blog-agent/specs/001-staged-ai-generation/research.md)
- 해결된 핵심 쟁점:
  - 요약 기반 RAG 데이터 모델
  - 단계 실패 즉시 반환 계약
  - 다중 이미지 캡션 검증(개수/순서/빈 값) 통합 실패 코드 정책
  - 길이 정책 계산 기준(trim 이후 `string.length`)

## Phase 1 Output

- 데이터 모델: [`data-model.md`](/C:/Users/adcapsule/Desktop/ts-study/blog-agent/specs/001-staged-ai-generation/data-model.md)
- 인터페이스 계약: [`contracts/generation-workflow.md`](/C:/Users/adcapsule/Desktop/ts-study/blog-agent/specs/001-staged-ai-generation/contracts/generation-workflow.md)
- 검증 시나리오: [`quickstart.md`](/C:/Users/adcapsule/Desktop/ts-study/blog-agent/specs/001-staged-ai-generation/quickstart.md)
- 에이전트 컨텍스트 갱신: `.specify/scripts/bash/update-agent-context.sh codex` 실행 완료

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| 없음 | N/A | 헌장 위반 없이 요구사항 충족 가능 |
