# CopyMe

이미지를 업로드하면 내 문체로 블로그 리뷰 글을 자동 생성해주는 AI 글쓰기 도구입니다.
기존 블로그 글을 학습 데이터로 임포트하면, AI가 내 글쓰기 스타일을 분석해 새 글을 작성합니다.

## 주요 기능

- **글 임포트** — 기존 블로그 글을 붙여넣어 저장. `---` 구분자로 여러 글을 한 번에 임포트 가능
- **글 생성** — 이미지(최대 20장) + 메모 + SEO 키워드를 입력하면 내 문체로 리뷰 글 자동 생성
- **유사 글 검색** — 벡터 임베딩 기반으로 기존 글 중 유사한 글을 찾아 문체 참고
- **결과 편집 & 복사** — 생성된 글을 수정하고 클립보드에 복사

## 기술 스택

| 영역 | 기술 |
|------|------|
| 프레임워크 | Next.js 16 (App Router) |
| 언어 | TypeScript |
| 스타일 | Tailwind CSS v4 |
| 인증 | Clerk |
| 백엔드 / DB | Convex (벡터 검색 포함) |
| AI | OpenAI (GPT-4o, text-embedding-3-small) |
| 알림 | Sonner |

## 글 생성 흐름

RAG(검색 증강 생성) 방식으로 파인 튜닝 없이 개인화를 구현합니다.

```
이미지 업로드 → Convex Storage 저장
    → 기존 글 벡터 검색 (유사 문체 추출)
    → GPT-4o에 이미지 + 메모 + 유사 글 전달
    → 도입부 / 이미지별 캡션 / 마무리 구성
```

## 시작하기

### 환경 변수 설정

`.env.local` 파일을 생성하고 아래 값을 채워주세요.

```env
# Clerk
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=

# Convex
NEXT_PUBLIC_CONVEX_URL=

# OpenAI (Convex 환경 변수로도 설정 필요)
OPENAI_API_KEY=
```

### 개발 서버 실행

```bash
bun install
bun dev
```

Convex 개발 서버도 함께 실행합니다.

```bash
bunx convex dev
```

## 프로젝트 구조

```
src/
├── app/
│   ├── (main)/
│   │   ├── import/     # 글 임포트 페이지
│   │   ├── generate/   # 글 생성 페이지
│   │   └── posts/      # 글 목록 & 상세 페이지
│   ├── layout.tsx
│   └── page.tsx        # 랜딩 (로그인 유도)
├── components/
│   └── image-uploader.tsx
├── hooks/
│   ├── usePostEditor.ts
│   └── useResultEditor.ts
└── types/
    └── post.ts

convex/
├── schema.ts           # DB 스키마 (users, posts)
├── posts.ts            # 글 CRUD
├── generate.ts         # AI 글 생성 액션
├── generateHelpers.ts  # 프롬프트 / 유사 글 검색
└── images.ts           # 이미지 업로드
```
