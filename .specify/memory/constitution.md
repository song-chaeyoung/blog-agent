<!--
Sync Impact Report
- Version change: 1.0.0 -> 1.1.0
- Modified principles:
  - III. AI 출력 계약 고정 및 실패 안전 -> III. AI 프롬프트 체인 고정 및 마크다운 배제
  - IV. RAG 일관성 및 추적 가능한 저장 -> IV. 이미지 기반의 RAG 일관성 및 개인화된 문체 강제
- Added sections:
  - 1. 프로젝트 핵심 가치 및 아키텍처 소개
- Removed sections:
  - 없음
- Templates requiring updates:
  - ✅ .specify/templates/plan-template.md
  - ✅ .specify/templates/spec-template.md
  - ✅ .specify/templates/tasks-template.md
  - ⚠ .specify/templates/commands/*.md
- Follow-up TODOs:
  - TODO(COMMAND_TEMPLATES): `.specify/templates/commands` 디렉터리가 생성되면 헌장 용어와 체크리스트를 동기화한다.
-->
# My Persona Writer (블로그 작성 AI) Constitution

## 1. 프로젝트 핵심 가치 및 아키텍처 소개

**My Persona Writer (블로그 작성 AI)**는 사진 한 장만 업로드하면, 사용자의 과거 글투와 문체를 완벽하게 학습한 AI가 남들이 쓰는 뻔한 AI 글이 아닌 '나다운' 초개인화 블로그 초안을 작성해주는 서비스다.

- **아키텍처 흐름:** `사진 업로드` -> `Vision AI 사진 분석` -> `Convex Vector Search (유사 과거 글 3개 추출)` -> `Text Gen AI (내 문체를 반영한 일반 줄글 형태의 최종 작성)`

## 2. Core Principles

### I. 인증 우선 및 사용자 데이터 격리 (데이터 소유권)
모든 읽기/쓰기/생성 경로 및 벡터 검색 경로는 인증된 사용자만 접근 가능해야 하며, 사용자 데이터는 `userId` 또는 `tokenIdentifier` 기준으로 철저히 격리되어야 한다. Convex의 Vector Search 수행 시 반드시 `filterFields: ["userId"]`를 적용하여 다른 사용자의 글이 내 글로 혼합되거나 학습되지 않도록 강제한다. 이는 개인 문체 데이터 보호가 제품 신뢰의 핵심이기 때문이다.

### II. 멀티모달 입력 및 서버 검증 우선
사용자가 업로드하는 사진 이미지는 서버에서 타입(`image/jpeg|png|gif|webp`), 크기(`최대 5MB`), 유효 범위를 검증한 뒤에만 영속화 및 AI 파이프라인으로 전달할 수 있다. 검증 실패 이미지 파일은 즉시 폐기하며, 클라이언트 검증은 UX 개선 용도로만 사용한다. 이는 악성 입력과 품질 저하 이미지를 AI 분석 수행 전에 차단하기 위함이다.

### III. AI 프롬프트 체인 고정 및 마크다운 배제
AI 호출은 `gpt-4o-mini` 모델과 `text-embedding-3-small` 임베딩 모델을 사용하며, 목적별 출력 포맷 계약을 명시해야 한다. 결과물은 마크다운 형식이 아닌 **일반 줄글 형식**으로 제공되어야 하며, 파싱 실패를 정상 결과로 취급해서는 안 된다. 실패 시 재시도 가능한 오류를 반환해야 하며, 비정형 데이터 오염을 방지한다.

### IV. 이미지 기반의 RAG 일관성 및 개인화된 문체 강제
사용자의 글은 `embedding` 필드(1536 차원)에 벡터 값으로 저장되어야 하며, 새 글 작성 시 원본 글과 함께 자동(백그라운드 액션)으로 임베딩이 일관되게 업데이트/생성되어야 한다. 글 생성 시에는 AI Vision 과정이 묘사한 사진 상황 텍스트에, RAG를 통해 추출된 과거 글 3개의 문체를 강하게 결합하여 블로그 글이 생성되어야 하며, AI의 기본 말투가 개입하는 것을 최소화해야 한다.

### V. 단일 소스 상수와 타입/스키마 동기화
`convex/schema.ts` 구조에 기반하여 도메인 상수(예: 사용자 테이블의 `tokenIdentifier`, 게시글 테이블의 `userId`, 이미지 `caption`, `embedding` 차원 수 등)는 프론트엔드와 백엔드 간 불일치가 없어야 한다. 동일 의미 값의 변경 시 동시 수정 또는 공통화가 필수이며, 이는 타입 에러 및 백엔드 런타임 오류를 사전에 차단하기 위함이다.

## 3. 기술 가드레일

- 기본 스택은 Next.js (App Router) + TypeScript + Convex + Clerk + Tailwind CSS + OpenAI API 플로우를 철저히 따른다.
- 데이터베이스 및 API, 서버 무서버 로직, 벡터 검색은 별도 SQL 서버 구축 없이 전량 **Convex**를 메인 백엔드로 활용한다.
- 사용자 비밀값(API Key 등)은 서버 런타임에서만 사용하며 클라이언트 번들에 노출하지 않는다.
- 새 기능은 기존 라우팅 구조(`src/app/(main)`), 데이터 함수 위치(`convex/*.ts`)를 우선 따른다.

## 4. 개발 워크플로우 및 품질 게이트

- 기능과 스펙 변경은 `spec -> plan -> tasks -> implement` 흐름을 전제로 한다.
- 구현 PR은 최소 1회 `lint`를 통과해야 하며, 확인을 포함해야 한다.
- 데이터 계약 구조 변경(DB 스키마, 벡터 차원 수 등)은 클라이언트 호출부를 포함한 관련 파일을 한 번에 묶어 수정한다.
- 코드 리뷰는 본 헌장의 핵심 가치 및 5개 원칙의 준수/위반 여부를 체크리스트로 검토하여 반영한다.

## Governance

본 헌장은 프로젝트의 다른 개발 관행보다 우선한다. 개정은 (1) 변경 제안서 작성, (2) 영향 템플릿 동기화 확인, (3) 승인 후 병합 절차를 모두 충족해야 한다.

버전 정책은 다음을 따른다.
- MAJOR: 기존 원칙 삭제, 의미를 뒤집는 재정의, 하위 호환 불가능한 거버넌스 변경
- MINOR: 새 원칙/섹션 추가, 기존 원칙의 실질적 의무 확대
- PATCH: 의미 변경 없는 문구 명확화, 오탈자/표현 개선

준수 점검은 모든 계획 문서와 PR 리뷰에서 수행하며, 위반 시 복구 계획(수정 범위/일정/책임자)을 명시해야 한다.

**Version**: 1.1.0 | **Ratified**: 2026-03-22 | **Last Amended**: 2026-03-22
