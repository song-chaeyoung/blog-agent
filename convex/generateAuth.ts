import type { ActionCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { fail, type GenerationFailure } from "./generateTypes";

export async function resolveAuthedUserId(
  ctx: ActionCtx
): Promise<{ ok: true; userId: Id<"users"> } | GenerationFailure> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    return fail(
      "summary-preparation",
      "UNAUTHENTICATED",
      "로그인이 필요합니다.",
      false
    );
  }

  try {
    const userId = await ctx.runQuery(internal.generateHelpers.getUserId, {
      tokenIdentifier: identity.tokenIdentifier,
    });
    return { ok: true, userId };
  } catch {
    return fail(
      "summary-preparation",
      "USER_NOT_FOUND",
      "사용자 정보를 찾을 수 없습니다.",
      false
    );
  }
}

