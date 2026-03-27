import { describe, expect, it, vi } from "vitest";
import type { ActionCtx } from "../../convex/_generated/server";
import { resolveAuthedUserId } from "../../convex/generateAuth";

function makeCtx(params: {
  identity: { tokenIdentifier: string } | null;
  runQueryImpl: () => Promise<string | null>;
}): ActionCtx {
  return {
    auth: {
      getUserIdentity: vi.fn(async () => params.identity),
    },
    runQuery: vi.fn(async () => params.runQueryImpl()),
  } as unknown as ActionCtx;
}

describe("generate auth contract", () => {
  it("returns USER_NOT_FOUND with retryable false when user does not exist", async () => {
    const ctx = makeCtx({
      identity: { tokenIdentifier: "token-1" },
      runQueryImpl: async () => null,
    });

    const result = await resolveAuthedUserId(ctx);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("USER_NOT_FOUND");
      expect(result.retryable).toBe(false);
    }
  });

  it("returns USER_LOOKUP_FAILED with retryable true on lookup errors", async () => {
    const ctx = makeCtx({
      identity: { tokenIdentifier: "token-1" },
      runQueryImpl: async () => {
        throw new Error("db timeout");
      },
    });

    const result = await resolveAuthedUserId(ctx);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("USER_LOOKUP_FAILED");
      expect(result.retryable).toBe(true);
    }
  });
});
