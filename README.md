# My Persona Writer (나만의 AI 블로그 작가)

> 사진 한 장만 업로드하면, 내 과거 글투와 문체를 완벽하게 학습한 AI가 자동으로 블로그 초안을 작성해주는 웹 서비스

## 핵심 가치

- **초개인화** — 남들이 쓰는 뻔한 AI 글이 아닌, '나다운' 글 생성
- **멀티모달** — 시각 정보(사진)를 텍스트로 변환하여 글감으로 활용
- **효율성** — 사진만 던지면 10초 만에 초안 완성

## 기술 스택

| 구분         | 기술                 | 선정 이유                                                          |
| ------------ | -------------------- | ------------------------------------------------------------------ |
| Frontend     | Next.js (App Router) | React 기반 풀스택 프레임워크, 서버 컴포넌트 활용                   |
| Language     | TypeScript           | 정적 타입으로 에러 방지 및 유지보수성 향상                         |
| Backend & DB | Convex               | DB, 백엔드 로직, Vector Search를 한 번에 해결                      |
| AI Model     | OpenAI API           | gpt-4o-mini (Vision/Text 겸용), text-embedding-3-small (벡터 변환) |
| Styling      | Tailwind CSS         | 빠르고 직관적인 UI 개발                                            |
| Auth         | Clerk                | 소셜 로그인 포함 인증 로직 간편 구현                               |

## 시스템 아키텍처

RAG (검색 증강 생성) 방식을 활용하여 별도의 파인 튜닝 없이 개인화를 구현합니다.

```
사진 업로드 → Vision AI (사진 분석) → Embedding (벡터 변환)
    → Vector Search (유사 과거 글 3개 추출) → Text Generation (최종 글 생성)
```

1. **Input** — 사용자가 사진 업로드
2. **Vision** — AI가 사진을 분석해 상황 묘사 텍스트 생성
3. **Embedding** — 상황 묘사 텍스트를 벡터(숫자 좌표)로 변환
4. **Vector Search** — DB에 저장된 과거 글 중 가장 유사한 글 3개 추출
5. **Generation** — 사진 묘사 + 참고 글(말투) + 프롬프트를 조합해 최종 블로그 글 생성

## DB 스키마

```typescript
// convex/schema.ts
export default defineSchema({
  users: defineTable({
    name: v.string(),
    email: v.string(),
    tokenIdentifier: v.string(),
  }).index("by_token", ["tokenIdentifier"]),

  posts: defineTable({
    userId: v.string(),
    content: v.string(),
    imageUrl: v.optional(v.string()),
    embedding: v.array(v.float64()),
  }).vectorIndex("by_embedding", {
    vectorField: "embedding",
    dimensions: 1536,
    filterFields: ["userId"],
  }),
});
```

## 핵심 기능

### A. 학습하기 (Writing & Indexing)

- 사용자가 평소처럼 글을 쓰거나 기존 블로그 글을 복사해서 저장
- 글이 저장될 때마다 자동으로 OpenAI 임베딩 API를 호출해 벡터 값 생성

### B. 글 생성하기 (Generating)

- 드래그 앤 드롭으로 사진 업로드 후 "글 작성" 버튼 클릭
- 사진 분석 → 유사 과거 글 검색 → 스타일 모방 글쓰기
- 일반 줄글 형식으로 결과 제공

## 시작하기

```bash
# 의존성 설치
npm install

# 개발 서버 실행
npm run dev
```

[http://localhost:3000](http://localhost:3000)에서 확인할 수 있습니다.
