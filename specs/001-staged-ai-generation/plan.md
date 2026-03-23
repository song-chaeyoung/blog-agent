# Implementation Plan: 단계 분리형 AI 블로그 생성 재정의

**Branch**: `001-staged-ai-generation` | **Date**: 2026-03-23 | **Spec**: [spec.md](./spec.md)
**Input**: `specs/001-staged-ai-generation/spec.md`의 기능 명세

**Note**: 현재 Git 작업 브랜치는 `feat/sdd`이지만, spec-kit 기준 활성 기능 디렉터리는 `specs/001-staged-ai-generation` 하나뿐이므로 본 계획은 해당 디렉터리를 기준으로 작성한다.

## Summary

현재 [`convex/generate.ts`](/C:/Users/adcapsule/Desktop/ts-study/blog-agent/convex/generate.ts)는 이미지 분석, 임베딩, RAG, 최종 글 생성을 하나의 action 내부에서 처리하고, 참조 데이터도 게시글 원문 `content`에 직접 의존한다. 이번 계획은 `posts`에 `summary` 계열 필드와 비동기 요약 생성 작업을 도입하고, 생성 경로를 `summary` 전용 상위 RAG와 단계별 명시적 실패 계약으로 재구성하는 데 초점을 둔다. 이 방식은 `generate.ts` 중심 재정의, `gpt-4o-mini` 기반 생성 체인, Convex + Clerk 기반 사용자 격리, 그리고 "실패 시 즉시 반환"이라는 명세 제약을 동시에 만족시키기 위한 선택이다.

## Technical Context

**Language/Version**: TypeScript 5.x, Next.js 16 App Router, React 19  
**Primary Dependencies**: Next.js App Router, Convex, Clerk, OpenAI SDK, Tailwind CSS v4, Sonner  
**Storage**: Convex Database, Convex Storage, Convex Vector Search (`posts` 기반)  
**Testing**: `bun run lint` + 로컬 Convex 개발 환경에서 수동 시나리오 검증  
**Target Platform**: 웹 브라우저용 Next.js 앱 + Convex 서버리스 런타임  
**Project Type**: 웹 애플리케이션  
**Performance Goals**: 게시글 저장/수정 경로는 요약 생성 작업을 비동기로 넘겨 사용자 대기 시간을 최소화하고, 생성 요청은 한 번의 실행 안에서 성공 결과 또는 실패 단계 정보를 반드시 반환한다.  
**Constraints**: `summary` 없는 게시글은 생성 참조 후보에서 제외, 각 단계는 별도 `internalAction`/`internalQuery`/`internalMutation` 단위로 분리, 단계 실패 시 서버 내부 자동 재시도 없이 즉시 중단하고 실패 응답에 `retryable`을 포함, 상위 RAG는 최종 참고 요약 기본 3개 이상을 요구(테스트로 3개 이상 상향 가능), 다른 사용자의 데이터 혼입 금지, 최종 글은 한국어 일반 줄글로 반환, 단일 생성은 이미지 1장만 허용하고 리뷰 생성은 2~20장만 허용  
**Scale/Scope**: 인증 사용자 개인용 블로그 생성 기능, `/generate` 한 화면에서 단일 이미지 글 생성과 2~20장 리뷰 글 생성을 함께 지원, 과거 글 요약 기반 RAG, 기존 `convex/*.ts`와 `src/app/(main)` 구조 유지

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- [x] 인증 경계가 명시되었는가? Clerk 인증 이후 Convex의 `tokenIdentifier -> userId` 해석을 공통 경로로 유지하고, 공개 생성/저장 함수는 모두 인증 사용자를 전제로 설계한다.
- [x] 사용자 데이터 격리 규칙이 설계에 반영되었는가? `summary` 조회와 벡터 검색은 모두 `userId` 기준으로 제한하고, 새로운 인덱스도 동일한 필터 정책을 따른다.
- [x] 입력/업로드 검증 규칙이 정의되었는가? 기존 [`convex/images.ts`](/C:/Users/adcapsule/Desktop/ts-study/blog-agent/convex/images.ts)의 서버 검증을 유지하고, 생성 단계 시작 전 이미지 URL 존재 여부, 이미지 개수(단일 1장 / 리뷰 2~20장), `memo` trim, `keywords` 정규화 및 최대 10개 제한을 검증한다.
- [x] AI 출력 계약이 고정되었는가? 이미지 분석, 요약 생성, 상위 RAG 맥락 구성, 최종 글 생성은 각자 기대 형식과 실패 응답을 가진 판별 가능한 계약으로 분리한다.
- [x] 상수/스키마/타입 동기화 대상이 식별되었는가? [`convex/schema.ts`](/C:/Users/adcapsule/Desktop/ts-study/blog-agent/convex/schema.ts), Convex 생성/저장 함수, 프런트 결과 타입을 함께 갱신한다.
- [x] 검증 계획이 포함되었는가? `lint`와 단계별 성공/실패 수동 검증 절차를 [`quickstart.md`](./quickstart.md)에 포함한다.

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
│   ├── signin/
│   ├── signup/
│   ├── layout.tsx
│   └── providers.tsx
├── components/
│   └── image-uploader.tsx
├── hooks/
│   ├── usePostEditor.ts
│   └── useResultEditor.ts
├── middleware.ts
└── types/
    └── post.ts

convex/
├── generate.ts
├── generateHelpers.ts
├── images.ts
├── posts.ts
├── schema.ts
├── users.ts
└── _generated/
```

**Structure Decision**: 단일 Next.js + Convex 프로젝트 구조를 유지한다. UI 변경은 `src/app/(main)/generate`와 `src/types`에 집중하고, 생성 파이프라인 분리는 `convex/generate.ts`, `convex/posts.ts`, 신규 스테이지 헬퍼 모듈에 배치한다. 이 선택은 기존 프로젝트의 경로 규약을 보존하면서도 `generate.ts` 중심 재정의 요구를 충족하기 때문이다.

## Phase 0 Research Summary

- `summary`는 게시글 저장/수정 직후 Convex 스케줄러로 비동기 생성·갱신한다.
- RAG 검색 입력은 원문 `content`가 아니라 `summary`와 `embedding`(summary 기반 벡터)으로 전환한다.
- 생성 액션은 하나의 공개 진입점에서 오케스트레이션하되, 실제 단계는 분리된 internal 함수 호출로 실행한다.
- 실패 응답은 예외 메시지 문자열이 아니라 `failedStage`, `code`, `message`, `retryable`을 포함한 판별 가능한 유니온으로 통일하고, 서버 내부 자동 재시도는 수행하지 않는다.
- 이미지 분석, 요약 생성, 상위 RAG 구성, 최종 글 생성은 모두 `gpt-4o-mini`를 사용하고, 임베딩만 `text-embedding-3-small`을 사용한다.
- `/generate`는 하나의 화면에서 이미지 1장과 2~20장 요청을 모두 처리하고, 공개 생성 액션은 입력 개수에 따라 분기한다.
- 상위 RAG는 준비된 `summary` 후보가 없거나 최종 선택된 참고 요약이 기본 임계값 3개에 미달하면 실패 처리한다(임계값은 테스트 결과로 3개 이상 상향 가능).
- 기존 게시글 `summary` 백필은 초기 구현에서 자동 일괄 실행하지 않고, 수동 backfill mutation으로만 수행한다.

## Phase 1 Design Overview

### Backend / Convex

- `posts` 테이블에 `summary`, `embedding`(summary 기반 벡터), `summaryStatus`, `summaryError`, `summaryUpdatedAt` 필드를 추가한다.
- `embedding` 필드의 의미를 원문 기반에서 `summary` 기반으로 재정의하고, 벡터 검색 필터는 계속 `userId`를 강제한다.
- 게시글 생성/수정 mutation은 저장 후 `generateSummary` internal action을 스케줄링한다.
- `convex/generate.ts`는 공개 액션인 `createBlogFromImage`와 `createBlogReview`를 유지하되, 실제 단계는 `validateRequest -> resolveUserContext -> summaryPreparation -> imageAnalysis -> ragContext -> finalDraft` 순서의 내부 `internalAction`/`internalQuery`/`internalMutation` 호출로 오케스트레이션한다.
- 각 스테이지는 성공 시 구조화된 결과를 반환하고, 실패 시 해당 스테이지 이름과 사용자 노출 가능한 사유, `retryable`을 포함한 실패 객체를 반환한다.

### Frontend / Next.js

- 생성 화면은 성공 결과 타입 외에 단계 실패 응답을 해석할 수 있도록 `ResultData`와 호출 흐름을 확장한다.
- `/generate`는 이미지 1장일 때 단일 글 생성 액션을, 2~20장일 때 리뷰 글 생성 액션을 호출하도록 분기한다.
- 생성 화면은 실패 메시지를 스테이지 이름과 함께 표시하고, 입력 검증 실패는 AI 호출 전 단계에서 사용자에게 즉시 노출한다.

### Data / Migration

- 기존 게시글은 `summary`가 비어 있으면 새 생성 요청의 참조 후보에서 제외한다.
- 과거 게시글은 사용자가 수정/재저장하거나 수동 backfill mutation을 실행할 때만 점진적으로 `summary`를 채운다.
- 실패한 요약 작업은 `summaryStatus = "failed"`와 `summaryError`를 남겨 재처리 기준을 분리한다.
- 자동 일괄 backfill 배치는 초기 구현 범위에서 제외한다.

## Post-Design Constitution Check

- [x] 인증 우선: 모든 공개 생성/저장 함수는 Clerk 인증과 Convex 사용자 해석을 선행한다.
- [x] 데이터 격리: `summary` 조회와 벡터 검색 모두 사용자 범위 필터를 유지한다.
- [x] 입력 검증: 이미지 개수(1장 또는 2~20장), URL, `memo` trim, `keywords` 정규화/최대 10개 제한을 스테이지 시작 전에 검증한다.
- [x] AI 계약: 각 단계의 구조화 출력과 파싱 실패 처리 규칙을 계약 문서로 명시했다.
- [x] 스키마 동기화: 스키마, 인덱스, 저장 mutation, 생성 action, 프런트 타입 변경이 한 세트로 묶였다.
- [x] 검증 계획: 빠른 실행 절차, 단일/다중 이미지 검증, 10건 블라인드 비교 평가 절차를 별도 문서로 제공한다.

## Complexity Tracking

현재 계획에는 헌법 위반을 정당화해야 할 복잡도 예외가 없다.
