import { mutation, query } from "./_generated/server";

/**
 * 로그인한 사용자를 Convex users 테이블에 저장하거나 업데이트합니다.
 * ctx.auth.getUserIdentity()로 인증된 사용자 정보를 가져와서
 * tokenIdentifier 기준으로 upsert 합니다.
 */
export const upsertUser = mutation({
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("인증되지 않은 사용자입니다.");

    const existing = await ctx.db
      .query("users")
      .withIndex("by_token", (q) =>
        q.eq("tokenIdentifier", identity.tokenIdentifier)
      )
      .unique();

    const userData = {
      tokenIdentifier: identity.tokenIdentifier,
      name: identity.name ?? "Unknown",
      email: identity.email ?? "",
      imageUrl: identity.pictureUrl,
      provider: identity.issuer ?? undefined,
    };

    if (existing) {
      await ctx.db.patch(existing._id, {
        name: userData.name,
        email: userData.email,
        imageUrl: userData.imageUrl,
        provider: userData.provider,
      });
      return existing._id;
    }

    return await ctx.db.insert("users", userData);
  },
});

/**
 * 현재 로그인한 사용자 정보를 가져옵니다.
 */
export const currentUser = query({
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    return await ctx.db
      .query("users")
      .withIndex("by_token", (q) =>
        q.eq("tokenIdentifier", identity.tokenIdentifier)
      )
      .unique();
  },
});
