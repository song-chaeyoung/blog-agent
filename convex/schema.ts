import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    tokenIdentifier: v.string(),
    name: v.string(),
    email: v.string(),
    imageUrl: v.optional(v.string()),
    provider: v.optional(v.string()),
  }).index("by_token", ["tokenIdentifier"]),

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
  }).vectorIndex("by_embedding", {
    vectorField: "embedding",
    dimensions: 1536,
    filterFields: ["userId"],
  }),
});
