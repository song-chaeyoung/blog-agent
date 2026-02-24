import { v } from "convex/values";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import OpenAI from "openai";

const openai = () => new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * 이미지 → Vision 묘사 → Embedding → RAG → 블로그 글 생성
 */
export const createBlogFromImage = action({
  args: { imageUrl: v.string() },
  handler: async (
    ctx,
    args,
  ): Promise<{ content: string; postId: Id<"posts"> }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("인증되지 않은 사용자입니다.");

    const userId = await ctx.runQuery(internal.generateHelpers.getUserId, {
      tokenIdentifier: identity.tokenIdentifier,
    });

    const ai = openai();

    // 1. Vision: 이미지 → 상황 묘사 텍스트
    const visionRes = await ai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: { url: args.imageUrl },
            },
            {
              type: "text",
              text: "이 이미지에 담긴 상황, 분위기, 감정을 자세히 묘사해 주세요. 블로그 글을 쓰기 위한 소재로 사용됩니다. 한국어로 답변해 주세요.",
            },
          ],
        },
      ],
      max_tokens: 500,
    });

    const description = visionRes.choices[0].message.content ?? "";

    // 2. Embedding: 묘사 텍스트 → 벡터
    const embeddingRes = await ai.embeddings.create({
      model: "text-embedding-3-small",
      input: description,
    });

    const embedding = embeddingRes.data[0].embedding;

    // 3. Vector Search: 유사한 내 글 3개 추출
    const searchResults = await ctx.vectorSearch("posts", "by_embedding", {
      vector: embedding,
      limit: 3,
      filter: (q) => q.eq("userId", userId),
    });

    const similarPosts = await ctx.runQuery(
      internal.generateHelpers.getPostsByIds,
      { ids: searchResults.map((r) => r._id) },
    );

    // 4. 블로그 글 생성
    const referenceTexts = similarPosts
      .map((p, i) => `[참고 글 ${i + 1}]\n${p.content}`)
      .join("\n\n");

    const generateRes = await ai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `당신은 사용자의 문체를 학습한 블로그 글 작성 AI입니다.
아래 참고 글들의 문체, 어조, 표현 방식을 분석하여 동일한 스타일로 새 글을 작성하세요.

규칙:
- 마크다운 문법을 사용하지 마세요 (**, ##, - 등 금지)
- 일반 줄글 형식으로 작성하세요
- 참고 글의 문장 종결어미, 문장 길이, 어휘 선택, 구어체 수준을 최대한 따라하세요
- 참고 글에 없는 말투나 표현은 사용하지 마세요

절대 사용 금지 표현 (AI 스타일):
- "~하는 것 같습니다", "~할 수 있습니다", "~하곤 합니다", "~하곤 했습니다"
- "결론적으로", "마지막으로", "종합하면", "무엇보다", "한마디로"
- "다양한", "특별한", "완벽한", "인상적인" 등 과도한 수식어 남발
- "또한", "특히", "더불어", "아울러" 등으로 매 문단 시작하는 것
- 감탄 나열 ("아늑하고 따뜻하며 포근한 분위기")
- 설명조 반복 ("~인데요", "~거든요"를 매 문장 끝에 반복)
- "추천드립니다", "강력 추천", "꼭 방문해 보세요" 같은 광고성 표현`,
        },
        {
          role: "user",
          content: `[이미지 묘사]\n${description}\n\n${referenceTexts}\n\n위 이미지 묘사를 바탕으로, 참고 글들의 문체를 살려 블로그 글을 작성해 주세요.`,
        },
      ],
      max_tokens: 1000,
    });

    const generatedContent = generateRes.choices[0].message.content ?? "";

    // 5. 생성된 글 저장
    const postId = await ctx.runMutation(
      internal.generateHelpers.saveGeneratedPost,
      {
        userId,
        content: generatedContent,
        imageUrl: args.imageUrl,
        embedding,
      },
    );

    return { content: generatedContent, postId };
  },
});

/**
 * 다중 이미지 → 블로그 리뷰 글 생성
 * intro + 이미지별 캡션 + outro 구조
 */
export const createBlogReview = action({
  args: { imageUrls: v.array(v.string()), memo: v.optional(v.string()), keywords: v.optional(v.array(v.string())) },
  handler: async (
    ctx,
    args,
  ): Promise<{
    content: string;
    imageBlocks: Array<{ url: string; caption: string }>;
    intro: string;
    outro: string;
    postId: Id<"posts">;
  }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("인증되지 않은 사용자입니다.");

    const userId = await ctx.runQuery(internal.generateHelpers.getUserId, {
      tokenIdentifier: identity.tokenIdentifier,
    });

    const ai = openai();

    // 1. Vision: 각 이미지 병렬 분석 (5개씩 배치)
    const BATCH_SIZE = 5;
    const visionResults: Array<{
      index: number;
      url: string;
      description: string;
    }> = [];

    for (let i = 0; i < args.imageUrls.length; i += BATCH_SIZE) {
      const batch = args.imageUrls.slice(i, i + BATCH_SIZE);
      const batchResults = await Promise.all(
        batch.map(async (url, batchIdx) => {
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
                      text: "이 이미지에 담긴 상황, 분위기, 감정을 자세히 묘사해 주세요. 블로그 리뷰 글을 쓰기 위한 소재로 사용됩니다. 한국어로 답변해 주세요.",
                    },
                  ],
                },
              ],
              max_tokens: 300,
            });
            return {
              index: i + batchIdx,
              url,
              description: res.choices[0].message.content ?? "",
            };
          } catch {
            return { index: i + batchIdx, url, description: "" };
          }
        }),
      );
      visionResults.push(...batchResults);
    }

    visionResults.sort((a, b) => a.index - b.index);
    const successResults = visionResults.filter((r) => r.description !== "");
    if (successResults.length === 0) {
      throw new Error("모든 이미지 분석에 실패했습니다. 다시 시도해 주세요.");
    }

    // 2. Embedding: 합친 묘사 → 벡터
    const combinedDescription = successResults
      .map((r, i) => `[이미지 ${i + 1}] ${r.description}`)
      .join("\n\n");

    const embeddingRes = await ai.embeddings.create({
      model: "text-embedding-3-small",
      input: combinedDescription,
    });
    const embedding = embeddingRes.data[0].embedding;

    // 3. RAG: 유사한 내 글 검색
    const searchResults = await ctx.vectorSearch("posts", "by_embedding", {
      vector: embedding,
      limit: 3,
      filter: (q) => q.eq("userId", userId),
    });

    const similarPosts = await ctx.runQuery(
      internal.generateHelpers.getPostsByIds,
      { ids: searchResults.map((r) => r._id) },
    );

    const referenceTexts = similarPosts
      .map((p, i) => `[참고 글 ${i + 1}]\n${p.content}`)
      .join("\n\n");

    // 4. 블로그 리뷰 글 생성 (JSON: intro + captions + outro)
    const imageDescriptions = successResults
      .map((r, i) => `[이미지 ${i + 1} 묘사]\n${r.description}`)
      .join("\n\n");

    const generateRes = await ai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `당신은 사용자의 문체를 학습한 블로그 리뷰 글 작성 AI입니다.
아래 참고 글들의 문체, 어조, 표현 방식을 분석하여 동일한 스타일로 새 글을 작성하세요.

규칙:
- 마크다운 문법을 사용하지 마세요 (**, ##, - 등 금지)
- intro: 전체 리뷰 도입부 (2~3문장)
- captions: 각 이미지에 대한 설명 문단 (2~4문장씩)
- outro: 마무리 후기 (2~3문장)
- 전체 글이 하나의 리뷰처럼 자연스럽게 이어져야 합니다
- 참고 글의 문장 종결어미, 문장 길이, 어휘 선택, 구어체 수준을 최대한 따라하세요
- 참고 글에 없는 말투나 표현은 사용하지 마세요
- 반드시 JSON 형식으로 응답하세요

절대 사용 금지 표현 (AI 스타일):
- "~하는 것 같습니다", "~할 수 있습니다", "~하곤 합니다", "~하곤 했습니다"
- "결론적으로", "마지막으로", "종합하면", "무엇보다", "한마디로"
- "다양한", "특별한", "완벽한", "인상적인" 등 과도한 수식어 남발
- "또한", "특히", "더불어", "아울러" 등으로 매 문단 시작하는 것
- 감탄 나열 ("아늑하고 따뜻하며 포근한 분위기")
- 설명조 반복 ("~인데요", "~거든요"를 매 문장 끝에 반복)
- "추천드립니다", "강력 추천", "꼭 방문해 보세요" 같은 광고성 표현

응답 형식:
{
  "intro": "도입부 텍스트",
  "captions": ["이미지1 설명", "이미지2 설명", ...],
  "outro": "마무리 텍스트"
}`,
        },
        {
          role: "user",
          content: `${args.memo ? `[내 메모 - 이 내용을 글에 반드시 반영하세요]\n${args.memo}\n\n` : ""}${args.keywords && args.keywords.length > 0 ? `[SEO 키워드 - 글 전체에 자연스럽게 총 5~6회 녹여서 사용하세요]\n${args.keywords.join(", ")}\n\n` : ""}${imageDescriptions}\n\n${referenceTexts}\n\n위 ${successResults.length}개 이미지 묘사를 바탕으로, 참고 글들의 문체를 살려 블로그 리뷰 글을 작성해 주세요. 반드시 JSON 형식으로 응답하세요.`,
        },
      ],
      max_tokens: 2000,
      response_format: { type: "json_object" },
    });

    const rawJson = generateRes.choices[0].message.content ?? "{}";
    let parsed: { intro?: string; captions?: string[]; outro?: string };
    try {
      parsed = JSON.parse(rawJson);
    } catch {
      throw new Error("AI 응답 파싱에 실패했습니다. 다시 시도해 주세요.");
    }

    const intro = parsed.intro ?? "";
    const captions = parsed.captions ?? [];
    const outro = parsed.outro ?? "";

    // 5. imageBlocks 구성
    const imageBlocks = successResults.map((r, i) => ({
      url: r.url,
      caption: captions[i] ?? "",
    }));

    // 6. content: intro + 캡션들 + outro (RAG/검색용)
    const contentParts: string[] = [];
    if (intro) contentParts.push(intro);
    imageBlocks.forEach((b) => {
      if (b.caption) contentParts.push(b.caption);
    });
    if (outro) contentParts.push(outro);
    const content = contentParts.join("\n\n");

    // 7. 저장
    const postId = await ctx.runMutation(
      internal.generateHelpers.saveGeneratedReviewPost,
      { userId, content, imageBlocks, intro, outro, embedding },
    );

    return { content, imageBlocks, intro, outro, postId };
  },
});
