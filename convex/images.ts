import { v } from "convex/values";
import {
  mutation,
  internalMutation,
  type MutationCtx,
} from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import {
  ALLOWED_TYPES,
  MAX_FILE_SIZE,
  TEMP_UPLOAD_CLEANUP_BATCH,
  TEMP_UPLOAD_TTL_MS,
} from "./constants";

async function resolveAuthedUserId(ctx: MutationCtx): Promise<Id<"users">> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("인증되지 않은 사용자입니다.");

  const user = await ctx.db
    .query("users")
    .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
    .unique();

  if (!user) throw new Error("사용자를 찾을 수 없습니다.");
  return user._id;
}

/**
 * 클라이언트에서 Convex Storage에 파일을 업로드하기 위한 URL을 생성합니다.
 */
export const generateUploadUrl = mutation({
  handler: async (ctx) => {
    await resolveAuthedUserId(ctx);

    return await ctx.storage.generateUploadUrl();
  },
});

/**
 * Storage ID로부터 공개 URL을 반환합니다.
 * 업로드된 파일의 타입·크기를 서버에서 검증하며, 검증 실패 시 스토리지에서 즉시 삭제합니다.
 * 검증을 통과한 파일은 temp 업로드로 등록해 TTL 청소 대상에 포함합니다.
 */
export const getImageUrl = mutation({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, args) => {
    const userId = await resolveAuthedUserId(ctx);

    const metadata = await ctx.db.system.get(args.storageId);
    if (!metadata) throw new Error("이미지를 찾을 수 없습니다.");

    if (!ALLOWED_TYPES.includes(metadata.contentType ?? "")) {
      await ctx.storage.delete(args.storageId);
      throw new Error("허용되지 않는 파일 형식입니다. (JPG, PNG, GIF, WebP만 가능)");
    }

    if (metadata.size > MAX_FILE_SIZE) {
      await ctx.storage.delete(args.storageId);
      throw new Error("파일 크기가 5MB를 초과합니다.");
    }

    const url = await ctx.storage.getUrl(args.storageId);
    if (!url) throw new Error("이미지 URL을 생성할 수 없습니다.");

    const now = Date.now();
    const existing = await ctx.db
      .query("imageUploads")
      .withIndex("by_storage_id", (q) => q.eq("storageId", args.storageId))
      .unique();

    if (existing) {
      if (existing.userId !== userId && existing.status !== "deleted") {
        throw new Error("이미지 소유자 정보가 일치하지 않습니다.");
      }
      await ctx.db.patch(existing._id, {
        userId,
        status: "temp",
        updatedAt: now,
        expiresAt: now + TEMP_UPLOAD_TTL_MS,
        attachedPostId: undefined,
      });
    } else {
      await ctx.db.insert("imageUploads", {
        userId,
        storageId: args.storageId,
        status: "temp",
        createdAt: now,
        updatedAt: now,
        expiresAt: now + TEMP_UPLOAD_TTL_MS,
      });
    }

    return {
      url,
      storageId: args.storageId,
    };
  },
});

/**
 * 업로더에서 이미지를 제거할 때 temp 업로드를 즉시 삭제합니다.
 */
export const deleteTempImage = mutation({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, args) => {
    const userId = await resolveAuthedUserId(ctx);
    const upload = await ctx.db
      .query("imageUploads")
      .withIndex("by_storage_id", (q) => q.eq("storageId", args.storageId))
      .unique();

    if (!upload || upload.userId !== userId) {
      throw new Error("삭제 권한이 없습니다.");
    }

    if (upload.status === "attached") {
      throw new Error("이미 게시글에 연결된 이미지는 업로더에서 삭제할 수 없습니다.");
    }

    try {
      await ctx.storage.delete(args.storageId);
    } catch {
      // 이미 삭제되었거나 접근 불가한 경우 상태만 정리합니다.
    }

    await ctx.db.patch(upload._id, {
      status: "deleted",
      updatedAt: Date.now(),
      expiresAt: Date.now(),
      attachedPostId: undefined,
    });

    return { ok: true };
  },
});

/**
 * 생성 성공 시 temp 업로드를 게시글에 연결 상태로 전환합니다.
 */
export const markImagesAttached = internalMutation({
  args: {
    userId: v.id("users"),
    postId: v.id("posts"),
    storageIds: v.array(v.id("_storage")),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    for (const storageId of args.storageIds) {
      const existing = await ctx.db
        .query("imageUploads")
        .withIndex("by_storage_id", (q) => q.eq("storageId", storageId))
        .unique();

      if (existing) {
        if (existing.userId !== args.userId) continue;
        await ctx.db.patch(existing._id, {
          status: "attached",
          updatedAt: now,
          attachedPostId: args.postId,
        });
        continue;
      }

      await ctx.db.insert("imageUploads", {
        userId: args.userId,
        storageId,
        status: "attached",
        createdAt: now,
        updatedAt: now,
        expiresAt: now + TEMP_UPLOAD_TTL_MS,
        attachedPostId: args.postId,
      });
    }

    return { ok: true, count: args.storageIds.length };
  },
});

/**
 * TTL이 지난 temp 업로드를 주기적으로 정리합니다.
 */
export const cleanupExpiredTempUploads = internalMutation({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const limit = args.limit ?? TEMP_UPLOAD_CLEANUP_BATCH;
    const expired = await ctx.db
      .query("imageUploads")
      .withIndex("by_status_expires_at", (q) =>
        q.eq("status", "temp").lte("expiresAt", now)
      )
      .take(limit);

    let cleaned = 0;
    for (const item of expired) {
      try {
        await ctx.storage.delete(item.storageId);
      } catch {
        // storage에 객체가 없어도 상태 정리는 진행합니다.
      }

      await ctx.db.patch(item._id, {
        status: "deleted",
        updatedAt: now,
        expiresAt: now,
        attachedPostId: undefined,
      });
      cleaned += 1;
    }

    return { cleaned };
  },
});
