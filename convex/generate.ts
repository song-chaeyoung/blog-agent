import OpenAI from "openai";
import { v } from "convex/values";
import { action } from "./_generated/server";
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
import type { GenerationResult } from "./generateTypes";

const openai = () => new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export const createBlogFromImage = action({
  args: { imageUrl: v.string() },
  handler: async (ctx, args): Promise<GenerationResult> => {
    const validated = validateSingleImageRequest(args.imageUrl);
    if (!validated.ok) {
      return validated;
    }

    const auth = await resolveAuthedUserId(ctx);
    if (!auth.ok) {
      return auth;
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
      rag.references
    );
    if (!draft.ok) {
      return draft;
    }

    const embeddingRes = await ai.embeddings.create({
      model: "text-embedding-3-small",
      input: draft.content,
    });
    const postEmbedding = embeddingRes.data[0].embedding;

    const postId = await ctx.runMutation(internal.generateHelpers.saveGeneratedPost, {
      userId: auth.userId,
      content: draft.content,
      imageUrl: validated.imageUrl,
      embedding: postEmbedding,
      references: rag.references ?? [],
    });

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
      normalized.memo,
      normalized.keywords
    );
    if (!draft.ok) {
      return draft;
    }

    const embeddingRes = await ai.embeddings.create({
      model: "text-embedding-3-small",
      input: draft.content,
    });
    const postEmbedding = embeddingRes.data[0].embedding;

    const postId = await ctx.runMutation(
      internal.generateHelpers.saveGeneratedReviewPost,
      {
        userId: auth.userId,
        content: draft.content,
        imageBlocks: draft.imageBlocks,
        intro: draft.intro,
        outro: draft.outro,
        embedding: postEmbedding,
        references: rag.references ?? [],
      }
    );

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
