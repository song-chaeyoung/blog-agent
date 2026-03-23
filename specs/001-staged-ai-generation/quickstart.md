# Quickstart: 단계 분리형 AI 블로그 생성 재정의

## 1. 준비

### 필수 환경 변수

`.env.local`과 Convex 환경 변수에 아래 값을 준비한다.

```env
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
NEXT_PUBLIC_CONVEX_URL=
OPENAI_API_KEY=
```

### 개발 서버 실행

```bash
bun dev
```

별도 터미널에서 Convex 개발 서버를 실행한다.

```bash
bunx convex dev
```

## 2. 기준 데이터 준비

1. Clerk로 로그인합니다.
2. 기존 글 임포트 기능으로 최소 2개 이상의 게시글을 저장합니다.
3. Convex 대시보드에서 `posts` 문서를 확인해 `summaryStatus`가 `ready`로 바뀌는지 확인합니다.
4. `summary`가 비어 있는 legacy 글이 있다면, 해당 글은 생성 참조 후보에서 제외되는 것이 정상입니다.

## 3. 핵심 시나리오 검증

### 시나리오 A. 리뷰 글 생성 성공

1. `/generate` 화면에서 2장 이상의 이미지를 업로드합니다.
2. 메모와 키워드를 선택적으로 입력합니다.
3. 생성 요청을 실행합니다.
4. 결과가 성공이면 다음을 확인합니다.
   - 실패 toast 대신 결과 화면으로 이동합니다.
   - 결과 본문이 이미지 내용과 과거 글 요약 문맥을 모두 반영합니다.
   - 저장된 게시글 문서에 `content`, `imageBlocks`, `intro`, `outro`가 채워집니다.

### 시나리오 B. 단계 실패 즉시 반환

1. 테스트용으로 잘못된 이미지 URL 또는 파싱 불가능한 AI 응답을 유도할 수 있는 목 객체를 준비합니다.
2. 생성 요청을 실행합니다.
3. 결과가 실패이면 다음을 확인합니다.
   - 응답에 `failedStage`와 사용자용 `message`가 포함됩니다.
   - 실패 단계 이후 로직이 실행되지 않습니다.
   - 저장 mutation이 호출되지 않아 새 게시글이 생성되지 않습니다.

### 시나리오 C. `summary` 없는 게시글 제외

1. Convex 대시보드에서 특정 게시글의 `summary`, `summaryEmbedding`, `summaryStatus`를 제거하거나 `pending`으로 둡니다.
2. 새 생성 요청을 실행합니다.
3. 다음을 확인합니다.
   - 해당 글은 참조 후보에서 제외됩니다.
   - 남은 `summary`만으로 충분하지 않으면 `rag-context` 단계 실패가 반환됩니다.

### 시나리오 D. 다중 이미지 부분 실패 불가

1. 다중 이미지 요청에서 한 장만 실패하도록 테스트 입력을 구성합니다.
2. 생성 요청을 실행합니다.
3. 다음을 확인합니다.
   - 전체 요청이 `image-analysis` 단계 실패로 종료됩니다.
   - 성공한 이미지 일부만으로 결과를 생성하지 않습니다.

## 4. 편집 후 요약 재생성 검증

1. 생성된 게시글을 수정합니다.
2. 저장 직후 게시글 문서의 `summaryStatus`가 `pending`으로 바뀌는지 확인합니다.
3. 백그라운드 작업 완료 후 `summary`, `summaryEmbedding`, `summaryUpdatedAt`이 갱신되는지 확인합니다.

## 5. 최소 검증 명령

정적 검증은 아래 명령으로 수행합니다.

```bash
bun run lint
```

## 6. 완료 기준

- 생성 성공 요청은 결과 본문과 저장 문서를 남긴다.
- 생성 실패 요청은 `failedStage`와 명확한 사유를 반환한다.
- 실패 후 후속 단계는 실행되지 않는다.
- 게시글 저장/수정 후 `summary`는 비동기로 생성 또는 갱신된다.
