import { v } from "convex/values";
import { internalQuery, internalMutation } from "./_generated/server";

/** 토큰으로 userId 조회 */
export const getUserId = internalQuery({
  args: { tokenIdentifier: v.string() },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) =>
        q.eq("tokenIdentifier", args.tokenIdentifier)
      )
      .unique();
    return user?._id ?? null;
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

/** summary 준비 상태인 후보 조회 */
export const getSummaryCandidates = internalQuery({
  args: { userId: v.id("users"), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const posts = await ctx.db
      .query("posts")
      .filter((q) =>
        q.and(
          q.eq(q.field("userId"), args.userId),
          q.eq(q.field("summaryStatus"), "ready"),
        ),
      )
      .take(args.limit ?? 50);

    return posts
      .filter((post) => post.summary && post.embedding)
      .map((post) => ({
        postId: post._id,
        summary: post.summary!,
        embedding: post.embedding!,
      }));
  },
});

/** 생성된 글 저장 */
export const saveGeneratedPost = internalMutation({
  args: {
    userId: v.id("users"),
    content: v.string(),
    imageUrl: v.string(),
    embedding: v.array(v.float64()),
    references: v.optional(
      v.array(
        v.object({
          postId: v.id("posts"),
          summary: v.string(),
          score: v.number(),
        }),
      ),
    ),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("posts", {
      userId: args.userId,
      content: args.content,
      summary: args.content,
      summaryStatus: "ready",
      summaryUpdatedAt: Date.now(),
      imageUrl: args.imageUrl,
      embedding: args.embedding,
    });
  },
});

/** 리뷰 글 저장 (다중 이미지) */
export const saveGeneratedReviewPost = internalMutation({
  args: {
    userId: v.id("users"),
    content: v.string(),
    summary: v.optional(v.string()),
    imageBlocks: v.array(
      v.object({
        url: v.string(),
        caption: v.string(),
      })
    ),
    intro: v.string(),
    outro: v.string(),
    embedding: v.array(v.float64()),
    references: v.optional(
      v.array(
        v.object({
          postId: v.id("posts"),
          summary: v.string(),
          score: v.number(),
        }),
      ),
    ),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("posts", {
      userId: args.userId,
      content: args.content,
      summary: args.content,
      summaryStatus: "ready",
      summaryUpdatedAt: Date.now(),
      imageBlocks: args.imageBlocks,
      intro: args.intro,
      outro: args.outro,
      embedding: args.embedding,
    });
  },
});
