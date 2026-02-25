// ⚠ MAX_FILE_SIZE, ALLOWED_TYPES는 src/constants.ts와 값을 동기화하세요.

export const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
export const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];

// Vision API
export const VISION_MAX_TOKENS = 300;        // 단일 이미지 묘사
export const REVIEW_VISION_MAX_TOKENS = 200; // 리뷰용 이미지당 묘사

// 블로그 생성 API
export const BLOG_MAX_TOKENS = 1000;         // 단일 이미지 블로그 생성
export const REVIEW_MAX_TOKENS = 2000;       // 리뷰 블로그 생성 (JSON)

// RAG
export const RAG_SEARCH_LIMIT = 3;

// 배치 처리
export const BATCH_SIZE = 5;
