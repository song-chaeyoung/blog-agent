import {
  MAX_KEYWORDS,
  REVIEW_MAX_IMAGE_COUNT,
  REVIEW_MIN_IMAGE_COUNT,
  SINGLE_IMAGE_COUNT,
} from "./constants";
import { fail, type GenerationFailure } from "./generateTypes";

export function validateSingleImageRequest(
  imageUrl: string
): { ok: true; imageUrl: string } | GenerationFailure {
  const normalized = imageUrl.trim();
  if (!normalized) {
    return fail(
      "summary-preparation",
      "INVALID_IMAGE_URL",
      "이미지 URL이 비어 있습니다.",
      false
    );
  }
  return { ok: true, imageUrl: normalized };
}

export function normalizeReviewRequest(input: {
  imageUrls: string[];
  memo?: string;
  keywords?: string[];
}):
  | {
      ok: true;
      imageUrls: string[];
      memo?: string;
      keywords?: string[];
    }
  | GenerationFailure {
  if (
    input.imageUrls.length < REVIEW_MIN_IMAGE_COUNT ||
    input.imageUrls.length > REVIEW_MAX_IMAGE_COUNT
  ) {
    return fail(
      "summary-preparation",
      "INVALID_IMAGE_COUNT",
      `리뷰 생성은 이미지 ${REVIEW_MIN_IMAGE_COUNT}~${REVIEW_MAX_IMAGE_COUNT}장만 허용됩니다.`,
      false
    );
  }

  const imageUrls = input.imageUrls.map((url) => url.trim());
  if (imageUrls.some((url) => !url)) {
    return fail(
      "summary-preparation",
      "INVALID_IMAGE_URL",
      "이미지 URL에 빈 값이 포함되어 있습니다.",
      false
    );
  }

  const memo = input.memo?.trim();
  const normalizedMemo = memo ? memo : undefined;
  const normalizedKeywords = (input.keywords ?? [])
    .map((k) => k.trim())
    .filter((k) => k.length > 0)
    .slice(0, MAX_KEYWORDS);

  return {
    ok: true,
    imageUrls,
    memo: normalizedMemo,
    keywords: normalizedKeywords.length > 0 ? normalizedKeywords : undefined,
  };
}

export function isSingleImageCount(imageCount: number): boolean {
  return imageCount === SINGLE_IMAGE_COUNT;
}

