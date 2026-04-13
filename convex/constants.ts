// ⚠ MAX_FILE_SIZE, ALLOWED_TYPES는 src/constants.ts와 값을 동기화하세요.

export const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
export const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];

// Vision API
export const VISION_MAX_TOKENS = 300;        // 단일 이미지 묘사
export const REVIEW_VISION_MAX_TOKENS = 200; // 리뷰용 이미지당 묘사

// 블로그 생성 API
export const BLOG_MAX_TOKENS = 1000;         // 단일 이미지 블로그 생성
export const REVIEW_MAX_TOKENS = 2000;       // 리뷰 블로그 생성 (JSON)
export const SINGLE_DRAFT_MAX_CHARS = 1200;  // 단일 글 최대 글자 수
export const REVIEW_INTRO_MAX_CHARS = 280;   // 리뷰 도입부 최대 글자 수
export const REVIEW_OUTRO_MAX_CHARS = 280;   // 리뷰 마무리 최대 글자 수
export const REVIEW_CAPTION_MAX_CHARS = 320; // 리뷰 이미지별 캡션 최대 글자 수

// RAG
export const RAG_SEARCH_LIMIT = 3;
export const RAG_MIN_REFERENCES = 3;

// 배치 처리
export const BATCH_SIZE = 5;

// 입력 제한
export const SINGLE_IMAGE_COUNT = 1;
export const REVIEW_MIN_IMAGE_COUNT = 2;
export const REVIEW_MAX_IMAGE_COUNT = 20;
export const MAX_KEYWORDS = 10;

// 업로드 수명
export const TEMP_UPLOAD_TTL_MS = 1000 * 60 * 60 * 24; // 24시간
export const TEMP_UPLOAD_CLEANUP_BATCH = 200;
export const SUMMARY_PENDING_STALE_MS = 1000 * 60 * 30; // 30 minutes
