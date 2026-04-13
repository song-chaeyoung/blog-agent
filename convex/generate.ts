import OpenAI from "openai";
import { v } from "convex/values";
import { action, type ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { resolveAuthedUserId } from "./generateAuth";
import {
  normalizeReviewRequest,
  validateSingleImageRequest,
} from "./generateValidation";
import { analyzeImagesStage } from "./generateStages";
import { buildRagContextStage } from "./generateRag";
import {
  composeReviewDraftStage,
  composeSingleDraftStage,
} from "./generateDraft";
import {
  fail,
  type GenerationFailure,
  type GenerationResult,
  type GenerationStyleProfile,
} from "./generateTypes";
import type { Id } from "./_generated/dataModel";

const openai = () => new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function prepareStyleProfileStage(
  ctx: ActionCtx,
  userId: Id<"users">,
): Promise<
  { ok: true; styleProfile: GenerationStyleProfile } | GenerationFailure
> {
  let profile: GenerationStyleProfile | null = null;
  try {
    profile = await ctx.runQuery(internal.styleProfiles.getStyleProfileByUser, {
      userId,
    });
  } catch {
    return {
      ok: true,
      styleProfile: {
        openingMode: "off",
        openerPatterns: [],
        toneKeywords: [],
        confidence: 0,
      },
    };
  }

  if (!profile) {
    return {
      ok: true,
      styleProfile: {
        openingMode: "off",
        openerPatterns: [],
        toneKeywords: [],
        confidence: 0,
      },
    };
  }

  const fixedOpening = profile.fixedOpening?.trim() || undefined;
  const openerPatterns = profile.openerPatterns
    .map((item) => ({
      ...item,
      text: item.text.trim(),
    }))
    .filter((item) => item.text.length > 0)
    .sort((a, b) => b.repeatRate - a.repeatRate)
    .slice(0, 5);

  // 손상된 strict 프로필은 생성 전체를 깨지 않도록 off로 폴백합니다.
  const openingMode =
    profile.openingMode === "strict" && !fixedOpening
      ? "off"
      : profile.openingMode;

  return {
    ok: true,
    styleProfile: {
      openingMode,
      fixedOpening,
      openerPatterns,
      toneKeywords: profile.toneKeywords ?? [],
      confidence: profile.confidence,
    },
  };
}

export const createBlogFromImage = action({
  args: {
    imageUrl: v.string(),
    imageStorageId: v.optional(v.id("_storage")),
  },
  handler: async (ctx, args): Promise<GenerationResult> => {
    const validated = validateSingleImageRequest(args.imageUrl);
    if (!validated.ok) {
      return validated;
    }

    const auth = await resolveAuthedUserId(ctx);
    if (!auth.ok) {
      return auth;
    }

    const styleProfileStage = await prepareStyleProfileStage(ctx, auth.userId);
    if (!styleProfileStage.ok) {
      return styleProfileStage;
    }

    let ai: OpenAI;
    try {
      ai = openai();
    } catch {
      return fail(
        "image-analysis",
        "OPENAI_INIT_FAILED",
        "OpenAI 초기화에 실패했습니다. API 설정을 확인해 주세요.",
        false,
      );
    }
    const imageAnalysis = await analyzeImagesStage(
      ai,
      [validated.imageUrl],
      "single",
    );
    if (!imageAnalysis.ok) {
      return imageAnalysis;
    }

    const rag = await buildRagContextStage(
      ctx,
      ai,
      auth.userId,
      imageAnalysis.observations,
    );
    if (!rag.ok) {
      return rag;
    }

    const draft = await composeSingleDraftStage(
      ai,
      imageAnalysis.observations[0],
      rag.references,
      styleProfileStage.styleProfile,
    );
    if (!draft.ok) {
      return draft;
    }

    let postId: Id<"posts">;
    try {
      postId = await ctx.runMutation(
        internal.generateHelpers.saveGeneratedPost,
        {
          userId: auth.userId,
          content: draft.content,
          imageUrl: validated.imageUrl,
          imageStorageId: args.imageStorageId,
          references: rag.references ?? [],
        },
      );
    } catch {
      return fail(
        "final-draft",
        "POST_SAVE_FAILED",
        "생성된 글 저장에 실패했습니다. 잠시 후 다시 시도해 주세요.",
        true,
      );
    }

    return {
      ok: true,
      stage: "completed",
      mode: "single",
      postId,
      content: draft.content,
      references: rag.references ?? [],
    };
  },
});

export const createBlogReview = action({
  args: {
    imageUrls: v.array(v.string()),
    imageStorageIds: v.optional(v.array(v.id("_storage"))),
    memo: v.optional(v.string()),
    keywords: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args): Promise<GenerationResult> => {
    const normalized = normalizeReviewRequest(args);
    if (!normalized.ok) {
      return normalized;
    }

    const auth = await resolveAuthedUserId(ctx);
    if (!auth.ok) {
      return auth;
    }

    const styleProfileStage = await prepareStyleProfileStage(ctx, auth.userId);
    if (!styleProfileStage.ok) {
      return styleProfileStage;
    }

    let ai: OpenAI;
    try {
      ai = openai();
    } catch {
      return fail(
        "image-analysis",
        "OPENAI_INIT_FAILED",
        "OpenAI 초기화에 실패했습니다. API 설정을 확인해 주세요.",
        false,
      );
    }
    const imageAnalysis = await analyzeImagesStage(
      ai,
      normalized.imageUrls,
      "review",
    );
    if (!imageAnalysis.ok) {
      return imageAnalysis;
    }

    const rag = await buildRagContextStage(
      ctx,
      ai,
      auth.userId,
      imageAnalysis.observations,
    );
    if (!rag.ok) {
      return rag;
    }

    const draft = await composeReviewDraftStage(
      ai,
      imageAnalysis.observations,
      rag.references,
      styleProfileStage.styleProfile,
      normalized.memo,
      normalized.keywords,
    );
    if (!draft.ok) {
      return draft;
    }

    let postId: Id<"posts">;
    try {
      postId = await ctx.runMutation(
        internal.generateHelpers.saveGeneratedReviewPost,
        {
          userId: auth.userId,
          content: draft.content,
          imageBlocks: draft.imageBlocks,
          imageStorageIds: normalized.imageStorageIds,
          intro: draft.intro,
          outro: draft.outro,
          references: rag.references ?? [],
        },
      );
    } catch {
      return fail(
        "final-draft",
        "POST_SAVE_FAILED",
        "생성된 글 저장에 실패했습니다. 잠시 후 다시 시도해 주세요.",
        true,
      );
    }

    return {
      ok: true,
      stage: "completed",
      mode: "review",
      postId,
      content: draft.content,
      intro: draft.intro,
      outro: draft.outro,
      imageBlocks: draft.imageBlocks,
      references: rag.references ?? [],
    };
  },
});

/**
 * 사용자의 최근 글을 분석하여 문체 프로필을 갱신합니다.
 */
export const analyzeUserStyle = action({
  args: { userId: v.id("users") },
  handler: async (ctx, args): Promise<string> => {
    const auth = await resolveAuthedUserId(ctx);
    if (!auth.ok) {
      throw new Error(auth.message);
    }
    if (args.userId !== auth.userId) {
      throw new Error("본인 스타일만 분석할 수 있습니다.");
    }

    const ai = openai();

    // 1. 최근 글 조회 (최대 5개)
    const recentPosts = await ctx.runQuery(
      internal.generateHelpers.getRecentPosts,
      {
        userId: auth.userId,
        limit: 5,
      },
    );

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
      userId: auth.userId,
      styleProfile,
    });

    return styleProfile;
  },
});
