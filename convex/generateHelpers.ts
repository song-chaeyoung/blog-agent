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
    if (!user) throw new Error("사용자를 찾을 수 없습니다.");
    return user._id;
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
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("posts", {
      userId: args.userId,
      content: args.content,
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
    imageBlocks: v.array(
      v.object({
        url: v.string(),
        caption: v.string(),
      })
    ),
    intro: v.string(),
    outro: v.string(),
    embedding: v.array(v.float64()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("posts", {
      userId: args.userId,
      content: args.content,
      imageBlocks: args.imageBlocks,
      intro: args.intro,
      outro: args.outro,
      embedding: args.embedding,
    });
  },
});
