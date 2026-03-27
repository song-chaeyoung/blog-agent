import { describe, expect, it } from "vitest";
import {
  ensureOpeningConstraint,
  getExpectedOpening,
} from "../../convex/generateDraft";

describe("style profile contract", () => {
  it("uses fixedOpening as strict expected opener", () => {
    const expected = getExpectedOpening({
      openingMode: "strict",
      fixedOpening: "안녕하세요! 맛집 다니는 유자입니다🥰",
      openerPatterns: [],
      toneKeywords: [],
      confidence: 1,
    });

    expect(expected).toBe("안녕하세요! 맛집 다니는 유자입니다🥰");
  });

  it("strict mode fails when first line does not match", () => {
    const failure = ensureOpeningConstraint("다른 문장으로 시작", {
      openingMode: "strict",
      fixedOpening: "안녕하세요! 맛집 다니는 유자입니다🥰",
      openerPatterns: [],
      toneKeywords: [],
      confidence: 1,
    });

    expect(failure?.ok).toBe(false);
    expect(failure?.code).toBe("OPENING_CONSTRAINT_VIOLATION");
  });

  it("preferred mode does not fail on opener mismatch", () => {
    const failure = ensureOpeningConstraint("다른 문장으로 시작", {
      openingMode: "preferred",
      fixedOpening: "안녕하세요! 맛집 다니는 유자입니다🥰",
      openerPatterns: [],
      toneKeywords: [],
      confidence: 1,
    });

    expect(failure === null).toBe(true);
  });
});
