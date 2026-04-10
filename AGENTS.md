# blog-agent Development Guidelines

Auto-generated from all feature plans. Last updated: 2026-04-10

## Active Technologies

- TypeScript 5 + Next.js 16 App Router + React 19 + Convex + Clerk + OpenAI SDK + Tailwind CSS v4 (001-staged-ai-generation)
- Convex Database, Convex Storage, Convex Vector Search, Sonner (001-staged-ai-generation)

## Project Structure

```text
src/
├── app/
│   ├── (main)/
│   │   ├── generate/
│   │   ├── import/
│   │   └── posts/
│   ├── signin/
│   ├── signup/
│   └── providers.tsx
├── components/
├── hooks/
├── types/
└── middleware.ts

convex/
├── generate.ts
├── generateHelpers.ts
├── images.ts
├── posts.ts
├── schema.ts
└── users.ts

specs/
└── 001-staged-ai-generation/
```

## Commands

- `bun dev`
- `bunx convex dev`
- `bun run lint`

## Code Style

- TypeScript와 Convex generated 타입을 우선 사용하고, 공개 생성 함수 반환값은 판별 가능한 유니온으로 유지합니다.
- `convex/schema.ts`, Convex 함수 인자/반환형, `src/types` 타입은 한 세트로 함께 수정합니다.
- 인증은 Clerk identity 확인 후 Convex `users.by_token` 해석 순서를 유지합니다.
- 생성 파이프라인 변경은 `summary` 기반 RAG, 단계별 실패 반환, 사용자 데이터 격리 원칙을 따라야 합니다.

## Recent Changes

- `001-staged-ai-generation`: Added staged generation planning with summary-based RAG and explicit stage-failure contracts
- Naver blog URL import
- Profile page
- Writing style matching
- Image upload cleanup logic
- Caption-image matching

<!-- MANUAL ADDITIONS START -->
- 사용자 응답은 존댓말로 작성합니다.
- 모든 작업과 제안에는 근거를 명시합니다.
<!-- MANUAL ADDITIONS END -->
