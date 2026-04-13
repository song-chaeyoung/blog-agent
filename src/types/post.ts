import type { Id } from "../../convex/_generated/dataModel";

export type ImageBlock = {
  url: string;
  caption: string;
};

export type StageName =
  | "summary-preparation"
  | "style-profile-preparation"
  | "image-analysis"
  | "rag-context"
  | "final-draft";

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

export type SingleResultData = {
  ok: true;
  stage: "completed";
  mode: "single";
  postId: Id<"posts">;
  content: string;
  references: ReferenceSummary[];
};

export type ReviewResultData = {
  ok: true;
  stage: "completed";
  mode: "review";
  postId: Id<"posts">;
  content: string;
  imageBlocks: ImageBlock[];
  intro: string;
  outro: string;
  references: ReferenceSummary[];
};

export type ResultData = SingleResultData | ReviewResultData;
export type GenerationResult = ResultData | GenerationFailure;
