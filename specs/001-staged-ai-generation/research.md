# Phase 0 Research: 단계 분리형 AI 블로그 생성 재정의

## 결정 1. `summary`는 저장/수정 이후 비동기 후처리로 생성한다

- **Decision**: 게시글 저장 mutation은 즉시 완료하고, 요약·임베딩 생성은 `ctx.scheduler.runAfter`로 예약한다.
- **Rationale**: 저장 경로와 AI 경로를 분리하면 사용자 체감 지연과 실패 원인 혼합을 줄일 수 있다. 명세의 "단계 실패 즉시 반환" 요구와도 정합적이다.
- **Alternatives considered**:
  - 저장 시 동기 생성: 저장 실패와 AI 실패가 결합되어 디버깅 난이도가 높아진다.
  - 생성 요청 시 즉석 요약: `summary` 없는 게시글 제외 정책과 충돌한다.

## 결정 2. RAG 검색 단위는 `content`가 아니라 `summary + embedding`으로 고정한다

- **Decision**: 과거 글 참조 후보는 `summaryStatus = "ready"`이며 `summary`와 `embedding`이 모두 있는 글만 사용한다.
- **Rationale**: 원문 직접 재사용을 피하고 요약 기반 문맥만 쓰라는 요구를 가장 직접적으로 충족한다.
- **Alternatives considered**:
  - 원문 임베딩 유지: 요구사항의 핵심 제약을 위반한다.
  - 요약만 저장하고 벡터 미사용: 검색 품질과 일관성이 낮아진다.

## 결정 3. 공개 API는 유지하고 내부는 단계 함수로 분리한다

- **Decision**: 공개 엔드포인트는 `createBlogFromImage`/`createBlogReview`를 유지하되, 내부는 `style-profile-preparation -> image-analysis -> rag-context -> final-draft` 순서로 분리한다.
- **Rationale**: 프런트 단순성을 유지하면서도 단계별 실패 지점을 구조적으로 분리할 수 있다.
- **Alternatives considered**:
  - 프런트에서 단계 API 직접 오케스트레이션: 인증/실패 처리 복잡도가 UI로 전이된다.
  - 단일 거대 함수: 단계 단위 테스트와 원인 추적이 어려워진다.

## 결정 4. 실패 반환은 예외가 아닌 판별 가능한 유니온으로 통일한다

- **Decision**: 실패 응답은 `{ ok: false, failedStage, code, message, retryable }`를 강제한다.
- **Rationale**: 사용자에게 실패 지점을 명확히 보여주고, 재시도 가능성 정책을 일관되게 전달할 수 있다.
- **Alternatives considered**:
  - 예외 문자열 전달: 문구 변경에 취약하고 타입 안전성이 없다.
  - `null`/`undefined` 반환: 실패 원인 분류가 불가능하다.

## 결정 5. 생성 체인은 `gpt-4o-mini`, 임베딩은 `text-embedding-3-small`로 통일한다

- **Decision**: 이미지 분석, 최종 초안 생성, 요약 생성은 `gpt-4o-mini`, 벡터화는 `text-embedding-3-small`을 사용한다.
- **Rationale**: 헌장 모델 고정 원칙과 기존 스택을 동시에 만족한다.
- **Alternatives considered**:
  - 단계별 모델 혼합: 운영 정책과 튜닝 포인트가 불필요하게 늘어난다.

## 결정 6. 다중 이미지 리뷰는 부분 성공을 허용하지 않는다

- **Decision**: 다중 이미지에서 한 장이라도 분석 실패 시 전체 요청을 `image-analysis` 실패로 종료한다.
- **Rationale**: 리뷰 글은 이미지 집합 전체 서사를 전제로 하므로 부분 성공은 결과 신뢰도를 떨어뜨린다.
- **Alternatives considered**:
  - 성공한 이미지로만 진행: 입력-출력 대응이 깨진다.

## 결정 7. 캡션 검증(`count/order/empty`)은 실패 대신 보정 처리한다

- **Decision**: 캡션 개수 불일치, 순서 모호, 빈 캡션은 실패 코드를 반환하지 않고 입력 이미지 순서 기준 보정(빈 캡션 허용)으로 처리한다.
- **Rationale**: 캡션 불일치로 전체 생성을 폐기하면 토큰 비용만 발생하고 사용자에게 결과가 노출되지 않으므로 비용 대비 가치가 낮다.
- **Alternatives considered**:
  - 실패 유형별 코드 분리: 분기 복잡도 대비 사용자 가치가 낮다.
  - 불일치 즉시 실패: 토큰 낭비와 재시도 비용이 커진다.

## 결정 8. 리뷰 응답 구조 누락은 보정 후 진행하고 완전 공백만 실패 처리한다

- **Decision**: 리뷰 생성 결과에서 `intro/outro/captions` 누락은 빈 값으로 보정하고, 세 필드가 모두 비어 있을 때만 `final-draft` 실패로 처리한다.
- **Rationale**: 부분 누락은 보정 가능한 데이터 결손이며, 즉시 실패보다 결과 노출 유지가 사용자 경험과 비용 측면에서 유리하다.
- **Alternatives considered**:
  - 누락 필드 즉시 실패: 토큰 낭비와 재시도 부담이 증가한다.

## 결정 9. 길이 정책은 trim 이후 JavaScript `string.length`로 계산한다

- **Decision**: 단일 본문 1200자, 리뷰 `intro/outro` 280자, `caption` 320자는 모두 trim된 문자열의 `string.length` 기준으로 판정한다.
- **Rationale**: 서버/클라이언트 양쪽에서 동일한 계산 규칙을 적용할 수 있고, 2026-04-10 명확화와 일치한다.
- **Alternatives considered**:
  - 토큰 기준 길이 제한: UI 검증과 기준 불일치가 발생한다.

## 결정 10. `styleProfile` 조회 실패는 폴백, strict 정책 불충족은 실패로 처리한다

- **Decision**: 프로필 조회 실패/부재는 `openingMode = "off"`로 폴백하고, `strict`에서 시작문 제약 불충족 시 `final-draft` 실패를 반환한다.
- **Rationale**: 기능 가용성과 사용자 의도 강제를 동시에 달성한다.
- **Alternatives considered**:
  - 조회 실패를 즉시 전체 실패: 가용성이 과도하게 떨어진다.
  - strict 미충족을 허용: 사용자 계약 위반이다.

## 결과 요약

- 모든 미해결 항목을 제거했고 `NEEDS CLARIFICATION`은 남지 않았다.
- 설계 산출물은 요약 기반 RAG, 단계 실패 즉시 반환, 사용자 데이터 격리, 출력 계약 강제를 중심으로 고정했다.
