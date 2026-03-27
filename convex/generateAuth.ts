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
    if (!userId) {
      return fail(
        "summary-preparation",
        "USER_NOT_FOUND",
        "사용자 정보를 찾을 수 없습니다.",
        false
      );
    }
    return { ok: true, userId };
  } catch {
    return fail(
      "summary-preparation",
      "USER_LOOKUP_FAILED",
      "사용자 정보를 조회하는 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.",
      true
    );
  }
}
