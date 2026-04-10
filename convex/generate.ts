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
  userId: Id<"users">
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

  if (profile.openingMode === "strict" && !fixedOpening) {
    return fail(
      "style-profile-preparation",
      "STYLE_PROFILE_STRICT_OPENING_MISSING",
      "strict 모드에는 고정 시작문 또는 반복 시작문 패턴이 필요합니다.",
      false
    );
  }

  return {
    ok: true,
    styleProfile: {
      openingMode: profile.openingMode,
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

    const ai = openai();
    const imageAnalysis = await analyzeImagesStage(ai, [validated.imageUrl], "single");
    if (!imageAnalysis.ok) {
      return imageAnalysis;
    }

    const rag = await buildRagContextStage(
      ctx,
      ai,
      auth.userId,
      imageAnalysis.observations
    );
    if (!rag.ok) {
      return rag;
    }

    const draft = await composeSingleDraftStage(
      ai,
      imageAnalysis.observations[0],
      rag.references,
      styleProfileStage.styleProfile
    );
    if (!draft.ok) {
      return draft;
    }

    let postId: Id<"posts">;
    try {
      postId = await ctx.runMutation(internal.generateHelpers.saveGeneratedPost, {
        userId: auth.userId,
        content: draft.content,
        imageUrl: validated.imageUrl,
        imageStorageId: args.imageStorageId,
        references: rag.references ?? [],
      });
    } catch {
      return fail(
        "final-draft",
        "POST_SAVE_FAILED",
        "Saving the generated post failed. Please retry.",
        true
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

    const ai = openai();
    const imageAnalysis = await analyzeImagesStage(ai, normalized.imageUrls, "review");
    if (!imageAnalysis.ok) {
      return imageAnalysis;
    }

    const rag = await buildRagContextStage(
      ctx,
      ai,
      auth.userId,
      imageAnalysis.observations
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
      normalized.keywords
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
        }
      );
    } catch {
      return fail(
        "final-draft",
        "POST_SAVE_FAILED",
        "Saving the generated post failed. Please retry.",
        true
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
