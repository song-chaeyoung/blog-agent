import { v } from "convex/values";
import { mutation } from "./_generated/server";

/**
 * 클라이언트에서 Convex Storage에 파일을 업로드하기 위한 URL을 생성합니다.
 */
export const generateUploadUrl = mutation({
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("인증되지 않은 사용자입니다.");

    return await ctx.storage.generateUploadUrl();
  },
});

/**
 * Storage ID로부터 공개 URL을 반환합니다.
 * URL만 DB에 저장하는 설계이므로, 이 mutation으로 URL을 얻어서 posts.imageUrl에 저장합니다.
 */
export const getImageUrl = mutation({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("인증되지 않은 사용자입니다.");

    const url = await ctx.storage.getUrl(args.storageId);
    if (!url) throw new Error("이미지를 찾을 수 없습니다.");

    return url;
  },
});
