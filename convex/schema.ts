import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    tokenIdentifier: v.string(),
    name: v.string(),
    email: v.string(),
    imageUrl: v.optional(v.string()),
    provider: v.optional(v.string()),
    styleProfile: v.optional(v.string()), // 🗣️ 사용자 문체 프로필
    styleUpdatedAt: v.optional(v.number()), // 갱신 일자
  }).index("by_token", ["tokenIdentifier"]),

  styleProfiles: defineTable({
    userId: v.id("users"),
    openingMode: v.union(
      v.literal("off"),
      v.literal("preferred"),
      v.literal("strict")
    ),
    fixedOpening: v.optional(v.string()),
    openerPatterns: v.array(
      v.object({
        text: v.string(),
        repeatRate: v.number(),
        occurrences: v.number(),
        sampleSize: v.number(),
        lastSeenAt: v.number(),
      })
    ),
    toneKeywords: v.optional(v.array(v.string())),
    confidence: v.number(),
    updatedAt: v.number(),
  }).index("by_user", ["userId"]),

  posts: defineTable({
    userId: v.id("users"),
    content: v.string(),
    summary: v.optional(v.string()),
    summaryStatus: v.optional(
      v.union(v.literal("pending"), v.literal("ready"), v.literal("failed"))
    ),
    summaryError: v.optional(v.string()),
    summaryUpdatedAt: v.optional(v.number()),
    imageUrl: v.optional(v.string()),
    imageStorageId: v.optional(v.id("_storage")),
    imageBlocks: v.optional(
      v.array(
        v.object({
          url: v.string(),
          caption: v.string(),
        })
      )
    ),
    imageStorageIds: v.optional(v.array(v.id("_storage"))),
    intro: v.optional(v.string()),
    outro: v.optional(v.string()),
    references: v.optional(
      v.array(
        v.object({
          postId: v.id("posts"),
          summary: v.string(),
          score: v.number(),
        })
      )
    ),
    embedding: v.optional(v.array(v.float64())),
  })
  .index("by_userId", ["userId"])
  .vectorIndex("by_embedding", {
    vectorField: "embedding",
    dimensions: 1536,
    filterFields: ["userId"],
  }),

  imageUploads: defineTable({
    userId: v.id("users"),
    storageId: v.id("_storage"),
    status: v.union(
      v.literal("temp"),
      v.literal("attached"),
      v.literal("deleted")
    ),
    expiresAt: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
    attachedPostId: v.optional(v.id("posts")),
  })
    .index("by_storage_id", ["storageId"])
    .index("by_user_status", ["userId", "status"])
    .index("by_status_expires_at", ["status", "expiresAt"]),
});
