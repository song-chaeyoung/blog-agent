// import { v } from "convex/values";
// import { action } from "./_generated/server";
// import { internal } from "./_generated/api";
// import type { Id } from "./_generated/dataModel";
// import OpenAI from "openai";
// import {
//   BATCH_SIZE,
//   BLOG_MAX_TOKENS,
//   RAG_SEARCH_LIMIT,
//   REVIEW_MAX_TOKENS,
//   REVIEW_VISION_MAX_TOKENS,
//   VISION_MAX_TOKENS,
// } from "./constants";

// const openai = () => new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// /**
//  * 이미지 → Vision 묘사 → Embedding → RAG → 블로그 글 생성
//  */
// export const createBlogFromImage = action({
//   args: { imageUrl: v.string() },
//   handler: async (
//     ctx,
//     args,
//   ): Promise<{ content: string; postId: Id<"posts"> }> => {
//     const identity = await ctx.auth.getUserIdentity();
//     if (!identity) throw new Error("인증되지 않은 사용자입니다.");

//     const userId = await ctx.runQuery(internal.generateHelpers.getUserId, {
//       tokenIdentifier: identity.tokenIdentifier,
//     });

//     const ai = openai();

//     // 1. Vision: 이미지 → 상황 묘사 텍스트
//     const visionRes = await ai.chat.completions.create({
//       model: "gpt-4o-mini",
//       messages: [
//         {
//           role: "user",
//           content: [
//             {
//               type: "image_url",
//               image_url: { url: args.imageUrl },
//             },
//             {
//               type: "text",
//               text: "이 이미지에 담긴 상황, 분위기, 감정을 자세히 묘사해 주세요. 블로그 글을 쓰기 위한 소재로 사용됩니다. 한국어로 답변해 주세요.",
//             },
//           ],
//         },
//       ],
//       max_tokens: VISION_MAX_TOKENS,
//     });

//     const description = visionRes.choices[0].message.content ?? "";

//     // 2. Embedding: 묘사 텍스트 → 벡터
//     const embeddingRes = await ai.embeddings.create({
//       model: "text-embedding-3-small",
//       input: description,
//     });

//     const embedding = embeddingRes.data[0].embedding;

//     // 3. Vector Search: 유사한 내 글 3개 추출
//     const searchResults = await ctx.vectorSearch("posts", "by_embedding", {
//       vector: embedding,
//       limit: RAG_SEARCH_LIMIT,
//       filter: (q) => q.eq("userId", userId),
//     });

//     const similarPosts = await ctx.runQuery(
//       internal.generateHelpers.getPostsByIds,
//       { ids: searchResults.map((r) => r._id) },
//     );

//     // 4. 블로그 글 생성
//     const referenceTexts = similarPosts
//       .map((p, i) => `[참고 글 ${i + 1}]\n${p.content}`)
//       .join("\n\n");

//     const generateRes = await ai.chat.completions.create({
//       model: "gpt-4o",
//       messages: [
//         {
//           role: "system",
//           content: `사용자의 문체를 학습한 블로그 글 작성 AI입니다. 참고 글의 문체·어조·종결어미·구어체 수준을 그대로 따라 일반 줄글로 작성하세요. 마크다운 금지.
// 금지: AI 투 어미(~것 같습니다/~할 수 있습니다), 접속사로 문단 시작(또한/특히/더불어), 과도한 수식어(다양한/특별한/완벽한), 광고성 표현(추천드립니다/꼭 방문해 보세요), 감탄 나열, ~인데요/~거든요 반복.`,
//         },
//         {
//           role: "user",
//           content: `[이미지 묘사]\n${description}\n\n${referenceTexts}\n\n위 이미지 묘사를 바탕으로, 참고 글들의 문체를 살려 블로그 글을 작성해 주세요.`,
//         },
//       ],
//       max_tokens: BLOG_MAX_TOKENS,
//     });

//     const generatedContent = generateRes.choices[0].message.content ?? "";

//     // 5. 생성된 글 저장
//     const postId = await ctx.runMutation(
//       internal.generateHelpers.saveGeneratedPost,
//       {
//         userId,
//         content: generatedContent,
//         imageUrl: args.imageUrl,
//         embedding,
//       },
//     );

//     return { content: generatedContent, postId };
//   },
// });

// /**
//  * 다중 이미지 → 블로그 리뷰 글 생성
//  * intro + 이미지별 캡션 + outro 구조
//  */
// export const createBlogReview = action({
//   args: { imageUrls: v.array(v.string()), memo: v.optional(v.string()), keywords: v.optional(v.array(v.string())) },
//   handler: async (
//     ctx,
//     args,
//   ): Promise<{
//     content: string;
//     imageBlocks: Array<{ url: string; caption: string }>;
//     intro: string;
//     outro: string;
//     postId: Id<"posts">;
//   }> => {
//     const identity = await ctx.auth.getUserIdentity();
//     if (!identity) throw new Error("인증되지 않은 사용자입니다.");

//     const userId = await ctx.runQuery(internal.generateHelpers.getUserId, {
//       tokenIdentifier: identity.tokenIdentifier,
//     });

//     const ai = openai();

//     // 1. Vision: 각 이미지 병렬 분석 (BATCH_SIZE개씩 배치)
//     const visionResults: Array<{
//       index: number;
//       url: string;
//       description: string;
//     }> = [];

//     for (let i = 0; i < args.imageUrls.length; i += BATCH_SIZE) {
//       const batch = args.imageUrls.slice(i, i + BATCH_SIZE);
//       const batchResults = await Promise.all(
//         batch.map(async (url, batchIdx) => {
//           try {
//             const res = await ai.chat.completions.create({
//               model: "gpt-4o-mini",
//               messages: [
//                 {
//                   role: "user",
//                   content: [
//                     { type: "image_url", image_url: { url } },
//                     {
//                       type: "text",
//                       text: "이 이미지에 담긴 상황, 분위기, 감정을 자세히 묘사해 주세요. 블로그 리뷰 글을 쓰기 위한 소재로 사용됩니다. 한국어로 답변해 주세요.",
//                     },
//                   ],
//                 },
//               ],
//               max_tokens: REVIEW_VISION_MAX_TOKENS,
//             });
//             return {
//               index: i + batchIdx,
//               url,
//               description: res.choices[0].message.content ?? "",
//             };
//           } catch {
//             return { index: i + batchIdx, url, description: "" };
//           }
//         }),
//       );
//       visionResults.push(...batchResults);
//     }

//     visionResults.sort((a, b) => a.index - b.index);
//     const successResults = visionResults.filter((r) => r.description !== "");
//     if (successResults.length === 0) {
//       throw new Error("모든 이미지 분석에 실패했습니다. 다시 시도해 주세요.");
//     }

//     // 2. Embedding: 합친 묘사 → 벡터
//     const combinedDescription = successResults
//       .map((r, i) => `[이미지 ${i + 1}] ${r.description}`)
//       .join("\n\n");

//     const embeddingRes = await ai.embeddings.create({
//       model: "text-embedding-3-small",
//       input: combinedDescription,
//     });
//     const embedding = embeddingRes.data[0].embedding;

//     // 3. RAG: 유사한 내 글 검색
//     const searchResults = await ctx.vectorSearch("posts", "by_embedding", {
//       vector: embedding,
//       limit: RAG_SEARCH_LIMIT,
//       filter: (q) => q.eq("userId", userId),
//     });

//     const similarPosts = await ctx.runQuery(
//       internal.generateHelpers.getPostsByIds,
//       { ids: searchResults.map((r) => r._id) },
//     );

//     const referenceTexts = similarPosts
//       .map((p, i) => `[참고 글 ${i + 1}]\n${p.content}`)
//       .join("\n\n");

//     // 4. 블로그 리뷰 글 생성 (JSON: intro + captions + outro)
//     const imageDescriptions = successResults
//       .map((r, i) => `[이미지 ${i + 1} 묘사]\n${r.description}`)
//       .join("\n\n");

//     const generateRes = await ai.chat.completions.create({
//       model: "gpt-4o",
//       messages: [
//         {
//           role: "system",
//           content: `사용자의 문체를 학습한 블로그 리뷰 글 작성 AI입니다. 참고 글의 문체·어조·종결어미·구어체 수준을 그대로 따라 작성하세요. 마크다운 금지.
// 금지: AI 투 어미(~것 같습니다/~할 수 있습니다), 접속사로 문단 시작(또한/특히/더불어), 과도한 수식어(다양한/특별한/완벽한), 광고성 표현(추천드립니다/꼭 방문해 보세요), 감탄 나열, ~인데요/~거든요 반복.
// 반드시 JSON으로 응답: {"intro":"도입부(2~3문장)","captions":["이미지별 설명(2~4문장)"],"outro":"마무리(2~3문장)"}`,
//         },
//         {
//           role: "user",
//           content: `${args.memo ? `[내 메모 - 이 내용을 글에 반드시 반영하세요]\n${args.memo}\n\n` : ""}${args.keywords && args.keywords.length > 0 ? `[SEO 키워드 - 글 전체에 자연스럽게 총 5~6회 녹여서 사용하세요]\n${args.keywords.join(", ")}\n\n` : ""}${imageDescriptions}\n\n${referenceTexts}\n\n위 ${successResults.length}개 이미지 묘사를 바탕으로, 참고 글들의 문체를 살려 블로그 리뷰 글을 작성해 주세요. 반드시 JSON 형식으로 응답하세요.`,
//         },
//       ],
//       max_tokens: REVIEW_MAX_TOKENS,
//       response_format: { type: "json_object" },
//     });

//     const rawJson = generateRes.choices[0].message.content ?? "{}";
//     let parsed: { intro?: string; captions?: string[]; outro?: string };
//     try {
//       parsed = JSON.parse(rawJson);
//     } catch {
//       throw new Error("AI 응답 파싱에 실패했습니다. 다시 시도해 주세요.");
//     }

//     const intro = parsed.intro ?? "";
//     const captions = parsed.captions ?? [];
//     const outro = parsed.outro ?? "";

//     if (!intro && captions.length === 0 && !outro) {
//       throw new Error("AI가 빈 응답을 반환했습니다. 다시 시도해 주세요.");
//     }

//     // 5. imageBlocks 구성
//     const imageBlocks = successResults.map((r, i) => ({
//       url: r.url,
//       caption: captions[i] ?? "",
//     }));

//     // 6. content: intro + 캡션들 + outro (RAG/검색용)
//     const contentParts: string[] = [];
//     if (intro) contentParts.push(intro);
//     imageBlocks.forEach((b) => {
//       if (b.caption) contentParts.push(b.caption);
//     });
//     if (outro) contentParts.push(outro);
//     const content = contentParts.join("\n\n");

//     // 7. 저장
//     const postId = await ctx.runMutation(
//       internal.generateHelpers.saveGeneratedReviewPost,
//       { userId, content, imageBlocks, intro, outro, embedding },
//     );

//     return { content, imageBlocks, intro, outro, postId };
//   },
// });

import { v } from "convex/values";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import OpenAI from "openai";
import {
  BATCH_SIZE,
  BLOG_MAX_TOKENS,
  RAG_SEARCH_LIMIT,
  REVIEW_MAX_TOKENS,
  REVIEW_VISION_MAX_TOKENS,
  VISION_MAX_TOKENS,
} from "./constants";

const STYLE_REFERENCE_LIMIT = 3; // 문체 참고용 최근 글 수

const openai = () => new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * 이미지 → Vision 묘사 → Embedding → RAG(내용) + 최근글(문체) → 블로그 글 생성
 */
export const createBlogFromImage = action({
  args: { imageUrl: v.string() },
  handler: async (
    ctx,
    args,
  ): Promise<{ content: string; postId: Id<"posts"> }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("인증되지 않은 사용자입니다.");

    // 1. 사용자 프로필 조회 (문체 고도화용)
    const user = await ctx.runQuery(internal.generateHelpers.getUserProfile, {
      tokenIdentifier: identity.tokenIdentifier,
    });
    if (!user) throw new Error("사용자를 찾을 수 없습니다.");
    const userId = user._id;

    const ai = openai();

    // 2. Vision: 이미지 → 묘사 텍스트
    const visionRes = await ai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "user",
          content: [
            { type: "image_url", image_url: { url: args.imageUrl } },
            {
              type: "text",
              text: "이 이미지에 담긴 상황, 분위기, 감정을 자세히 묘사해 주세요. 블로그 글을 쓰기 위한 소재로 사용됩니다. 한국어로 답변해 주세요.",
            },
          ],
        },
      ],
      max_tokens: VISION_MAX_TOKENS,
    });

    const description = visionRes.choices[0].message.content ?? "";

    // 3. Embedding 생성 + 문체용 최근 글 조회 (병렬)
    // 💡 styleProfile이 있으면 최근 글 본문 조회는 Skip하여 비용/속도 최적화
    const [embeddingRes, recentPosts] = await Promise.all([
      ai.embeddings.create({
        model: "text-embedding-3-small",
        input: description,
      }),
      !user.styleProfile
        ? ctx.runQuery(internal.generateHelpers.getRecentPosts, {
            userId,
            limit: STYLE_REFERENCE_LIMIT,
          })
        : Promise.resolve([]),
    ]);

    const embedding = embeddingRes.data[0].embedding;

    // 4. RAG: 이미지와 유사한 글 검색 (내용 참고용)
    const searchResults = await ctx.vectorSearch("posts", "by_embedding", {
      vector: embedding,
      limit: RAG_SEARCH_LIMIT,
      filter: (q) => q.eq("userId", userId),
    });

    const similarPosts = await ctx.runQuery(
      internal.generateHelpers.getPostsByIds,
      { ids: searchResults.map((r) => r._id) },
    );

    // 5. 참고 텍스트 로딩 (캐싱 반영)
    const styleReference = user.styleProfile
      ? `[사용자 문체 가이드]\n${user.styleProfile}`
      : recentPosts
          .map((p, i) => `[문체 참고 ${i + 1}]\n${p.content}`)
          .join("\n\n");

    const contentReference = similarPosts
      .map((p, i) => `[내용 참고 ${i + 1}]\n${p.summary ?? p.content}`) // 💡 본문 대신 요약본 활용
      .join("\n\n");

    // 6. 블로그 글 및 요약 생성 (JSON 포맷 강제)
    const generateRes = await ai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `사용자의 문체를 학습한 블로그 글 작성 AI입니다. 일반 줄글로 작성하며 마크다운을 금지합니다.
금지: AI 투 어미(~것 같습니다), 접속사로 문단 시작(또한/특히), 광고성 표현(추천드립니다).
반드시 JSON 형식으로 응답하세요: {"content": "블로그 본문 내용(줄글)", "summary": "이 글의 핵심 내용 2줄 요약"}`,
        },
        {
          role: "user",
          content: `[문체 참고 - 아래 가이드나 습관을 절대 따르세요]\n${styleReference}\n\n[내용 참고 - 소재나 표현만 참고하되 그대로 쓰지 마세요]\n${contentReference}\n\n[이미지 묘사]\n${description}\n\n위 이미지 묘사를 바탕으로 블로그 글을 작성해 주세요. 반드시 JSON 구조로 응답하세요.`,
        },
      ],
      max_tokens: BLOG_MAX_TOKENS,
      response_format: { type: "json_object" },
    });

    const rawJson = generateRes.choices[0].message.content ?? "{}";
    let parsed: { content?: string; summary?: string } = {};
    try {
      parsed = JSON.parse(rawJson);
    } catch {
      parsed = { content: rawJson, summary: "" };
    }

    const generatedContent = parsed.content ?? "";
    const summary = parsed.summary ?? "";

    // 7. 저장
    const postId = await ctx.runMutation(
      internal.generateHelpers.saveGeneratedPost,
      {
        userId,
        content: generatedContent,
        imageUrl: args.imageUrl,
        embedding,
        summary: summary || undefined, // 요약 저장
      },
    );

    // 💡 백그라운드 문체 분석 자동 트리거 (프로필이 없었던 무주공산인 경우)
    if (!user.styleProfile) {
      // @ts-expect-error : Convex dev 빌드 전 타입 미생성으로 인한 경고 우회
      ctx.runAction(internal.generate.analyzeUserStyle, { userId }).catch(() => {});
    }

    return { content: generatedContent, postId };
  },
});

/**
 * 다중 이미지 → Vision 묘사 → Embedding → RAG(내용) + 최근글(문체) → 블로그 리뷰 글 생성
 * intro + 이미지별 캡션 + outro 구조
 */
export const createBlogReview = action({
  args: {
    imageUrls: v.array(v.string()),
    memo: v.optional(v.string()),
    keywords: v.optional(v.array(v.string())),
  },
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

    // 1. 사용자 프로필 조회 (문체 고도화용)
    const user = await ctx.runQuery(internal.generateHelpers.getUserProfile, {
      tokenIdentifier: identity.tokenIdentifier,
    });
    if (!user) throw new Error("사용자를 찾을 수 없습니다.");
    const userId = user._id;

    const ai = openai();

    // 2. Vision: 각 이미지 병렬 분석 (BATCH_SIZE개씩 배치) + 문체용 데이터 수집 (병렬)
    const visionResultsRaw: Array<{
      index: number;
      url: string;
      description: string;
    }> = [];

    const [, recentPosts] = await Promise.all([
      (async () => {
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
                  max_tokens: REVIEW_VISION_MAX_TOKENS,
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
          visionResultsRaw.push(...batchResults);
        }
      })(),
      !user.styleProfile
        ? ctx.runQuery(internal.generateHelpers.getRecentPosts, {
            userId,
            limit: STYLE_REFERENCE_LIMIT,
          })
        : Promise.resolve([]),
    ]);

    visionResultsRaw.sort((a, b) => a.index - b.index);
    const successResults = visionResultsRaw.filter((r) => r.description !== "");
    if (successResults.length === 0) {
      throw new Error("모든 이미지 분석에 실패했습니다. 다시 시도해 주세요.");
    }

    // 3. Embedding: 합친 묘사 → 벡터
    const combinedDescription = successResults
      .map((r, i) => `[이미지 ${i + 1}] ${r.description}`)
      .join("\n\n");

    const embeddingRes = await ai.embeddings.create({
      model: "text-embedding-3-small",
      input: combinedDescription,
    });
    const embedding = embeddingRes.data[0].embedding;

    // 4. RAG: 이미지와 유사한 글 검색 (내용 참고용)
    const searchResults = await ctx.vectorSearch("posts", "by_embedding", {
      vector: embedding,
      limit: RAG_SEARCH_LIMIT,
      filter: (q) => q.eq("userId", userId),
    });

    const similarPosts = await ctx.runQuery(
      internal.generateHelpers.getPostsByIds,
      { ids: searchResults.map((r) => r._id) },
    );

    // 5. 참고 텍스트 로딩 (캐싱 반영)
    const styleReference = user.styleProfile
      ? `[사용자 문체 가이드]\n${user.styleProfile}`
      : recentPosts
          .map((p, i) => `[문체 참고 ${i + 1}]\n${p.content}`)
          .join("\n\n");

    const contentReference = similarPosts
      .map((p, i) => `[내용 참고 ${i + 1}]\n${p.summary ?? p.content}`) // 💡 본문 대신 요약본 활용
      .join("\n\n");

    const imageDescriptions = successResults
      .map((r, i) => `[이미지 ${i + 1} 묘사]\n${r.description}`)
      .join("\n\n");

    const memoSection = args.memo
      ? `[내 메모 - 이 내용을 글에 반드시 반영하세요]\n${args.memo}\n\n`
      : "";

    const keywordsSection =
      args.keywords && args.keywords.length > 0
        ? `[SEO 키워드 - 글 전체에 자연스럽게 사용하세요]\n${args.keywords.join(", ")}\n\n`
        : "";

    // 6. 블로그 리뷰 글 생성 (JSON 포맷 강제)
    const generateRes = await ai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `사용자의 문체를 학습한 블로그 리뷰 글 작성 AI입니다. 마크다운을 금지합니다.
금지 어휘: AI 투 어미(~것 같습니다), 접속사 남용(또한/특히), 광고성 표현(추천드립니다).
반드시 JSON 구조로 응답하세요: {"intro":"도입부","captions":["이미지별 설명"],"outro":"마무리","summary":"이 리뷰 전체의 핵심 2줄 요약"}`,
        },
        {
          role: "user",
          content: `[문체 가이드]\n${styleReference}\n\n[내용 참고]\n${contentReference}\n\n${memoSection}${keywordsSection}${imageDescriptions}\n\n위 자료를 바탕으로 리뷰 글을 작성해 주세요. 반드시 JSON 형태로 응답하세요.`,
        },
      ],
      max_tokens: REVIEW_MAX_TOKENS,
      response_format: { type: "json_object" },
    });

    const rawJson = generateRes.choices[0].message.content ?? "{}";
    let parsed: { intro?: string; captions?: string[]; outro?: string; summary?: string } = {};
    try {
      parsed = JSON.parse(rawJson);
    } catch {
      parsed = {};
    }

    const intro = parsed.intro ?? "";
    const captions = parsed.captions ?? [];
    const outro = parsed.outro ?? "";
    const summary = parsed.summary ?? "";

    if (!intro && captions.length === 0 && !outro) {
      throw new Error("AI가 빈 응답을 반환했습니다. 다시 시도해 주세요.");
    }

    // 5. imageBlocks 구성
    const imageBlocks = successResults.map((r, i) => ({
      url: r.url,
      caption: captions[i] ?? "",
    }));

    // 6. content 조합 (RAG/검색용)
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
      {
        userId,
        content,
        imageBlocks,
        intro,
        outro,
        embedding,
        summary: summary || undefined, // 요약 저장
      },
    );

    // 💡 백그라운드 문체 분석 자동 트리거 (프로필이 없었던 경우)
    if (!user.styleProfile) {
      // @ts-expect-error : Convex dev 빌드 전 타입 미생성으로 인한 경고 우회
      ctx.runAction(internal.generate.analyzeUserStyle, { userId }).catch(() => {});
    }

    return { content, imageBlocks, intro, outro, postId };
  },
});

/**
 * 사용자의 최근 글을 분석하여 문체 프로필을 갱신합니다.
 */
export const analyzeUserStyle = action({
  args: { userId: v.id("users") },
  handler: async (ctx, args): Promise<string> => {
    const ai = openai();

    // 1. 최근 글 조회 (최대 5개)
    const recentPosts = await ctx.runQuery(internal.generateHelpers.getRecentPosts, {
      userId: args.userId,
      limit: 5,
    });

    if (recentPosts.length === 0) {
      return "분석할 글이 없습니다.";
    }

    const combinedContent = recentPosts
      .map((p, i) => `[글 ${i + 1}]\n${p.content}`)
      .join("\n\n");

    // 2. 문체 분석 요청 (GPT-4o-mini 등 활용)
    const response = await ai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `사용자의 글들을 분석하여 '문체 가이드라인'을 작성하는 AI입니다. 
주제(내용)는 무시하고 **어투, 종결어미 패턴, 이모지 사용 습관, 서두/결론 습관, 문장 길이 및 호흡** 등 '형식과 스타일'만 150자 내외로 명확히 추출하세요.`,
        },
        {
          role: "user",
          content: `[분석할 글 목록]\n${combinedContent}\n\n위 글들을 바탕으로 이 사용자의 문체 가이드라인을 한 문단으로 명확히 요약해 주세요.`,
        },
      ],
      max_tokens: 300,
    });

    const styleProfile = response.choices[0].message.content ?? "";

    // 3. DB 저장
    await ctx.runMutation(internal.generateHelpers.updateStyleProfile, {
      userId: args.userId,
      styleProfile,
    });

    return styleProfile;
  },
});
