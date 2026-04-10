import OpenAI from "openai";
import {
  BLOG_MAX_TOKENS,
  REVIEW_CAPTION_MAX_CHARS,
  REVIEW_INTRO_MAX_CHARS,
  REVIEW_MAX_TOKENS,
  REVIEW_OUTRO_MAX_CHARS,
  SINGLE_DRAFT_MAX_CHARS,
} from "./constants";
import {
  fail,
  type GenerationFailure,
  type GenerationStyleProfile,
  type ReferenceSummary,
} from "./generateTypes";
import type { ImageObservation } from "./generateStages";

const ANALYSIS_LABEL_REGEX = /(상황|분위기|감정)\s*[:：]/g;
const MARKDOWN_LIST_REGEX = /^\s*[-*]\s+/m;
const MARKDOWN_HEADING_REGEX = /^\s*#{1,6}\s+/m;
const INTERNAL_LABEL_REGEX = /\[(이미지 관찰|참고 요약(?:\s*\d+)?|이미지\s*\d+)\]/;

export function hasDraftFormatViolation(text: string): boolean {
  if (MARKDOWN_LIST_REGEX.test(text)) return true;
  if (MARKDOWN_HEADING_REGEX.test(text)) return true;
  if (INTERNAL_LABEL_REGEX.test(text)) return true;
  const labelMatches = text.match(ANALYSIS_LABEL_REGEX) ?? [];
  return labelMatches.length >= 1;
}

export function ensureDraftFormat(text: string): GenerationFailure | null {
  if (!hasDraftFormatViolation(text)) {
    return null;
  }
  return fail(
    "final-draft",
    "DRAFT_FORMAT_VIOLATION",
    "최종 글 형식이 요구사항을 만족하지 않습니다. 분석 템플릿 라벨이나 markdown 목록 없이 일반 줄글로 생성해 주세요.",
    true
  );
}

export function getSingleDraftLengthViolation(content: string): {
  field: "content";
  max: number;
  actual: number;
} | null {
  if (content.length <= SINGLE_DRAFT_MAX_CHARS) {
    return null;
  }
  return {
    field: "content",
    max: SINGLE_DRAFT_MAX_CHARS,
    actual: content.length,
  };
}

export function getReviewDraftLengthViolation(
  intro: string,
  outro: string,
  captions: string[]
): { field: "intro" | "outro" | "caption"; max: number; actual: number; index?: number } | null {
  if (intro.length > REVIEW_INTRO_MAX_CHARS) {
    return { field: "intro", max: REVIEW_INTRO_MAX_CHARS, actual: intro.length };
  }

  if (outro.length > REVIEW_OUTRO_MAX_CHARS) {
    return { field: "outro", max: REVIEW_OUTRO_MAX_CHARS, actual: outro.length };
  }

  for (let i = 0; i < captions.length; i += 1) {
    if (captions[i].length > REVIEW_CAPTION_MAX_CHARS) {
      return {
        field: "caption",
        max: REVIEW_CAPTION_MAX_CHARS,
        actual: captions[i].length,
        index: i,
      };
    }
  }

  return null;
}

function pickPatternOpening(styleProfile: GenerationStyleProfile): string | null {
  if (styleProfile.openerPatterns.length === 0) return null;
  const best = [...styleProfile.openerPatterns]
    .filter((item) => item.text.trim().length > 0)
    .sort((a, b) => b.repeatRate - a.repeatRate)[0];
  if (!best) return null;
  if (best.repeatRate < 0.6) return null;
  return best.text.trim();
}

export function getExpectedOpening(
  styleProfile: GenerationStyleProfile
): string | null {
  if (styleProfile.openingMode === "off") {
    return null;
  }
  const fixed = styleProfile.fixedOpening?.trim();
  if (fixed) {
    return fixed;
  }
  return pickPatternOpening(styleProfile);
}

function getFirstNonEmptyLine(text: string): string {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0) ?? "";
}

export function ensureOpeningConstraint(
  text: string,
  styleProfile: GenerationStyleProfile
): GenerationFailure | null {
  if (styleProfile.openingMode !== "strict") {
    return null;
  }

  const expected = getExpectedOpening(styleProfile);
  if (!expected) {
    return fail(
      "style-profile-preparation",
      "STYLE_PROFILE_STRICT_OPENING_MISSING",
      "strict 모드에는 고정 시작문 또는 반복 시작문 패턴이 필요합니다.",
      false
    );
  }

  const firstLine = getFirstNonEmptyLine(text);
  if (firstLine !== expected) {
    return fail(
      "final-draft",
      "OPENING_CONSTRAINT_VIOLATION",
      "strict 도입구 규칙을 만족하지 못했습니다.",
      true
    );
  }
  return null;
}

export async function composeSingleDraftStage(
  ai: OpenAI,
  observation: ImageObservation,
  references: ReferenceSummary[],
  styleProfile: GenerationStyleProfile
): Promise<{ ok: true; content: string } | GenerationFailure> {
  const referenceTexts = references
    .map((r, i) => `[참고 요약 ${i + 1}]\n${r.summary}`)
    .join("\n\n");
  const expectedOpening = getExpectedOpening(styleProfile);
  const openingRule =
    styleProfile.openingMode === "off"
      ? "도입구 강제 규칙은 없습니다."
      : styleProfile.openingMode === "preferred"
      ? `가능하면 첫 줄을 "${expectedOpening ?? ""}"로 시작하세요.`
      : `첫 줄은 반드시 "${expectedOpening ?? ""}"와 정확히 일치해야 합니다.`;

  try {
    const response = await ai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            `이미지 관찰과 참고 요약을 바탕으로 한국어 블로그 글을 작성해 주세요. 마크다운 없이 일반 줄글로 작성하세요. 절대로 '**상황:**', '**분위기:**', '**감정:**' 같은 분석 템플릿 라벨, 목록(-,*), 제목(#) 형식을 출력하지 마세요. 본문은 ${SINGLE_DRAFT_MAX_CHARS}자 이하로 작성하세요. ${openingRule}`,
        },
        {
          role: "user",
          content: `[이미지 관찰]\n${observation.observation}\n\n${referenceTexts}\n\n[작성 규칙]\n- 관찰 텍스트를 그대로 복사하지 말고 자연스럽게 재서술하세요.\n- 내부 레이블(예: [이미지 관찰], [참고 요약])을 본문에 노출하지 마세요.`,
        },
      ],
      max_tokens: BLOG_MAX_TOKENS,
    });

    const content = (response.choices[0]?.message?.content ?? "").trim();
    if (!content) {
      return fail(
        "final-draft",
        "DRAFT_EMPTY",
        "최종 글 생성 결과가 비어 있습니다.",
        true
      );
    }

    const formatFailure = ensureDraftFormat(content);
    if (formatFailure) {
      return formatFailure;
    }

    const lengthViolation = getSingleDraftLengthViolation(content);
    if (lengthViolation) {
      return fail(
        "final-draft",
        "DRAFT_TOO_LONG",
        `최종 글 길이가 ${lengthViolation.max}자를 초과했습니다. (${lengthViolation.actual}자)`,
        true
      );
    }

    const openingFailure = ensureOpeningConstraint(content, styleProfile);
    if (openingFailure) {
      return openingFailure;
    }

    return { ok: true, content };
  } catch {
    return fail(
      "final-draft",
      "DRAFT_GENERATION_FAILED",
      "최종 글 생성에 실패했습니다.",
      true
    );
  }
}

export async function composeReviewDraftStage(
  ai: OpenAI,
  observations: ImageObservation[],
  references: ReferenceSummary[],
  styleProfile: GenerationStyleProfile,
  memo?: string,
  keywords?: string[]
): Promise<
  | {
      ok: true;
      content: string;
      intro: string;
      outro: string;
      imageBlocks: Array<{ url: string; caption: string }>;
    }
  | GenerationFailure
> {
  const observationText = observations
    .map((item, i) => `[이미지 ${i + 1}]\n${item.observation}`)
    .join("\n\n");
  const referenceTexts = references
    .map((r, i) => `[참고 요약 ${i + 1}]\n${r.summary}`)
    .join("\n\n");
  const expectedOpening = getExpectedOpening(styleProfile);
  const requiredCaptionCount = observations.length;
  const openingRule =
    styleProfile.openingMode === "off"
      ? "도입구 강제 규칙은 없습니다."
      : styleProfile.openingMode === "preferred"
      ? `가능하면 intro 첫 줄을 "${expectedOpening ?? ""}"로 시작하세요.`
      : `intro 첫 줄은 반드시 "${expectedOpening ?? ""}"와 정확히 일치해야 합니다.`;
  let rawResponse = "";

  try {
    const response = await ai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            `한국어 리뷰 글을 JSON으로 작성하세요. 형식: {"intro":"", "captions":[""], "outro":""}. 각 필드는 markdown 없이 일반 줄글이어야 하며, 분석 템플릿 라벨(상황/분위기/감정), 목록(-,*), 제목(#)을 포함하면 안 됩니다. 길이 제한은 intro ${REVIEW_INTRO_MAX_CHARS}자 이하, caption ${REVIEW_CAPTION_MAX_CHARS}자 이하, outro ${REVIEW_OUTRO_MAX_CHARS}자 이하입니다. captions 배열 길이는 정확히 ${requiredCaptionCount}개여야 하며 입력 이미지 순서와 1:1 대응해야 합니다. 부족/초과 없이 정확히 ${requiredCaptionCount}개의 caption을 반환하세요. ${openingRule}`,
        },
        {
          role: "user",
          content: `${memo ? `[메모]\n${memo}\n\n` : ""}${
            keywords && keywords.length > 0
              ? `[키워드]\n${keywords.join(", ")}\n\n`
              : ""
          }${observationText}\n\n${referenceTexts}\n\n[작성 규칙]\n- intro, caption, outro는 내부 레이블 없이 자연스러운 문장으로 작성하세요.\n- 관찰 결과를 그대로 복사하지 말고 사용자 글처럼 재구성하세요.\n- captions는 반드시 ${requiredCaptionCount}개를 반환하고, [이미지 1]부터 [이미지 ${requiredCaptionCount}]까지 순서대로 1:1 대응하세요.\n- captions가 부족하거나 초과하면 응답 전에 스스로 보정해 정확히 ${requiredCaptionCount}개로 맞추세요.`,
        },
      ],
      response_format: { type: "json_object" },
      max_tokens: REVIEW_MAX_TOKENS,
    });

    rawResponse = response.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(rawResponse) as {
      intro?: string;
      captions?: string[];
      outro?: string;
    };

    const intro = (parsed.intro ?? "").trim();
    const outro = (parsed.outro ?? "").trim();
    const captions = (parsed.captions ?? []).map((caption) => caption.trim());
    console.info("[composeReviewDraftStage] parsed review response", {
      observationCount: observations.length,
      captionCount: captions.length,
      hasResponseBody: rawResponse.length > 0,
    });

    if (!intro && !outro && captions.length === 0) {
      return fail(
        "final-draft",
        "DRAFT_EMPTY",
        "리뷰 글 생성 결과가 비어 있습니다.",
        true
      );
    }

    if (captions.length !== observations.length) {
      console.warn(
        "[composeReviewDraftStage] caption count mismatch; continue with empty caption fallback",
        {
          observationCount: observations.length,
          captionCount: captions.length,
        }
      );
    }

    const imageBlocks = observations.map((observation, index) => ({
      url: observation.url,
      caption: captions[index] ?? "",
    }));
    const content = [intro, ...imageBlocks.map((b) => b.caption), outro]
      .filter((item) => item.length > 0)
      .join("\n\n");

    const formatFailure = ensureDraftFormat(content);
    if (formatFailure) {
      return formatFailure;
    }

    const lengthViolation = getReviewDraftLengthViolation(
      intro,
      outro,
      imageBlocks.map((block) => block.caption)
    );
    if (lengthViolation) {
      const targetField =
        lengthViolation.field === "caption"
          ? `caption[${(lengthViolation.index ?? 0) + 1}]`
          : lengthViolation.field;
      return fail(
        "final-draft",
        "DRAFT_TOO_LONG",
        `Review draft ${targetField} exceeded ${lengthViolation.max} characters (${lengthViolation.actual}).`,
        true
      );
    }

    const openingFailure = ensureOpeningConstraint(content, styleProfile);
    if (openingFailure) {
      return openingFailure;
    }

    return { ok: true, content, intro, outro, imageBlocks };
  } catch (error) {
    console.error("[composeReviewDraftStage] failed to parse/generate review draft", {
      observationCount: observations.length,
      hasResponseBody: rawResponse.length > 0,
      error: error instanceof Error ? error.message : String(error),
    });
    return fail(
      "final-draft",
      "DRAFT_PARSE_FAILED",
      "리뷰 글 생성 응답을 해석할 수 없습니다.",
      true
    );
  }
}
