import type { Id } from "../../convex/_generated/dataModel";

/** 이미지 URL + 캡션 한 쌍 */
export type ImageBlock = {
  url: string;
  caption: string;
};

/** AI가 생성한 블로그 리뷰 결과 데이터 */
export type ResultData = {
  content: string;
  imageBlocks: ImageBlock[];
  intro: string;
  outro: string;
  postId: Id<"posts">;
};
