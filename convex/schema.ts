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

  posts: defineTable({
    userId: v.id("users"),
    content: v.string(),
    imageUrl: v.optional(v.string()),
    imageBlocks: v.optional(
      v.array(
        v.object({
          url: v.string(),
          caption: v.string(),
        })
      )
    ),
    intro: v.optional(v.string()),
    outro: v.optional(v.string()),
    embedding: v.optional(v.array(v.float64())),
    summary: v.optional(v.string()), // 📝 글 요약 (RAG용)
  })
  .index("by_userId", ["userId"])
  .vectorIndex("by_embedding", {
    vectorField: "embedding",
    dimensions: 1536,
    filterFields: ["userId"],
  }),
});