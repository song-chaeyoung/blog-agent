import { v } from "convex/values";
import {
  query,
  mutation,
  internalAction,
  internalMutation,
} from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import OpenAI from "openai";

/**
 * 글을 저장하고 summary/embedding 생성 action을 스케줄링합니다.
 */
export const createPost = mutation({
  args: { content: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("인증되지 않은 사용자입니다.");

    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) =>
        q.eq("tokenIdentifier", identity.tokenIdentifier),
      )
      .unique();

    if (!user) throw new Error("사용자를 찾을 수 없습니다.");

    const postId = await ctx.db.insert("posts", {
      userId: user._id,
      content: args.content,
      summaryStatus: "pending",
    });

    // summary + embedding 생성 action을 스케줄링
    await ctx.scheduler.runAfter(0, internal.posts.generateSummary, {
      postId,
      content: args.content,
    });

    return postId;
  },
});

/**
 * 여러 글을 일괄 저장하고 각각 summary/embedding 생성을 스케줄링합니다.
 */
export const bulkCreatePosts = mutation({
  args: { contents: v.array(v.string()) },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("인증되지 않은 사용자입니다.");

    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) =>
        q.eq("tokenIdentifier", identity.tokenIdentifier),
      )
      .unique();

    if (!user) throw new Error("사용자를 찾을 수 없습니다.");

    const postIds = [];
    for (const content of args.contents) {
      const postId = await ctx.db.insert("posts", {
        userId: user._id,
        content,
        summaryStatus: "pending",
      });

      await ctx.scheduler.runAfter(0, internal.posts.generateSummary, {
        postId,
        content,
      });

      postIds.push(postId);
    }

    return postIds;
  },
});

/**
 * OpenAI API를 호출하여 summary/embedding을 생성하고 DB에 업데이트합니다.
 */
export const generateSummary = internalAction({
  args: {
    postId: v.id("posts"),
    content: v.string(),
  },
  handler: async (ctx, args) => {
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    const summaryRes = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "입력 글을 4~6문장으로 간결히 요약해 주세요. 핵심 맥락과 문체 특징을 유지하세요.",
        },
        { role: "user", content: args.content },
      ],
      max_tokens: 500,
    });

    const summary = (summaryRes.choices[0]?.message?.content ?? "").trim();
    if (!summary) {
      await ctx.runMutation(internal.posts.updatePostSummaryFailed, {
        postId: args.postId,
        error: "요약 생성 결과가 비어 있습니다.",
      });
      return;
    }

    const response = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: summary,
    });

    const embedding = response.data[0].embedding;

    await ctx.runMutation(internal.posts.updatePostSummaryReady, {
      postId: args.postId,
      summary,
      embedding,
    });
  },
});

/**
 * summary/embedding 성공 결과를 업데이트하는 internal mutation
 */
export const updatePostSummaryReady = internalMutation({
  args: {
    postId: v.id("posts"),
    summary: v.string(),
    embedding: v.array(v.float64()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.postId, {
      summary: args.summary,
      embedding: args.embedding,
      summaryStatus: "ready",
      summaryError: undefined,
      summaryUpdatedAt: Date.now(),
    });
  },
});

/**
 * summary 생성 실패를 기록하는 internal mutation
 */
export const updatePostSummaryFailed = internalMutation({
  args: {
    postId: v.id("posts"),
    error: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.postId, {
      summaryStatus: "failed",
      summaryError: args.error,
      summaryUpdatedAt: Date.now(),
    });
  },
});

/**
 * summary/embedding이 없는 글들의 생성 작업을 재스케줄링합니다.
 */
async function retryMissingSummaryJobs(ctx: MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("인증되지 않은 사용자입니다.");

  const user = await ctx.db
    .query("users")
    .withIndex("by_token", (q) =>
      q.eq("tokenIdentifier", identity.tokenIdentifier),
    )
    .unique();

  if (!user) throw new Error("사용자를 찾을 수 없습니다.");

  const posts = await ctx.db
    .query("posts")
    .filter((q) =>
      q.and(
        q.eq(q.field("userId"), user._id),
        q.or(
          q.eq(q.field("summaryStatus"), undefined),
          q.eq(q.field("summaryStatus"), "failed"),
          q.eq(q.field("summary"), undefined),
          q.eq(q.field("embedding"), undefined),
        ),
      ),
    )
    .collect();

  for (const post of posts) {
    await ctx.scheduler.runAfter(0, internal.posts.generateSummary, {
      postId: post._id,
      content: post.content,
    });
  }

  return posts.length;
}

export const retryMissingSummaries = mutation({
  handler: async (ctx) => {
    return await retryMissingSummaryJobs(ctx);
  },
});

// 기존 프런트 호출 호환용 alias
export const retryMissingEmbeddings = mutation({
  handler: async (ctx) => {
    return await retryMissingSummaryJobs(ctx);
  },
});

/**
 * 글 내용을 수정하고 summary/embedding을 재생성합니다. (본인 글만)
 */
export const updatePost = mutation({
  args: {
    postId: v.id("posts"),
    content: v.string(),
    imageBlocks: v.optional(
      v.array(v.object({ url: v.string(), caption: v.string() })),
    ),
    intro: v.optional(v.string()),
    outro: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("인증되지 않은 사용자입니다.");

    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) =>
        q.eq("tokenIdentifier", identity.tokenIdentifier),
      )
      .unique();

    if (!user) throw new Error("사용자를 찾을 수 없습니다.");

    const post = await ctx.db.get(args.postId);
    if (!post || post.userId !== user._id) {
      throw new Error("수정 권한이 없습니다.");
    }

    await ctx.db.patch(args.postId, {
      content: args.content,
      summary: undefined,
      summaryStatus: "pending",
      summaryError: undefined,
      embedding: undefined,
      ...(args.imageBlocks !== undefined && { imageBlocks: args.imageBlocks }),
      ...(args.intro !== undefined && { intro: args.intro }),
      ...(args.outro !== undefined && { outro: args.outro }),
    });

    // summary/embedding 재생성 스케줄링
    await ctx.scheduler.runAfter(0, internal.posts.generateSummary, {
      postId: args.postId,
      content: args.content,
    });
  },
});

/**
 * 단일 글을 조회합니다. (본인 글만)
 */
export const getPost = query({
  args: { postId: v.id("posts") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) =>
        q.eq("tokenIdentifier", identity.tokenIdentifier),
      )
      .unique();

    if (!user) return null;

    const post = await ctx.db.get(args.postId);
    if (!post || post.userId !== user._id) return null;

    return post;
  },
});

/**
 * 글을 삭제합니다. (본인 글만)
 */
export const deletePost = mutation({
  args: { postId: v.id("posts") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("인증되지 않은 사용자입니다.");

    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) =>
        q.eq("tokenIdentifier", identity.tokenIdentifier),
      )
      .unique();

    if (!user) throw new Error("사용자를 찾을 수 없습니다.");

    const post = await ctx.db.get(args.postId);
    if (!post || post.userId !== user._id) {
      throw new Error("삭제 권한이 없습니다.");
    }

    await ctx.db.delete(args.postId);
  },
});

/**
 * 현재 사용자의 글 목록을 최신순으로 조회합니다.
 */
export const listMyPosts = query({
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) =>
        q.eq("tokenIdentifier", identity.tokenIdentifier),
      )
      .unique();

    if (!user) return [];

    return await ctx.db
      .query("posts")
      .order("desc")
      .filter((q) => q.eq(q.field("userId"), user._id))
      .collect();
  },
});
