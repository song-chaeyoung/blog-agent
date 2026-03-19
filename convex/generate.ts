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

const STYLE_REFERENCE_LIMIT = 3;
const RAG_TOP_K = 3;

const STYLE_REFERENCE_CHAR_LIMIT = 1400;
const RAG_REFERENCE_ITEM_CHAR_LIMIT = 320;
const RAG_REFERENCE_CHAR_LIMIT = 2200;
const IMAGE_DESCRIPTION_CHAR_LIMIT = 500;
const IMAGE_SUMMARY_CHAR_LIMIT = 180;
const IMAGE_SUMMARY_BLOCK_CHAR_LIMIT = 2200;
const MEMO_CHAR_LIMIT = 500;
const KEYWORDS_CHAR_LIMIT = 300;
const OUTLINE_INPUT_CHAR_LIMIT = 5600;
const FINAL_INPUT_CHAR_LIMIT = 3600;
const SUMMARY_CHAR_LIMIT = 260;

const openai = () => new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

type PostLike = {
  content: string;
  summary?: string;
};

type VisionResult = {
  index: number;
  url: string;
  description: string;
};

type ReviewVisionDigest = {
  images: Array<{
    index: number;
    summary: string;
    keywords: string[];
    mood: string;
  }>;
  keyPoints: string[];
  moodLine: string;
  ragQuery: string;
};

type SingleVisionDigest = {
  summary: string;
  keywords: string[];
  moodLine: string;
  ragQuery: string;
};

type ReviewOutline = {
  introOutline: string;
  captionOutlines: string[];
  outroOutline: string;
};

type ReviewFinal = {
  intro: string;
  captions: string[];
  outro: string;
  summary: string;
};

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function clipText(value: string, limit: number): string {
  const normalized = normalizeWhitespace(value);
  if (normalized.length <= limit) return normalized;
  return `${normalized.slice(0, Math.max(0, limit - 1))}…`;
}

function getMessageText(
  completion: OpenAI.Chat.Completions.ChatCompletion,
): string {
  const message = completion.choices[0]?.message?.content;
  if (!message) return "";
  if (typeof message === "string") return message.trim();
  return "";
}

function parseJsonObject<T extends Record<string, unknown>>(
  raw: string,
  fallback: T,
): T {
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as T;
    }
    return fallback;
  } catch {
    return fallback;
  }
}

function sanitizeStringArray(
  values: unknown,
  maxLengthPerItem: number,
): string[] {
  if (!Array.isArray(values)) return [];
  return values
    .map((item) =>
      typeof item === "string" ? clipText(item, maxLengthPerItem) : "",
    )
    .filter((item) => item !== "");
}

function textOrEmpty(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return "";
  return clipText(value, maxLength);
}

function buildStyleReference(
  styleProfile: string | undefined,
  recentPosts: PostLike[],
): string {
  if (styleProfile) {
    return clipText(styleProfile, STYLE_REFERENCE_CHAR_LIMIT);
  }

  const samples = recentPosts
    .map((post, i) => {
      const sample = post.summary
        ? clipText(post.summary, RAG_REFERENCE_ITEM_CHAR_LIMIT)
        : clipText(post.content, RAG_REFERENCE_ITEM_CHAR_LIMIT);
      return `[style sample ${i + 1}] ${sample}`;
    })
    .join("\n");

  if (!samples) {
    return "Use a personal and natural diary-like tone. Keep wording simple and concrete.";
  }

  return clipText(samples, STYLE_REFERENCE_CHAR_LIMIT);
}

function buildRagReference(posts: PostLike[]): string {
  const references = posts
    .slice(0, RAG_TOP_K)
    .map((post, i) => {
      const summary = post.summary
        ? clipText(post.summary, RAG_REFERENCE_ITEM_CHAR_LIMIT)
        : clipText(post.content, RAG_REFERENCE_ITEM_CHAR_LIMIT);
      return `[related ${i + 1}] ${summary}`;
    })
    .join("\n");

  return clipText(references, RAG_REFERENCE_CHAR_LIMIT);
}

function joinOptionalParts(parts: Array<string | undefined>): string {
  return parts
    .map((part) => (part ? normalizeWhitespace(part) : ""))
    .filter((part) => part !== "")
    .join("\n\n");
}

function normalizeCaptions(
  imageCount: number,
  generated: string[],
  outline: string[],
  imageFallbacks: string[],
): string[] {
  return Array.from({ length: imageCount }, (_, index) => {
    const primary = generated[index] ?? "";
    const backupOutline = outline[index] ?? "";
    const backupImage = imageFallbacks[index] ?? "";
    const selected = primary || backupOutline || backupImage;
    return clipText(selected, 320);
  });
}

async function analyzeImages(
  ai: OpenAI,
  imageUrls: string[],
): Promise<VisionResult[]> {
  const visionResults: VisionResult[] = [];

  for (let start = 0; start < imageUrls.length; start += BATCH_SIZE) {
    const batch = imageUrls.slice(start, start + BATCH_SIZE);
    const batchResults = await Promise.all(
      batch.map(async (url, batchIndex) => {
        try {
          const response = await ai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
              {
                role: "user",
                content: [
                  { type: "image_url", image_url: { url } },
                  {
                    type: "text",
                    text: "Describe this image for blog writing. Focus on scene, mood, key objects, and useful details in 3-5 short sentences. Write in Korean.",
                  },
                ],
              },
            ],
            max_tokens: REVIEW_VISION_MAX_TOKENS,
          });

          return {
            index: start + batchIndex,
            url,
            description: clipText(
              getMessageText(response),
              IMAGE_DESCRIPTION_CHAR_LIMIT,
            ),
          };
        } catch {
          return { index: start + batchIndex, url, description: "" };
        }
      }),
    );

    visionResults.push(...batchResults);
  }

  visionResults.sort((a, b) => a.index - b.index);
  return visionResults.filter((item) => item.description !== "");
}

async function summarizeReviewVision(
  ai: OpenAI,
  visionResults: VisionResult[],
): Promise<ReviewVisionDigest> {
  const visionPayload = visionResults
    .map(
      (item, i) =>
        `[image ${i + 1}]\n${clipText(item.description, IMAGE_DESCRIPTION_CHAR_LIMIT)}`,
    )
    .join("\n\n");

  const response = await ai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content:
          'You compress vision notes for downstream RAG and writing. Return strict JSON with this shape: {"images":[{"index":1,"summary":"...","keywords":["..."],"mood":"..."}],"keyPoints":["..."],"moodLine":"...","ragQuery":"..."}. All textual values must be in Korean.',
      },
      {
        role: "user",
        content:
          `Summarize the image notes below.\n` +
          `Rules:\n` +
          `1) Keep each images[].summary to 1-2 sentences.\n` +
          `2) Keep images[].keywords to 3-5 short tokens.\n` +
          `3) keyPoints must contain 4-6 concise bullets.\n` +
          `4) ragQuery must be one compact paragraph for vector search.\n` +
          `5) Preserve chronology by image index.\n` +
          `6) Every textual field must be Korean.\n\n` +
          `${visionPayload}`,
      },
    ],
    max_tokens: 900,
    response_format: { type: "json_object" },
  });

  const fallback: ReviewVisionDigest = {
    images: visionResults.map((item) => ({
      index: item.index + 1,
      summary: clipText(item.description, IMAGE_SUMMARY_CHAR_LIMIT),
      keywords: [],
      mood: "",
    })),
    keyPoints: [],
    moodLine: "",
    ragQuery: clipText(
      visionResults.map((item) => item.description).join(" "),
      IMAGE_SUMMARY_BLOCK_CHAR_LIMIT,
    ),
  };

  const parsed = parseJsonObject<Record<string, unknown>>(
    getMessageText(response),
    {},
  );
  const imagesRaw = Array.isArray(parsed.images) ? parsed.images : [];
  const images = imagesRaw
    .map((item, idx) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return null;
      const record = item as Record<string, unknown>;
      const summary = textOrEmpty(record.summary, IMAGE_SUMMARY_CHAR_LIMIT);
      return {
        index:
          typeof record.index === "number"
            ? Math.max(1, Math.floor(record.index))
            : idx + 1,
        summary,
        keywords: sanitizeStringArray(record.keywords, 24).slice(0, 5),
        mood: textOrEmpty(record.mood, 80),
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);

  const mergedImages = visionResults.map((item, idx) => {
    const fromModel = images.find((digest) => digest.index === idx + 1);
    return {
      index: idx + 1,
      summary:
        fromModel?.summary ||
        clipText(item.description, IMAGE_SUMMARY_CHAR_LIMIT),
      keywords: fromModel?.keywords ?? [],
      mood: fromModel?.mood ?? "",
    };
  });

  const keyPoints = sanitizeStringArray(parsed.keyPoints, 120).slice(0, 6);
  const moodLine = textOrEmpty(parsed.moodLine, 160);
  const ragQuery = textOrEmpty(parsed.ragQuery, IMAGE_SUMMARY_BLOCK_CHAR_LIMIT);

  return {
    images: mergedImages,
    keyPoints: keyPoints.length > 0 ? keyPoints : fallback.keyPoints,
    moodLine: moodLine || fallback.moodLine,
    ragQuery: ragQuery || fallback.ragQuery,
  };
}

async function summarizeSingleVision(
  ai: OpenAI,
  description: string,
): Promise<SingleVisionDigest> {
  const response = await ai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content:
          'Return strict JSON for single-image compression: {"summary":"...","keywords":["..."],"moodLine":"...","ragQuery":"..."}. All textual values must be in Korean.',
      },
      {
        role: "user",
        content:
          `Summarize this vision note for style-preserving blog generation and vector search.\n` +
          `summary must be 2-3 sentences.\n` +
          `keywords must contain 5-8 words.\n` +
          `ragQuery must be one compact paragraph.\n` +
          `All textual values must be Korean.\n\n` +
          `${clipText(description, IMAGE_DESCRIPTION_CHAR_LIMIT)}`,
      },
    ],
    max_tokens: 350,
    response_format: { type: "json_object" },
  });

  const parsed = parseJsonObject<Record<string, unknown>>(
    getMessageText(response),
    {},
  );
  return {
    summary: textOrEmpty(parsed.summary, 260) || clipText(description, 260),
    keywords: sanitizeStringArray(parsed.keywords, 24).slice(0, 8),
    moodLine: textOrEmpty(parsed.moodLine, 120),
    ragQuery: textOrEmpty(parsed.ragQuery, 900) || clipText(description, 900),
  };
}

async function buildReviewOutline(
  ai: OpenAI,
  input: {
    styleReference: string;
    imageDigest: string;
    ragReference: string;
    imageCount: number;
    memo: string;
    keywords: string;
  },
): Promise<ReviewOutline> {
  const prompt = clipText(
    [
      `[style guide]\n${input.styleReference}`,
      `[image digest]\n${input.imageDigest}`,
      input.ragReference ? `[related notes]\n${input.ragReference}` : "",
      input.memo ? `[memo]\n${input.memo}` : "",
      input.keywords ? `[keywords]\n${input.keywords}` : "",
      `Create an outline for ${input.imageCount} images.`,
    ]
      .filter((section) => section !== "")
      .join("\n\n"),
    OUTLINE_INPUT_CHAR_LIMIT,
  );

  const response = await ai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content:
          'Return strict JSON: {"introOutline":"...","captionOutlines":["..."],"outroOutline":"..."}. All textual values must be in Korean.',
      },
      {
        role: "user",
        content:
          `${prompt}\n\n` +
          `Rules:\n` +
          `1) captionOutlines length must be exactly ${input.imageCount}.\n` +
          `2) Each caption outline should be one concise sentence.\n` +
          `3) Focus on flow and talking points only, not full prose.\n` +
          `4) Use the same language as the style guide.\n` +
          `5) Output only Korean text.`,
      },
    ],
    max_tokens: 1000,
    response_format: { type: "json_object" },
  });

  const parsed = parseJsonObject<Record<string, unknown>>(
    getMessageText(response),
    {},
  );
  const outlines = sanitizeStringArray(parsed.captionOutlines, 180);
  return {
    introOutline: textOrEmpty(parsed.introOutline, 320),
    captionOutlines: outlines,
    outroOutline: textOrEmpty(parsed.outroOutline, 320),
  };
}

async function buildReviewFinal(
  ai: OpenAI,
  input: {
    styleReference: string;
    imageDigest: string;
    ragReference: string;
    outline: ReviewOutline;
    imageCount: number;
    memo: string;
    keywords: string;
  },
): Promise<ReviewFinal> {
  const outlineText = JSON.stringify(input.outline);
  const userPayload = clipText(
    [
      `[style guide]\n${input.styleReference}`,
      `[outline]\n${outlineText}`,
      `[image digest]\n${input.imageDigest}`,
      input.ragReference ? `[related notes]\n${input.ragReference}` : "",
      input.memo ? `[memo]\n${input.memo}` : "",
      input.keywords ? `[keywords]\n${input.keywords}` : "",
      `Write a review post for exactly ${input.imageCount} images.`,
    ]
      .filter((section) => section !== "")
      .join("\n\n"),
    FINAL_INPUT_CHAR_LIMIT,
  );

  const response = await ai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content:
          'Return strict JSON: {"intro":"...","captions":["..."],"outro":"...","summary":"..."}. All textual values must be in Korean.',
      },
      {
        role: "user",
        content:
          `${userPayload}\n\n` +
          `Rules:\n` +
          `1) Follow the style guide closely.\n` +
          `2) captions length must be exactly ${input.imageCount}.\n` +
          `3) Keep each caption to 1-2 sentences.\n` +
          `4) intro/outro should be 2-3 sentences.\n` +
          `5) summary should be 2 concise sentences.\n` +
          `6) Use the same language as the style guide and memo.\n` +
          `7) Output only Korean text.\n` +
          `8) No markdown.`,
      },
    ],
    max_tokens: REVIEW_MAX_TOKENS,
    response_format: { type: "json_object" },
  });

  const parsed = parseJsonObject<Record<string, unknown>>(
    getMessageText(response),
    {},
  );
  return {
    intro: textOrEmpty(parsed.intro, 1200),
    captions: sanitizeStringArray(parsed.captions, 320),
    outro: textOrEmpty(parsed.outro, 1200),
    summary: textOrEmpty(parsed.summary, SUMMARY_CHAR_LIMIT),
  };
}

export const createBlogFromImage = action({
  args: { imageUrl: v.string() },
  handler: async (
    ctx,
    args,
  ): Promise<{ content: string; postId: Id<"posts"> }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("인증되지 않은 사용자입니다.");

    const user = await ctx.runQuery(internal.generateHelpers.getUserProfile, {
      tokenIdentifier: identity.tokenIdentifier,
    });
    if (!user) throw new Error("사용자를 찾을 수 없습니다.");

    const ai = openai();
    const userId = user._id;

    const visionResponse = await ai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "user",
          content: [
            { type: "image_url", image_url: { url: args.imageUrl } },
            {
              type: "text",
              text: "Describe this image for writing a personal blog post. Focus on mood, key scene details, and useful context in 3-5 short sentences. Write in Korean.",
            },
          ],
        },
      ],
      max_tokens: VISION_MAX_TOKENS,
    });

    const visionDescription = clipText(
      getMessageText(visionResponse),
      IMAGE_DESCRIPTION_CHAR_LIMIT,
    );
    const visionDigest = await summarizeSingleVision(ai, visionDescription);

    const [recentPosts, embeddingRes] = await Promise.all([
      !user.styleProfile
        ? ctx.runQuery(internal.generateHelpers.getRecentPosts, {
            userId,
            limit: STYLE_REFERENCE_LIMIT,
          })
        : Promise.resolve([]),
      ai.embeddings.create({
        model: "text-embedding-3-small",
        input: clipText(visionDigest.ragQuery, 900),
      }),
    ]);

    const embedding = embeddingRes.data[0].embedding;

    const searchResults = await ctx.vectorSearch("posts", "by_embedding", {
      vector: embedding,
      limit: Math.min(RAG_SEARCH_LIMIT, RAG_TOP_K),
      filter: (q) => q.eq("userId", userId),
    });

    const similarPosts = (await ctx.runQuery(
      internal.generateHelpers.getPostsByIds,
      {
        ids: searchResults.map((item) => item._id),
      },
    )) as PostLike[];

    const styleReference = buildStyleReference(
      user.styleProfile,
      recentPosts as PostLike[],
    );
    const ragReference = buildRagReference(similarPosts);
    const keywords = clipText(
      visionDigest.keywords.join(", "),
      KEYWORDS_CHAR_LIMIT,
    );

    const generateRes = await ai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content:
            'Return strict JSON only: {"content":"...","summary":"..."}.\nFollow style guide first, then use related notes as supporting context.\nUse the same language as the style guide and memo.\nAll textual values must be in Korean.',
        },
        {
          role: "user",
          content: clipText(
            [
              `[style guide]\n${styleReference}`,
              ragReference ? `[related notes]\n${ragReference}` : "",
              `[image summary]\n${visionDigest.summary}`,
              visionDigest.moodLine ? `[mood]\n${visionDigest.moodLine}` : "",
              keywords ? `[keywords]\n${keywords}` : "",
              "Write one coherent blog post with a personal, natural tone.",
              "반드시 한국어로만 작성하세요.",
            ]
              .filter((section) => section !== "")
              .join("\n\n"),
            FINAL_INPUT_CHAR_LIMIT,
          ),
        },
      ],
      max_tokens: BLOG_MAX_TOKENS,
      response_format: { type: "json_object" },
    });

    const parsed = parseJsonObject<Record<string, unknown>>(
      getMessageText(generateRes),
      {},
    );
    const generatedContent = textOrEmpty(parsed.content, 8000);
    const summary =
      textOrEmpty(parsed.summary, SUMMARY_CHAR_LIMIT) ||
      clipText(generatedContent, SUMMARY_CHAR_LIMIT);

    if (!generatedContent) {
      throw new Error("생성 결과가 비어 있습니다. 다시 시도해 주세요.");
    }

    const postId = await ctx.runMutation(
      internal.generateHelpers.saveGeneratedPost,
      {
        userId,
        content: generatedContent,
        imageUrl: args.imageUrl,
        embedding,
        summary,
      },
    );

    if (!user.styleProfile) {
      const analyzeUserStyleAction = (
        internal as unknown as {
          generate?: { analyzeUserStyle?: Parameters<typeof ctx.runAction>[0] };
        }
      ).generate?.analyzeUserStyle;
      if (analyzeUserStyleAction) {
        ctx.runAction(analyzeUserStyleAction, { userId }).catch(() => {});
      }
    }

    return { content: generatedContent, postId };
  },
});

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

    const user = await ctx.runQuery(internal.generateHelpers.getUserProfile, {
      tokenIdentifier: identity.tokenIdentifier,
    });
    if (!user) throw new Error("사용자를 찾을 수 없습니다.");

    const ai = openai();
    const userId = user._id;

    const [visionResults, recentPosts] = await Promise.all([
      analyzeImages(ai, args.imageUrls),
      !user.styleProfile
        ? ctx.runQuery(internal.generateHelpers.getRecentPosts, {
            userId,
            limit: STYLE_REFERENCE_LIMIT,
          })
        : Promise.resolve([]),
    ]);

    if (visionResults.length === 0) {
      throw new Error("이미지 분석에 실패했습니다. 다시 시도해 주세요.");
    }

    const visionDigest = await summarizeReviewVision(ai, visionResults);
    const imageDigestText = clipText(
      visionDigest.images
        .map((item) => `[image ${item.index}] ${item.summary}`)
        .join("\n"),
      IMAGE_SUMMARY_BLOCK_CHAR_LIMIT,
    );

    const memo = args.memo ? clipText(args.memo, MEMO_CHAR_LIMIT) : "";
    const keywords = args.keywords?.length
      ? clipText(args.keywords.join(", "), KEYWORDS_CHAR_LIMIT)
      : "";

    const ragQueryInput = clipText(
      [visionDigest.ragQuery, memo, keywords]
        .filter((part) => part !== "")
        .join("\n"),
      1200,
    );

    const embeddingRes = await ai.embeddings.create({
      model: "text-embedding-3-small",
      input: ragQueryInput,
    });
    const embedding = embeddingRes.data[0].embedding;

    const searchResults = await ctx.vectorSearch("posts", "by_embedding", {
      vector: embedding,
      limit: Math.min(RAG_SEARCH_LIMIT, RAG_TOP_K),
      filter: (q) => q.eq("userId", userId),
    });

    const similarPosts = (await ctx.runQuery(
      internal.generateHelpers.getPostsByIds,
      {
        ids: searchResults.map((item) => item._id),
      },
    )) as PostLike[];

    const styleReference = buildStyleReference(
      user.styleProfile,
      recentPosts as PostLike[],
    );
    const ragReference = buildRagReference(similarPosts);

    const outline = await buildReviewOutline(ai, {
      styleReference,
      imageDigest: imageDigestText,
      ragReference,
      imageCount: visionResults.length,
      memo,
      keywords,
    });

    const finalDraft = await buildReviewFinal(ai, {
      styleReference,
      imageDigest: imageDigestText,
      ragReference,
      outline,
      imageCount: visionResults.length,
      memo,
      keywords,
    });

    const fallbackImageSummaries = visionDigest.images.map(
      (item) => item.summary,
    );
    const captions = normalizeCaptions(
      visionResults.length,
      finalDraft.captions,
      outline.captionOutlines,
      fallbackImageSummaries,
    );

    const intro =
      finalDraft.intro ||
      outline.introOutline ||
      visionDigest.moodLine ||
      "오늘의 기록을 정리해 봅니다.";
    const outro =
      finalDraft.outro || outline.outroOutline || "이번 기록은 여기까지입니다.";

    const imageBlocks = visionResults.map((item, index) => ({
      url: item.url,
      caption: captions[index] ?? "",
    }));

    const content = joinOptionalParts([
      intro,
      ...imageBlocks.map((item) => item.caption),
      outro,
    ]);

    if (!content) {
      throw new Error("생성 결과가 비어 있습니다. 다시 시도해 주세요.");
    }

    const summary =
      finalDraft.summary ||
      clipText(
        [intro, outro, ...visionDigest.keyPoints]
          .filter((item) => item !== "")
          .join(" "),
        SUMMARY_CHAR_LIMIT,
      );

    const postId = await ctx.runMutation(
      internal.generateHelpers.saveGeneratedReviewPost,
      {
        userId,
        content,
        imageBlocks,
        intro,
        outro,
        embedding,
        summary,
      },
    );

    if (!user.styleProfile) {
      const analyzeUserStyleAction = (
        internal as unknown as {
          generate?: { analyzeUserStyle?: Parameters<typeof ctx.runAction>[0] };
        }
      ).generate?.analyzeUserStyle;
      if (analyzeUserStyleAction) {
        ctx.runAction(analyzeUserStyleAction, { userId }).catch(() => {});
      }
    }

    return { content, imageBlocks, intro, outro, postId };
  },
});

export const analyzeUserStyle = action({
  args: { userId: v.id("users") },
  handler: async (ctx, args): Promise<string> => {
    const ai = openai();

    const recentPosts = (await ctx.runQuery(
      internal.generateHelpers.getRecentPosts,
      {
        userId: args.userId,
        limit: 5,
      },
    )) as PostLike[];

    if (recentPosts.length === 0) {
      return "분석할 글이 없습니다.";
    }

    const sourceText = clipText(
      recentPosts
        .map((post, i) => {
          const text = post.summary
            ? clipText(post.summary, 260)
            : clipText(post.content, 600);
          return `[post ${i + 1}] ${text}`;
        })
        .join("\n\n"),
      3600,
    );

    const response = await ai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "Analyze writing style only. Ignore topic. Return one compact paragraph under 180 words describing tone, sentence rhythm, ending patterns, opening/closing habits, and lexical preferences. Return in Korean.",
        },
        {
          role: "user",
          content: sourceText,
        },
      ],
      max_tokens: 260,
    });

    const styleProfile = getMessageText(response);

    await ctx.runMutation(internal.generateHelpers.updateStyleProfile, {
      userId: args.userId,
      styleProfile,
    });

    return styleProfile;
  },
});
