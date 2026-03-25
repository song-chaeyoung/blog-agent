import type { Id } from "./_generated/dataModel";

export type StageName =
  | "summary-preparation"
  | "style-profile-preparation"
  | "image-analysis"
  | "rag-context"
  | "final-draft";

export type OpeningMode = "off" | "preferred" | "strict";

export type StyleOpeningPattern = {
  text: string;
  repeatRate: number;
  occurrences?: number;
  sampleSize?: number;
  lastSeenAt?: number;
};

export type GenerationStyleProfile = {
  openingMode: OpeningMode;
  fixedOpening?: string;
  openerPatterns: StyleOpeningPattern[];
  toneKeywords?: string[];
  confidence?: number;
};

export type ReferenceSummary = {
  postId: Id<"posts">;
  summary: string;
  score: number;
};

export type GenerationFailure = {
  ok: false;
  failedStage: StageName;
  code: string;
  message: string;
  retryable: boolean;
};

export type SingleGenerationSuccess = {
  ok: true;
  stage: "completed";
  mode: "single";
  postId: Id<"posts">;
  content: string;
  references: ReferenceSummary[];
};

export type ReviewGenerationSuccess = {
  ok: true;
  stage: "completed";
  mode: "review";
  postId: Id<"posts">;
  content: string;
  intro: string;
  outro: string;
  imageBlocks: Array<{ url: string; caption: string }>;
  references: ReferenceSummary[];
};

export type GenerationSuccess =
  | SingleGenerationSuccess
  | ReviewGenerationSuccess;

export type GenerationResult = GenerationSuccess | GenerationFailure;

export function fail(
  failedStage: StageName,
  code: string,
  message: string,
  retryable: boolean
): GenerationFailure {
  return { ok: false, failedStage, code, message, retryable };
}
