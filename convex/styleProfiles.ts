import {
  mutation,
  query,
  internalQuery,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { v } from "convex/values";

function normalizeOpeningMode(value: "off" | "preferred" | "strict") {
  return value;
}

async function resolveCurrentUserId(ctx: QueryCtx | MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("인증되지 않은 사용자입니다.");

  const user = await ctx.db
    .query("users")
    .withIndex("by_token", (q) =>
      q.eq("tokenIdentifier", identity.tokenIdentifier)
    )
    .unique();

  if (!user) throw new Error("사용자를 찾을 수 없습니다.");
  return user._id;
}

export const getMyStyleProfile = query({
  handler: async (ctx) => {
    const userId = await resolveCurrentUserId(ctx);
    const profile = await ctx.db
      .query("styleProfiles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();

    return (
      profile ?? {
        userId,
        openingMode: "off" as const,
        fixedOpening: undefined,
        openerPatterns: [],
        toneKeywords: [],
        confidence: 0,
        updatedAt: Date.now(),
      }
    );
  },
});

export const upsertMyStyleProfile = mutation({
  args: {
    openingMode: v.union(
      v.literal("off"),
      v.literal("preferred"),
      v.literal("strict")
    ),
    fixedOpening: v.optional(v.string()),
    toneKeywords: v.optional(v.array(v.string())),
    openerPatterns: v.optional(
      v.array(
        v.object({
          text: v.string(),
          repeatRate: v.number(),
          occurrences: v.number(),
          sampleSize: v.number(),
          lastSeenAt: v.number(),
        })
      )
    ),
    confidence: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await resolveCurrentUserId(ctx);
    const openingMode = normalizeOpeningMode(args.openingMode);
    const fixedOpening = args.fixedOpening?.trim() || undefined;

    if (openingMode === "strict" && !fixedOpening) {
      throw new Error("strict 모드에서는 고정 시작문이 필요합니다.");
    }

    const openerPatterns = (args.openerPatterns ?? [])
      .map((pattern) => ({
        ...pattern,
        text: pattern.text.trim(),
      }))
      .filter((pattern) => pattern.text.length > 0)
      .slice(0, 10);

    const toneKeywords = (args.toneKeywords ?? [])
      .map((item) => item.trim())
      .filter((item) => item.length > 0)
      .slice(0, 20);

    const current = await ctx.db
      .query("styleProfiles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();

    const payload = {
      userId,
      openingMode,
      fixedOpening,
      openerPatterns,
      toneKeywords,
      confidence: args.confidence ?? current?.confidence ?? 0.7,
      updatedAt: Date.now(),
    };

    if (!current) {
      return await ctx.db.insert("styleProfiles", payload);
    }

    await ctx.db.patch(current._id, payload);
    return current._id;
  },
});

export const getStyleProfileByUser = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("styleProfiles")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .unique();
  },
});
