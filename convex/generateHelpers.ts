import { v } from "convex/values";
import { internalQuery, internalMutation } from "./_generated/server";

/** 토큰으로 userId 조회 */
export const getUserId = internalQuery({
  args: { tokenIdentifier: v.string() },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) =>
        q.eq("tokenIdentifier", args.tokenIdentifier),
      )
      .unique();
    if (!user) throw new Error("사용자를 찾을 수 없습니다.");
    return user._id;
  },
});

/** 사용자 프로필 조회 (문체 포함) */
export const getUserProfile = internalQuery({
  args: { tokenIdentifier: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("users")
      .withIndex("by_token", (q) =>
        q.eq("tokenIdentifier", args.tokenIdentifier),
      )
      .unique();
  },
});

// 최근글 조회
export const getRecentPosts = internalQuery({
  args: { userId: v.id("users"), limit: v.number() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("posts")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .order("desc")
      .take(args.limit);
  },
});

/** postId 배열로 글 내용 조회 */
export const getPostsByIds = internalQuery({
  args: { ids: v.array(v.id("posts")) },
  handler: async (ctx, args) => {
    const posts = [];
    for (const id of args.ids) {
      const post = await ctx.db.get(id);
      if (post) posts.push(post);
    }
    return posts;
  },
});

/** 생성된 글 저장 */
export const saveGeneratedPost = internalMutation({
  args: {
    userId: v.id("users"),
    content: v.string(),
    imageUrl: v.string(),
    embedding: v.array(v.float64()),
    summary: v.optional(v.string()), // 추가
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("posts", {
      userId: args.userId,
      content: args.content,
      imageUrl: args.imageUrl,
      embedding: args.embedding,
      summary: args.summary, // 추가
    });
  },
});

/** 리뷰 글 저장 (다중 이미지) */
export const saveGeneratedReviewPost = internalMutation({
  args: {
    userId: v.id("users"),
    content: v.string(),
    imageBlocks: v.array(
      v.object({
        url: v.string(),
        caption: v.string(),
      }),
    ),
    intro: v.string(),
    outro: v.string(),
    embedding: v.array(v.float64()),
    summary: v.optional(v.string()), // 추가
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("posts", {
      userId: args.userId,
      content: args.content,
      imageBlocks: args.imageBlocks,
      intro: args.intro,
      outro: args.outro,
      embedding: args.embedding,
      summary: args.summary, // 추가
    });
  },
});

/** 사용자 문체 프로필 갱신 */
export const updateStyleProfile = internalMutation({
  args: {
    userId: v.id("users"),
    styleProfile: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.userId, {
      styleProfile: args.styleProfile,
      styleUpdatedAt: Date.now(),
    });
  },
});
