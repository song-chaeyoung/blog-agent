import { v } from "convex/values";
import {
  query,
  mutation,
  internalAction,
  internalMutation,
} from "./_generated/server";
import { internal } from "./_generated/api";
import OpenAI from "openai";

/**
 * 글을 저장하고 embedding 생성 action을 스케줄링합니다.
 */
export const createPost = mutation({
  args: { content: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("인증되지 않은 사용자입니다.");

    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) =>
        q.eq("tokenIdentifier", identity.tokenIdentifier)
      )
      .unique();

    if (!user) throw new Error("사용자를 찾을 수 없습니다.");

    const postId = await ctx.db.insert("posts", {
      userId: user._id,
      content: args.content,
    });

    // embedding 생성 action을 스케줄링 (서버 사이드 자동 처리)
    await ctx.scheduler.runAfter(0, internal.posts.generateEmbedding, {
      postId,
      content: args.content,
    });

    return postId;
  },
});

/**
 * 여러 글을 일괄 저장하고 각각 embedding 생성을 스케줄링합니다.
 */
export const bulkCreatePosts = mutation({
  args: { contents: v.array(v.string()) },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("인증되지 않은 사용자입니다.");

    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) =>
        q.eq("tokenIdentifier", identity.tokenIdentifier)
      )
      .unique();

    if (!user) throw new Error("사용자를 찾을 수 없습니다.");

    const postIds = [];
    for (const content of args.contents) {
      const postId = await ctx.db.insert("posts", {
        userId: user._id,
        content,
      });

      await ctx.scheduler.runAfter(0, internal.posts.generateEmbedding, {
        postId,
        content,
      });

      postIds.push(postId);
    }

    return postIds;
  },
});

/**
 * OpenAI API를 호출하여 embedding을 생성하고 DB에 업데이트합니다.
 */
export const generateEmbedding = internalAction({
  args: {
    postId: v.id("posts"),
    content: v.string(),
  },
  handler: async (ctx, args) => {
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    const response = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: args.content,
    });

    const embedding = response.data[0].embedding;

    await ctx.runMutation(internal.posts.updatePostEmbedding, {
      postId: args.postId,
      embedding,
    });
  },
});

/**
 * embedding 값을 업데이트하는 internal mutation (action에서만 호출)
 */
export const updatePostEmbedding = internalMutation({
  args: {
    postId: v.id("posts"),
    embedding: v.array(v.float64()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.postId, {
      embedding: args.embedding,
    });
  },
});

/**
 * embedding이 없는 글들의 embedding을 재생성합니다.
 */
export const retryMissingEmbeddings = mutation({
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("인증되지 않은 사용자입니다.");

    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) =>
        q.eq("tokenIdentifier", identity.tokenIdentifier)
      )
      .unique();

    if (!user) throw new Error("사용자를 찾을 수 없습니다.");

    const posts = await ctx.db
      .query("posts")
      .filter((q) =>
        q.and(
          q.eq(q.field("userId"), user._id),
          q.eq(q.field("embedding"), undefined)
        )
      )
      .collect();

    for (const post of posts) {
      await ctx.scheduler.runAfter(0, internal.posts.generateEmbedding, {
        postId: post._id,
        content: post.content,
      });
    }

    return posts.length;
  },
});

/**
 * 글 내용을 수정하고 embedding을 재생성합니다. (본인 글만)
 */
export const updatePost = mutation({
  args: {
    postId: v.id("posts"),
    content: v.string(),
    imageBlocks: v.optional(
      v.array(v.object({ url: v.string(), caption: v.string() }))
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
        q.eq("tokenIdentifier", identity.tokenIdentifier)
      )
      .unique();

    if (!user) throw new Error("사용자를 찾을 수 없습니다.");

    const post = await ctx.db.get(args.postId);
    if (!post || post.userId !== user._id) {
      throw new Error("수정 권한이 없습니다.");
    }

    const patch: Record<string, unknown> = {
      content: args.content,
      embedding: undefined,
    };
    if (args.imageBlocks !== undefined) {
      patch.imageBlocks = args.imageBlocks;
    }
    if (args.intro !== undefined) {
      patch.intro = args.intro;
    }
    if (args.outro !== undefined) {
      patch.outro = args.outro;
    }

    await ctx.db.patch(args.postId, patch);

    // embedding 재생성 스케줄링
    await ctx.scheduler.runAfter(0, internal.posts.generateEmbedding, {
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
        q.eq("tokenIdentifier", identity.tokenIdentifier)
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
        q.eq("tokenIdentifier", identity.tokenIdentifier)
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
        q.eq("tokenIdentifier", identity.tokenIdentifier)
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
