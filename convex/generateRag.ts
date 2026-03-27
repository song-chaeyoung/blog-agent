import type { ActionCtx } from "./_generated/server";
import OpenAI from "openai";
import { RAG_MIN_REFERENCES, RAG_SEARCH_LIMIT } from "./constants";
import { internal } from "./_generated/api";
import {
  fail,
  type GenerationFailure,
  type ReferenceSummary,
} from "./generateTypes";
import type { ImageObservation } from "./generateStages";
import type { Id } from "./_generated/dataModel";

export async function buildRagContextStage(
  ctx: ActionCtx,
  ai: OpenAI,
  userId: Id<"users">,
  observations: ImageObservation[]
): Promise<
  | {
      ok: true;
      queryText: string;
      references: ReferenceSummary[];
      selectionReason: string;
    }
  | GenerationFailure
> {
  const queryText = observations
    .map((item, index) => `[이미지 ${index + 1}] ${item.observation}`)
    .join("\n\n")
    .trim();

  if (!queryText) {
    return fail(
      "rag-context",
      "RAG_QUERY_EMPTY",
      "RAG 검색 질의를 만들 수 없습니다.",
      false
    );
  }

  try {
    const embeddingRes = await ai.embeddings.create({
      model: "text-embedding-3-small",
      input: queryText,
    });
    const queryEmbedding = embeddingRes.data[0].embedding;

    const results = await ctx.vectorSearch("posts", "by_embedding", {
      vector: queryEmbedding,
      limit: RAG_SEARCH_LIMIT,
      filter: (q) => q.eq("userId", userId),
    });

    const posts = await ctx.runQuery(internal.generateHelpers.getPostsByIds, {
      ids: results.map((item) => item._id),
    });
    const references: ReferenceSummary[] = [];
    const scoreByPostId = new Map(
      results.map((item) => [item._id, item._score ?? 0] as const)
    );

    for (const post of posts) {
      const summary = post?.summary?.trim();
      if (!post || !summary) {
        continue;
      }
      references.push({
        postId: post._id,
        summary,
        score: scoreByPostId.get(post._id) ?? 0,
      });
    }

    if (references.length < RAG_MIN_REFERENCES) {
      return fail(
        "rag-context",
        "RAG_NOT_ENOUGH_REFERENCES",
        `참조 가능한 요약이 부족합니다. 최소 ${RAG_MIN_REFERENCES}개가 필요합니다.`,
        false
      );
    }

    return {
      ok: true,
      queryText,
      references,
      selectionReason: `${references.length}개의 요약 참조를 선택했습니다.`,
    };
  } catch {
    return fail(
      "rag-context",
      "RAG_BUILD_FAILED",
      "RAG 맥락 구성 중 오류가 발생했습니다.",
      true
    );
  }
}
