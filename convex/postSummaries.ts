import { mutation } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";

async function resolveCurrentUserId(ctx: MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("인증되지 않은 사용자입니다.");

  const user = await ctx.db
    .query("users")
    .withIndex("by_token", (q) =>
      q.eq("tokenIdentifier", identity.tokenIdentifier),
    )
    .unique();

  if (!user) throw new Error("사용자를 찾을 수 없습니다.");
  return user._id;
}

/**
 * 단일 게시글의 summary 재생성을 수동으로 예약합니다.
 */
export const backfillSummary = mutation({
  args: { postId: v.id("posts") },
  handler: async (ctx, args) => {
    const userId = await resolveCurrentUserId(ctx);
    const post = await ctx.db.get(args.postId);
    if (!post || post.userId !== userId) {
      throw new Error("대상 게시글을 찾을 수 없거나 권한이 없습니다.");
    }

    await ctx.db.patch(post._id, {
      summaryStatus: "pending",
      summaryError: undefined,
    });

    await ctx.scheduler.runAfter(0, internal.posts.generateSummary, {
      postId: post._id,
      content: post.content,
    });
  },
});

/**
 * summary가 없는 모든 본인 게시글에 대해 backfill을 예약합니다.
 */
export const backfillMissingSummaries = mutation({
  handler: async (ctx) => {
    const userId = await resolveCurrentUserId(ctx);
    const posts = await ctx.db
      .query("posts")
      .filter((q) =>
        q.and(
          q.eq(q.field("userId"), userId),
          q.or(
            q.eq(q.field("summaryStatus"), undefined),
            q.eq(q.field("summaryStatus"), "failed"),
            q.and(
              q.neq(q.field("summaryStatus"), "pending"),
              q.or(
                q.eq(q.field("summary"), undefined),
                q.eq(q.field("embedding"), undefined),
              ),
            ),
          ),
        ),
      )
      .collect();

    for (const post of posts) {
      await ctx.db.patch(post._id, {
        summaryStatus: "pending",
        summaryError: undefined,
      });
      await ctx.scheduler.runAfter(0, internal.posts.generateSummary, {
        postId: post._id,
        content: post.content,
      });
    }

    return posts.length;
  },
});
