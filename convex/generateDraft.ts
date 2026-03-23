import OpenAI from "openai";
import { BLOG_MAX_TOKENS, REVIEW_MAX_TOKENS } from "./constants";
import { fail, type GenerationFailure, type ReferenceSummary } from "./generateTypes";
import type { ImageObservation } from "./generateStages";

export async function composeSingleDraftStage(
  ai: OpenAI,
  observation: ImageObservation,
  references: ReferenceSummary[]
): Promise<{ ok: true; content: string } | GenerationFailure> {
  const referenceTexts = references
    .map((r, i) => `[참고 요약 ${i + 1}]\n${r.summary}`)
    .join("\n\n");

  try {
    const response = await ai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "이미지 관찰과 참고 요약을 바탕으로 한국어 블로그 글을 작성해 주세요. 마크다운 없이 일반 줄글로 작성하세요.",
        },
        {
          role: "user",
          content: `[이미지 관찰]\n${observation.observation}\n\n${referenceTexts}`,
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

  try {
    const response = await ai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            '한국어 리뷰 글을 JSON으로 작성하세요. 형식: {"intro":"", "captions":[""], "outro":""}',
        },
        {
          role: "user",
          content: `${memo ? `[메모]\n${memo}\n\n` : ""}${
            keywords && keywords.length > 0
              ? `[키워드]\n${keywords.join(", ")}\n\n`
              : ""
          }${observationText}\n\n${referenceTexts}`,
        },
      ],
      response_format: { type: "json_object" },
      max_tokens: REVIEW_MAX_TOKENS,
    });

    const raw = response.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw) as {
      intro?: string;
      captions?: string[];
      outro?: string;
    };

    const intro = (parsed.intro ?? "").trim();
    const outro = (parsed.outro ?? "").trim();
    const captions = (parsed.captions ?? []).map((caption) => caption.trim());

    if (!intro && !outro && captions.length === 0) {
      return fail(
        "final-draft",
        "DRAFT_EMPTY",
        "리뷰 글 생성 결과가 비어 있습니다.",
        true
      );
    }

    if (captions.length !== observations.length) {
      return fail(
        "final-draft",
        "CAPTION_COUNT_MISMATCH",
        "이미지 수와 캡션 수가 일치하지 않습니다.",
        true
      );
    }

    const imageBlocks = observations.map((observation, index) => ({
      url: observation.url,
      caption: captions[index] ?? "",
    }));
    const content = [intro, ...imageBlocks.map((b) => b.caption), outro]
      .filter((item) => item.length > 0)
      .join("\n\n");

    return { ok: true, content, intro, outro, imageBlocks };
  } catch {
    return fail(
      "final-draft",
      "DRAFT_PARSE_FAILED",
      "리뷰 글 생성 응답을 해석할 수 없습니다.",
      true
    );
  }
}

