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
import type { Id } from "./_generated/dataModel";
import { SUMMARY_PENDING_STALE_MS } from "./constants";

type SummarySchedulerCtx = Pick<MutationCtx, "scheduler">;

export async function scheduleSummaryRegeneration(
  ctx: SummarySchedulerCtx,
  postId: Id<"posts">,
  content: string,
  expectedSummaryUpdatedAt: number,
) {
  await ctx.scheduler.runAfter(0, internal.posts.generateSummary, {
    postId,
    content,
    expectedSummaryUpdatedAt,
  });
}

function isStorageDeleteNotFoundError(error: unknown): boolean {
  const message =
    error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return (
    message.includes("not found") ||
    message.includes("404") ||
    message.includes("does not exist")
  );
}

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

    const now = Date.now();
    const postId = await ctx.db.insert("posts", {
      userId: user._id,
      content: args.content,
      summaryStatus: "pending",
      summaryUpdatedAt: now,
    });

    // summary + embedding 생성 action을 스케줄링
    await scheduleSummaryRegeneration(ctx, postId, args.content, now);

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

    const postIds: Id<"posts">[] = [];
    for (const content of args.contents) {
      const now = Date.now();
      const postId = await ctx.db.insert("posts", {
        userId: user._id,
        content,
        summaryStatus: "pending",
        summaryUpdatedAt: now,
      });

      await scheduleSummaryRegeneration(ctx, postId, content, now);

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
    expectedSummaryUpdatedAt: v.number(),
  },
  handler: async (ctx, args) => {
    try {
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
        throw new Error("요약 생성 결과가 비어 있습니다.");
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
        expectedSummaryUpdatedAt: args.expectedSummaryUpdatedAt,
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : "요약 생성/업데이트 중 오류가 발생했습니다.";
      try {
        await ctx.runMutation(internal.posts.updatePostSummaryFailed, {
          postId: args.postId,
          error: errorMessage,
          expectedSummaryUpdatedAt: args.expectedSummaryUpdatedAt,
        });
      } catch {
        // Failed-state patch can also fail in transient outages; avoid rethrowing.
      }
    }
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
    expectedSummaryUpdatedAt: v.number(),
  },
  handler: async (ctx, args) => {
    const post = await ctx.db.get(args.postId);
    if (!post) return;
    if (post.summaryUpdatedAt !== args.expectedSummaryUpdatedAt) return;

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
    expectedSummaryUpdatedAt: v.number(),
  },
  handler: async (ctx, args) => {
    const post = await ctx.db.get(args.postId);
    if (!post) return;
    if (post.summaryUpdatedAt !== args.expectedSummaryUpdatedAt) return;

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

  const now = Date.now();
  const staleCutoff = now - SUMMARY_PENDING_STALE_MS;

  const candidates = await ctx.db
    .query("posts")
    .filter((q) =>
      q.and(
        q.eq(q.field("userId"), user._id),
        q.or(
          q.eq(q.field("summaryStatus"), undefined),
          q.eq(q.field("summaryStatus"), "failed"),
          q.eq(q.field("summaryStatus"), "pending"),
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

  const retryablePosts = candidates.filter((post) => {
    if (post.summaryStatus === "pending") {
      const lastUpdatedAt = post.summaryUpdatedAt ?? post._creationTime;
      return lastUpdatedAt <= staleCutoff;
    }

    if (post.summaryStatus === undefined) {
      return post.summary === undefined || post.embedding === undefined;
    }

    if (post.summaryStatus === "failed") {
      return true;
    }

    return post.summary === undefined || post.embedding === undefined;
  });

  for (const post of retryablePosts) {
    const retryToken = Date.now();
    await ctx.db.patch(post._id, {
      summaryStatus: "pending",
      summaryError: undefined,
      summaryUpdatedAt: retryToken,
    });

    await scheduleSummaryRegeneration(ctx, post._id, post.content, retryToken);
  }

  return retryablePosts.length;
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

    const summaryToken = Date.now();
    await ctx.db.patch(args.postId, {
      content: args.content,
      summary: undefined,
      summaryStatus: "pending",
      summaryError: undefined,
      summaryUpdatedAt: summaryToken,
      embedding: undefined,
      ...(args.imageBlocks !== undefined && { imageBlocks: args.imageBlocks }),
      ...(args.intro !== undefined && { intro: args.intro }),
      ...(args.outro !== undefined && { outro: args.outro }),
    });

    // summary/embedding 재생성 스케줄링
    await scheduleSummaryRegeneration(
      ctx,
      args.postId,
      args.content,
      summaryToken,
    );
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

    const storageIds = [
      ...(post.imageStorageId ? [post.imageStorageId] : []),
      ...(post.imageStorageIds ?? []),
    ];
    const uniqueStorageIds = Array.from(new Set(storageIds));
    const now = Date.now();

    for (const storageId of uniqueStorageIds) {
      const upload = await ctx.db
        .query("imageUploads")
        .withIndex("by_storage_id", (q) => q.eq("storageId", storageId))
        .unique();

      let nextStatus: "deleted" | "temp" = "deleted";
      try {
        await ctx.storage.delete(storageId);
      } catch (error) {
        if (isStorageDeleteNotFoundError(error)) {
          nextStatus = "deleted";
        } else {
          nextStatus = "temp";
          console.error("[deletePost] storage delete failed; cleanup deferred", {
            storageId,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      if (upload) {
        await ctx.db.patch(upload._id, {
          status: nextStatus,
          updatedAt: now,
          expiresAt: now,
          attachedPostId: undefined,
        });
      }
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
