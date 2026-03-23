import OpenAI from "openai";
import {
  BATCH_SIZE,
  REVIEW_VISION_MAX_TOKENS,
  VISION_MAX_TOKENS,
} from "./constants";
import { fail, type GenerationFailure } from "./generateTypes";

type AnalyzeMode = "single" | "review";

export type ImageObservation = {
  url: string;
  observation: string;
  position: number;
};

export async function analyzeImagesStage(
  ai: OpenAI,
  imageUrls: string[],
  mode: AnalyzeMode
): Promise<{ ok: true; observations: ImageObservation[] } | GenerationFailure> {
  if (mode === "single") {
    const url = imageUrls[0];
    try {
      const res = await ai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "user",
            content: [
              { type: "image_url", image_url: { url } },
              {
                type: "text",
                text: "이미지의 상황, 분위기, 감정을 블로그 작성을 위한 관찰 정보로 정리해 주세요. 한국어로 답변해 주세요.",
              },
            ],
          },
        ],
        max_tokens: VISION_MAX_TOKENS,
      });

      const observation = (res.choices[0]?.message?.content ?? "").trim();
      if (!observation) {
        return fail(
          "image-analysis",
          "IMAGE_ANALYSIS_EMPTY",
          "이미지 분석 결과가 비어 있습니다.",
          true
        );
      }
      return { ok: true, observations: [{ url, observation, position: 0 }] };
    } catch {
      return fail(
        "image-analysis",
        "IMAGE_ANALYSIS_FAILED",
        "이미지 분석에 실패했습니다.",
        true
      );
    }
  }

  const observations: ImageObservation[] = [];

  for (let i = 0; i < imageUrls.length; i += BATCH_SIZE) {
    const batch = imageUrls.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.all(
      batch.map(async (url, indexInBatch) => {
        try {
          const res = await ai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
              {
                role: "user",
                content: [
                  { type: "image_url", image_url: { url } },
                  {
                    type: "text",
                    text: "이미지의 상황, 분위기, 감정을 블로그 리뷰 작성을 위한 관찰 정보로 정리해 주세요. 한국어로 답변해 주세요.",
                  },
                ],
              },
            ],
            max_tokens: REVIEW_VISION_MAX_TOKENS,
          });
          return {
            ok: true as const,
            value: {
              url,
              observation: (res.choices[0]?.message?.content ?? "").trim(),
              position: i + indexInBatch,
            },
          };
        } catch {
          return { ok: false as const };
        }
      })
    );

    const hasFailure = batchResults.some(
      (result) => !result.ok || (result.ok && !result.value.observation)
    );
    if (hasFailure) {
      return fail(
        "image-analysis",
        "IMAGE_ANALYSIS_PARTIAL_FAILED",
        "리뷰 생성 중 일부 이미지 분석에 실패했습니다.",
        true
      );
    }

    observations.push(
      ...batchResults
        .filter(
          (result): result is { ok: true; value: ImageObservation } =>
            result.ok
        )
        .map((result) => result.value)
    );
  }

  observations.sort((a, b) => a.position - b.position);
  return { ok: true, observations };
}
