import { v } from "convex/values";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import OpenAI from "openai";
import {
  BATCH_SIZE,
  BLOG_MAX_TOKENS,
  RAG_SEARCH_LIMIT,
  REVIEW_MAX_TOKENS,
  VISION_MAX_TOKENS,
} from "./constants";

const STYLE_REFERENCE_LIMIT = 3;
const RAG_TOP_K = 5;

const STYLE_REFERENCE_CHAR_LIMIT = 1400;
const RAG_REFERENCE_ITEM_CHAR_LIMIT = 800;
const RAG_REFERENCE_SUMMARY_CHAR_LIMIT = 320;
const RAG_REFERENCE_CONTENT_CHAR_LIMIT = 560;
const RAG_REFERENCE_CHAR_LIMIT = 4200;
const RAG_TONE_ITEM_CHAR_LIMIT = 450;
const RAG_TONE_CHAR_LIMIT = 2600;
const IMAGE_DESCRIPTION_CHAR_LIMIT = 500;
const IMAGE_SUMMARY_CHAR_LIMIT = 320;
const IMAGE_SUMMARY_BLOCK_CHAR_LIMIT = 2200;
const MEMO_CHAR_LIMIT = 500;
const KEYWORDS_CHAR_LIMIT = 300;
const OUTLINE_INPUT_CHAR_LIMIT = 5600;
const FINAL_INPUT_CHAR_LIMIT = 3600;
const SUMMARY_CHAR_LIMIT = 260;
const CAPTION_CHAR_LIMIT = 700;
const OUTLINE_ITEM_CHAR_LIMIT = 360;
const FINAL_STYLE_BLOCK_CHAR_LIMIT = 900;
const FINAL_RAG_BLOCK_CHAR_LIMIT = 1200;
const FINAL_TONE_BLOCK_CHAR_LIMIT = 1400;
const FINAL_IMAGE_DIGEST_BLOCK_CHAR_LIMIT = 900;
const FINAL_OUTLINE_BLOCK_CHAR_LIMIT = 900;
const FINAL_MEMO_BLOCK_CHAR_LIMIT = 260;
const FINAL_KEYWORDS_BLOCK_CHAR_LIMIT = 180;
const MIN_VISION_DESCRIPTION_CHARS = 140;
const MIN_VISION_DESCRIPTION_SENTENCES = 4;
const MIN_REVIEW_CAPTION_CHARS = 140;
const MIN_REVIEW_CAPTION_SENTENCES = 3;
const MIN_REVIEW_EDGE_CHARS = 120;
const MIN_REVIEW_EDGE_SENTENCES = 3;
const STYLE_REFRESH_INTERVAL_MS = 1000 * 60 * 60 * 24 * 7;
const CAPTION_ANCHOR_STOPWORDS = new Set([
  "그리고",
  "하지만",
  "그래서",
  "정말",
  "너무",
  "오늘",
  "이번",
  "여기",
  "저기",
  "사진",
  "모습",
  "느낌",
  "분위기",
  "공간",
  "사람",
  "이곳",
  "장소",
  "메뉴",
  "요리",
  "음식",
]);

const SINGLE_VISION_PROMPT =
  "Describe this image for writing a personal blog post in Korean.\n" +
  "Rules:\n" +
  "1) Write 4-6 sentences.\n" +
  "2) Cover only visible facts: overall scene, foreground/background details, and color/light or texture cues.\n" +
  "3) Keep details concrete and avoid one-line generic summaries.\n" +
  "4) Do not infer unseen information (people's actions, conversations, emotions, or atmosphere).\n" +
  "5) Do not use markdown.";

const SINGLE_VISION_RETRY_PROMPT =
  "The previous description was too short. Rewrite the image description in Korean with richer detail.\n" +
  "Rules:\n" +
  "1) Write 5-7 sentences and at least 180 Korean characters.\n" +
  "2) Include only visible details: scene, objects, placement, and sensory cues (color/light/texture).\n" +
  "3) Avoid generic phrases and repetition.\n" +
  "4) Do not infer unseen information (people's actions, conversations, emotions, or atmosphere).\n" +
  "5) Do not use markdown.";

const VISION_FALLBACK_DESCRIPTION = "이미지 세부 묘사 추출에 실패했습니다.";

const openai = () => new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

type PostLike = {
  content: string;
  summary?: string;
};

type VisionResult = {
  index: number;
  url: string;
  description: string;
};

type ReviewVisionDigest = {
  images: Array<{
    index: number;
    summary: string;
    keywords: string[];
  }>;
  keyPoints: string[];
  ragQuery: string;
};

type SingleVisionDigest = {
  summary: string;
  keywords: string[];
  ragQuery: string;
};

type ReviewOutline = {
  introOutline: string;
  captionOutlines: string[];
  outroOutline: string;
};

type ReviewFinal = {
  intro: string;
  captions: string[];
  outro: string;
  summary: string;
};

type RagReferences = {
  fact: string;
  tone: string;
};

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function clipText(value: string, limit: number): string {
  const normalized = normalizeWhitespace(value);
  if (normalized.length <= limit) return normalized;
  return `${normalized.slice(0, Math.max(0, limit - 1))}…`;
}

function getMessageText(
  completion: OpenAI.Chat.Completions.ChatCompletion,
): string {
  const message = completion.choices[0]?.message?.content;
  if (!message) return "";
  if (typeof message === "string") return message.trim();
  return "";
}

function parseJsonObject<T extends Record<string, unknown>>(
  raw: string,
  fallback: T,
): T {
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as T;
    }
    return fallback;
  } catch {
    return fallback;
  }
}

function sanitizeStringArray(
  values: unknown,
  maxLengthPerItem: number,
): string[] {
  if (!Array.isArray(values)) return [];
  return values
    .map((item) =>
      typeof item === "string" ? clipText(item, maxLengthPerItem) : "",
    )
    .filter((item) => item !== "");
}

function textOrEmpty(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return "";
  return clipText(value, maxLength);
}

function textOrEmptyRaw(value: unknown): string {
  if (typeof value !== "string") return "";
  return normalizeWhitespace(value);
}

function sanitizeStringArrayRaw(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return values
    .map((item) => (typeof item === "string" ? normalizeWhitespace(item) : ""))
    .filter((item) => item !== "");
}

function normalizeKeywordList(values: string[] | undefined): string[] {
  if (!values) return [];
  return values
    .map((value) => normalizeWhitespace(value))
    .filter((value) => value !== "");
}

function hasAnyKeyword(text: string, keywords: string[]): boolean {
  if (keywords.length === 0) return true;
  const normalizedText = normalizeWhitespace(text);
  return keywords.some((keyword) => normalizedText.includes(keyword));
}

function extractAnchorTokens(text: string): string[] {
  const tokens = normalizeWhitespace(text)
    .toLowerCase()
    .match(/[가-힣a-z0-9]{2,}/g);
  if (!tokens) return [];
  return tokens.filter((token) => !CAPTION_ANCHOR_STOPWORDS.has(token));
}

function hasAnchorOverlap(text: string, anchor: string): boolean {
  const anchorTokens = extractAnchorTokens(anchor);
  if (anchorTokens.length === 0) return true;
  const textTokens = new Set(extractAnchorTokens(text));
  return anchorTokens.some((token) => textTokens.has(token));
}

function countSentences(value: string): number {
  const normalized = normalizeWhitespace(value);
  if (!normalized) return 0;
  return normalized
    .split(/[.!?]+|\n+/)
    .map((part) => part.trim())
    .filter((part) => part !== "").length;
}

function shouldRetryVisionDescription(description: string): boolean {
  const normalized = normalizeWhitespace(description);
  return (
    normalized.length < MIN_VISION_DESCRIPTION_CHARS ||
    countSentences(normalized) < MIN_VISION_DESCRIPTION_SENTENCES
  );
}

function isShortDraftSection(
  text: string,
  minChars: number,
  minSentences: number,
): boolean {
  const normalized = normalizeWhitespace(text);
  if (!normalized) return true;
  return (
    normalized.length < minChars || countSentences(normalized) < minSentences
  );
}

function shouldRetryReviewFinalDraft(
  draft: ReviewFinal,
  imageCount: number,
  requiredKeywords: string[] = [],
  visionAnchors: string[] = [],
): boolean {
  const isTooLong = (text: string, maxChars: number) =>
    normalizeWhitespace(text).length > maxChars;

  if (isShortDraftSection(draft.intro, MIN_REVIEW_EDGE_CHARS, MIN_REVIEW_EDGE_SENTENCES)) {
    return true;
  }
  if (isTooLong(draft.intro, 1200)) {
    return true;
  }
  if (isShortDraftSection(draft.outro, MIN_REVIEW_EDGE_CHARS, MIN_REVIEW_EDGE_SENTENCES)) {
    return true;
  }
  if (isTooLong(draft.outro, 1200)) {
    return true;
  }
  if (draft.captions.length < imageCount) {
    return true;
  }
  const hasInvalidCaption = draft.captions
    .slice(0, imageCount)
    .some(
      (caption) =>
        isShortDraftSection(
          caption,
          MIN_REVIEW_CAPTION_CHARS,
          MIN_REVIEW_CAPTION_SENTENCES,
        ) || isTooLong(caption, CAPTION_CHAR_LIMIT),
    );
  if (hasInvalidCaption) {
    return true;
  }
  if (requiredKeywords.length > 0) {
    const fullText = joinOptionalParts([
      draft.intro,
      ...draft.captions.slice(0, imageCount),
      draft.outro,
    ]);
    if (!hasAnyKeyword(fullText, requiredKeywords)) {
      return true;
    }
  }
  if (visionAnchors.length > 0) {
    const hasUngroundedCaption = draft.captions
      .slice(0, imageCount)
      .some((caption, index) => !hasAnchorOverlap(caption, visionAnchors[index] ?? ""));
    if (hasUngroundedCaption) {
      return true;
    }
  }
  return false;
}

function shouldRefreshStyleProfile(styleUpdatedAt?: number): boolean {
  if (!styleUpdatedAt) return true;
  return Date.now() - styleUpdatedAt > STYLE_REFRESH_INTERVAL_MS;
}

async function requestSingleImageVisionDescription(
  ai: OpenAI,
  imageUrl: string,
  prompt: string,
): Promise<string> {
  const response = await ai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "user",
        content: [
          { type: "image_url", image_url: { url: imageUrl } },
          { type: "text", text: prompt },
        ],
      },
    ],
    max_tokens: VISION_MAX_TOKENS,
  });

  return getMessageText(response);
}

function buildStyleReference(
  styleProfile: string | undefined,
  recentPosts: PostLike[],
): string {
  if (styleProfile) {
    return clipText(styleProfile, STYLE_REFERENCE_CHAR_LIMIT);
  }

  const samples = recentPosts
    .map((post, i) => {
      const sample = post.summary
        ? clipText(post.summary, RAG_REFERENCE_ITEM_CHAR_LIMIT)
        : clipText(post.content, RAG_REFERENCE_ITEM_CHAR_LIMIT);
      return `[style sample ${i + 1}] ${sample}`;
    })
    .join("\n");

  if (!samples) {
    return "Use a personal and natural diary-like tone. Keep wording simple and concrete.";
  }

  return clipText(samples, STYLE_REFERENCE_CHAR_LIMIT);
}

function buildRagFactReference(posts: PostLike[]): string {
  const references = posts
    .slice(0, RAG_TOP_K)
    .map((post, i) => {
      const summaryPart = post.summary
        ? clipText(post.summary, RAG_REFERENCE_SUMMARY_CHAR_LIMIT)
        : "";
      const contentPart = clipText(post.content, RAG_REFERENCE_CONTENT_CHAR_LIMIT);
      const merged = summaryPart
        ? `[summary] ${summaryPart}\n[context] ${contentPart}`
        : `[context] ${contentPart}`;
      return clipText(`[related ${i + 1}]\n${merged}`, RAG_REFERENCE_ITEM_CHAR_LIMIT);
    })
    .join("\n");

  return clipText(references, RAG_REFERENCE_CHAR_LIMIT);
}

function buildRagToneReference(posts: PostLike[]): string {
  const tones = posts
    .slice(0, RAG_TOP_K)
    .map((post, i) => {
      const source = post.content || post.summary || "";
      const snippet = clipText(source, RAG_TONE_ITEM_CHAR_LIMIT);
      return snippet ? `[tone ${i + 1}] ${snippet}` : "";
    })
    .filter((item) => item !== "")
    .join("\n");

  return clipText(tones, RAG_TONE_CHAR_LIMIT);
}

function interleavePosts(primary: PostLike[], secondary: PostLike[]): PostLike[] {
  const merged: PostLike[] = [];
  const max = Math.max(primary.length, secondary.length);
  for (let i = 0; i < max; i += 1) {
    if (primary[i]) merged.push(primary[i]);
    if (secondary[i]) merged.push(secondary[i]);
  }
  return merged;
}

function buildRagReferences(
  similarPosts: PostLike[],
  fallbackPosts: PostLike[],
): RagReferences {
  const factSource = similarPosts.length > 0 ? similarPosts : fallbackPosts;
  const toneSource = interleavePosts(similarPosts, fallbackPosts);
  return {
    fact: buildRagFactReference(factSource),
    tone: buildRagToneReference(toneSource),
  };
}

function joinOptionalParts(parts: Array<string | undefined>): string {
  return parts
    .map((part) => (part ? normalizeWhitespace(part) : ""))
    .filter((part) => part !== "")
    .join("\n\n");
}

function normalizeCaptions(
  imageCount: number,
  generated: string[],
  outline: string[],
  imageFallbacks: string[],
): string[] {
  return Array.from({ length: imageCount }, (_, index) => {
    const primary = generated[index] ?? "";
    const backupOutline = outline[index] ?? "";
    const backupImage = imageFallbacks[index] ?? "";
    const selected =
      primary && hasAnchorOverlap(primary, backupImage)
        ? primary
        : backupImage || backupOutline || primary;
    return normalizeWhitespace(selected);
  });
}

async function analyzeImages(
  ai: OpenAI,
  imageUrls: string[],
): Promise<VisionResult[]> {
  const visionResults: VisionResult[] = [];

  for (let start = 0; start < imageUrls.length; start += BATCH_SIZE) {
    const batch = imageUrls.slice(start, start + BATCH_SIZE);
    const batchResults = await Promise.all(
      batch.map(async (url, batchIndex) => {
        try {
          const firstDescription = await requestSingleImageVisionDescription(
            ai,
            url,
            SINGLE_VISION_PROMPT,
          );
          const finalDescription = shouldRetryVisionDescription(
            firstDescription,
          )
            ? await requestSingleImageVisionDescription(
                ai,
                url,
                SINGLE_VISION_RETRY_PROMPT,
              )
            : firstDescription;
          const description = clipText(
            finalDescription,
            IMAGE_DESCRIPTION_CHAR_LIMIT,
          );

          return {
            index: start + batchIndex,
            url,
            description: description || VISION_FALLBACK_DESCRIPTION,
          };
        } catch {
          return {
            index: start + batchIndex,
            url,
            description: VISION_FALLBACK_DESCRIPTION,
          };
        }
      }),
    );

    visionResults.push(...batchResults);
  }

  visionResults.sort((a, b) => a.index - b.index);
  return visionResults;
}

async function summarizeReviewVision(
  ai: OpenAI,
  visionResults: VisionResult[],
): Promise<ReviewVisionDigest> {
  const visionPayload = visionResults
    .map(
      (item, i) =>
        `[image ${i + 1}]\n${clipText(item.description, IMAGE_DESCRIPTION_CHAR_LIMIT)}`,
    )
    .join("\n\n");

  const response = await ai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content:
          'You compress vision notes for downstream RAG and writing. Return strict JSON with this shape: {"images":[{"index":1,"summary":"...","keywords":["..."]}],"keyPoints":["..."],"ragQuery":"..."}. All textual values must be in Korean.',
      },
      {
        role: "user",
        content:
          `Summarize the image notes below.\n` +
          `Rules:\n` +
          `1) Keep each images[].summary to 2-4 sentences with concrete details.\n` +
          `2) Keep images[].keywords to 3-5 short tokens.\n` +
          `3) keyPoints must contain 4-6 concise bullets.\n` +
          `4) ragQuery must be one compact paragraph for vector search.\n` +
          `5) Preserve chronology by image index.\n` +
          `6) Every textual field must be Korean.\n` +
          `7) Use only information visible in the notes. Do not infer people, conversation, emotions, or atmosphere.\n\n` +
          `${visionPayload}`,
      },
    ],
    max_tokens: 900,
    response_format: { type: "json_object" },
  });

  const fallback: ReviewVisionDigest = {
    images: visionResults.map((item) => ({
      index: item.index + 1,
      summary: clipText(item.description, IMAGE_SUMMARY_CHAR_LIMIT),
      keywords: [],
    })),
    keyPoints: [],
    ragQuery: clipText(
      visionResults.map((item) => item.description).join(" "),
      IMAGE_SUMMARY_BLOCK_CHAR_LIMIT,
    ),
  };

  const parsed = parseJsonObject<Record<string, unknown>>(
    getMessageText(response),
    {},
  );
  const imagesRaw = Array.isArray(parsed.images) ? parsed.images : [];
  const images = imagesRaw
    .map((item, idx) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return null;
      const record = item as Record<string, unknown>;
      const summary = textOrEmpty(record.summary, IMAGE_SUMMARY_CHAR_LIMIT);
      return {
        index: idx + 1,
        summary,
        keywords: sanitizeStringArray(record.keywords, 24).slice(0, 5),
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);

  const mergedImages = visionResults.map((item, idx) => {
    const fromModel = images[idx];
    return {
      index: idx + 1,
      summary:
        fromModel?.summary ||
        clipText(item.description, IMAGE_SUMMARY_CHAR_LIMIT),
      keywords: fromModel?.keywords ?? [],
    };
  });

  const keyPoints = sanitizeStringArray(parsed.keyPoints, 120).slice(0, 6);
  const ragQuery = textOrEmpty(parsed.ragQuery, IMAGE_SUMMARY_BLOCK_CHAR_LIMIT);

  return {
    images: mergedImages,
    keyPoints: keyPoints.length > 0 ? keyPoints : fallback.keyPoints,
    ragQuery: ragQuery || fallback.ragQuery,
  };
}

async function summarizeSingleVision(
  ai: OpenAI,
  description: string,
): Promise<SingleVisionDigest> {
  const response = await ai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content:
          'Return strict JSON for single-image compression: {"summary":"...","keywords":["..."],"ragQuery":"..."}. All textual values must be in Korean.',
      },
      {
        role: "user",
        content:
          `Summarize this vision note for style-preserving blog generation and vector search.\n` +
          `summary must be 2-3 sentences.\n` +
          `keywords must contain 5-8 words.\n` +
          `ragQuery must be one compact paragraph.\n` +
          `Use only visible facts from the note. Do not infer conversation, emotions, or atmosphere.\n` +
          `All textual values must be Korean.\n\n` +
          `${clipText(description, IMAGE_DESCRIPTION_CHAR_LIMIT)}`,
      },
    ],
    max_tokens: 350,
    response_format: { type: "json_object" },
  });

  const parsed = parseJsonObject<Record<string, unknown>>(
    getMessageText(response),
    {},
  );
  return {
    summary: textOrEmpty(parsed.summary, 260) || clipText(description, 260),
    keywords: sanitizeStringArray(parsed.keywords, 24).slice(0, 8),
    ragQuery: textOrEmpty(parsed.ragQuery, 900) || clipText(description, 900),
  };
}

async function buildReviewOutline(
  ai: OpenAI,
  input: {
    styleReference: string;
    toneReference: string;
    imageDigest: string;
    imageCount: number;
    memo: string;
    keywords: string;
  },
): Promise<ReviewOutline> {
  const prompt = clipText(
    [
      `[style guide]\n${input.styleReference}`,
      input.toneReference ? `[tone reference]\n${input.toneReference}` : "",
      `[image digest]\n${input.imageDigest}`,
      input.memo ? `[memo]\n${input.memo}` : "",
      input.keywords ? `[keywords]\n${input.keywords}` : "",
      `Create an outline for ${input.imageCount} images.`,
    ]
      .filter((section) => section !== "")
      .join("\n\n"),
    OUTLINE_INPUT_CHAR_LIMIT,
  );

  const response = await ai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content:
          'Return strict JSON: {"introOutline":"...","captionOutlines":["..."],"outroOutline":"..."}. All textual values must be in Korean.',
      },
      {
        role: "user",
        content:
          `${prompt}\n\n` +
          `Rules:\n` +
          `1) captionOutlines length must be exactly ${input.imageCount}.\n` +
          `2) Each caption outline should include at least two visible key points (objects/text/signs/layout).\n` +
          `3) Keep outline-level wording, but include concrete nouns and sensory cues.\n` +
          `4) Use the same language as the style guide.\n` +
          `5) If tone reference exists, mimic sentence endings and rhythm (e.g. ~했어요, ~더라고요) without copying sentences.\n` +
          `6) Output only Korean text.\n` +
          `7) captionOutlines[i] must correspond to [image i] in the same order; never swap indices.\n` +
          `8) Treat memo and keywords as highest-priority context. If related notes conflict, follow memo/keywords and image digest.\n` +
          `9) Do not introduce entities not present in image digest or memo.`,
      },
    ],
    max_tokens: 1000,
    response_format: { type: "json_object" },
  });

  const parsed = parseJsonObject<Record<string, unknown>>(
    getMessageText(response),
    {},
  );
  const outlines = sanitizeStringArray(parsed.captionOutlines, OUTLINE_ITEM_CHAR_LIMIT);
  return {
    introOutline: textOrEmpty(parsed.introOutline, 320),
    captionOutlines: outlines,
    outroOutline: textOrEmpty(parsed.outroOutline, 320),
  };
}

async function buildReviewFinal(
  ai: OpenAI,
  input: {
    styleReference: string;
    toneReference: string;
    imageDigest: string;
    ragFactReference: string;
    outline: ReviewOutline;
    imageCount: number;
    memo: string;
    keywords: string;
    requiredKeywords?: string[];
    retryForDetail?: boolean;
  },
): Promise<ReviewFinal> {
  const requiredKeywords = normalizeKeywordList(input.requiredKeywords);
  const requiredKeywordsBlock =
    requiredKeywords.length > 0 ? requiredKeywords.join(", ") : "";
  const outlineText = JSON.stringify(input.outline);
  const styleBlock = clipText(input.styleReference, FINAL_STYLE_BLOCK_CHAR_LIMIT);
  const toneBlock = input.toneReference
    ? clipText(input.toneReference, FINAL_TONE_BLOCK_CHAR_LIMIT)
    : "";
  const ragBlock = input.ragFactReference
    ? clipText(input.ragFactReference, FINAL_RAG_BLOCK_CHAR_LIMIT)
    : "";
  const imageDigestBlock = clipText(
    input.imageDigest,
    FINAL_IMAGE_DIGEST_BLOCK_CHAR_LIMIT,
  );
  const outlineBlock = clipText(outlineText, FINAL_OUTLINE_BLOCK_CHAR_LIMIT);
  const memoBlock = input.memo
    ? clipText(input.memo, FINAL_MEMO_BLOCK_CHAR_LIMIT)
    : "";
  const keywordsBlock = input.keywords
    ? clipText(input.keywords, FINAL_KEYWORDS_BLOCK_CHAR_LIMIT)
    : "";
  const userPayload = clipText(
    [
      `[style guide]\n${styleBlock}`,
      toneBlock ? `[tone reference]\n${toneBlock}` : "",
      ragBlock ? `[related notes - intro/outro only]\n${ragBlock}` : "",
      `[image digest]\n${imageDigestBlock}`,
      `[outline]\n${outlineBlock}`,
      memoBlock ? `[memo]\n${memoBlock}` : "",
      keywordsBlock ? `[keywords]\n${keywordsBlock}` : "",
      requiredKeywordsBlock
        ? `[required keywords]\n${requiredKeywordsBlock}`
        : "",
      `Write a review post for exactly ${input.imageCount} images.`,
    ]
      .filter((section) => section !== "")
      .join("\n\n"),
    FINAL_INPUT_CHAR_LIMIT,
  );

  const response = await ai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content:
          'Return strict JSON: {"intro":"...","captions":["..."],"outro":"...","summary":"..."}. All textual values must be in Korean.',
      },
      {
        role: "user",
        content:
          `${userPayload}\n\n` +
          `Rules:\n` +
          `1) Follow the style guide closely.\n` +
          `2) captions length must be exactly ${input.imageCount}.\n` +
          `3) Keep each caption to 3-4 sentences with concrete visible details only (objects/text/layout).\n` +
          `4) intro/outro should be 3-5 sentences each.\n` +
          `5) summary should be 2-3 concise sentences.\n` +
          `6) Use the same language as the style guide and memo.\n` +
          `7) If tone reference is provided, follow its conversational endings and cadence (예: ~했어요, ~더라고요) without copying sentences.\n` +
          `8) If related notes are provided, use them only in intro/outro; never use them to add caption facts.\n` +
          `9) Output only Korean text.\n` +
          `10) No markdown.\n` +
          `11) captions[i] must describe [image i] in the same order; never reorder captions.\n` +
          `12) Do not invent unseen facts. Avoid asserting conversation, emotions, or atmosphere unless clearly visible in the image or memo.\n` +
          `13) Treat [memo] and [keywords] as highest priority. If related notes conflict, follow memo and visible image digest.\n` +
          `14) If [required keywords] exists, include at least one of them exactly as written in the final text.\n` +
          (input.retryForDetail
            ? `15) Previous draft was too short/too long or missed required keywords. Adjust while keeping natural spoken tone.\n` +
              `16) Every caption must be 3-4 sentences, roughly 140-${CAPTION_CHAR_LIMIT} Korean characters.\n` +
              `17) Intro and outro must each be 3-5 sentences, up to 1200 Korean characters.\n`
            : ""),
      },
    ],
    max_tokens: REVIEW_MAX_TOKENS,
    response_format: { type: "json_object" },
  });

  const parsed = parseJsonObject<Record<string, unknown>>(
    getMessageText(response),
    {},
  );
  return {
    intro: textOrEmptyRaw(parsed.intro),
    captions: sanitizeStringArrayRaw(parsed.captions),
    outro: textOrEmptyRaw(parsed.outro),
    summary: textOrEmpty(parsed.summary, SUMMARY_CHAR_LIMIT),
  };
}

export const createBlogFromImage = action({
  args: { imageUrl: v.string() },
  handler: async (
    ctx,
    args,
  ): Promise<{ content: string; postId: Id<"posts"> }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("인증되지 않은 사용자입니다.");

    const user = await ctx.runQuery(internal.generateHelpers.getUserProfile, {
      tokenIdentifier: identity.tokenIdentifier,
    });
    if (!user) throw new Error("사용자를 찾을 수 없습니다.");

    const ai = openai();
    const userId = user._id;

    const firstVisionDescription = await requestSingleImageVisionDescription(
      ai,
      args.imageUrl,
      SINGLE_VISION_PROMPT,
    );
    const finalVisionDescription = shouldRetryVisionDescription(
      firstVisionDescription,
    )
      ? await requestSingleImageVisionDescription(
          ai,
          args.imageUrl,
          SINGLE_VISION_RETRY_PROMPT,
        )
      : firstVisionDescription;

    const visionDescription = clipText(
      finalVisionDescription,
      IMAGE_DESCRIPTION_CHAR_LIMIT,
    );
    const visionDigest = await summarizeSingleVision(ai, visionDescription);

    const [recentPosts, embeddingRes] = await Promise.all([
      ctx.runQuery(internal.generateHelpers.getRecentPosts, {
        userId,
        limit: STYLE_REFERENCE_LIMIT,
      }),
      ai.embeddings.create({
        model: "text-embedding-3-small",
        input: clipText(visionDigest.ragQuery, 900),
      }),
    ]);

    const embedding = embeddingRes.data[0].embedding;

    const searchResults = await ctx.vectorSearch("posts", "by_embedding", {
      vector: embedding,
      limit: Math.min(RAG_SEARCH_LIMIT, RAG_TOP_K),
      filter: (q) => q.eq("userId", userId),
    });

    const similarPosts = (await ctx.runQuery(
      internal.generateHelpers.getPostsByIds,
      {
        ids: searchResults.map((item) => item._id),
      },
    )) as PostLike[];

    const styleReference = buildStyleReference(
      user.styleProfile,
      recentPosts as PostLike[],
    );
    const ragRefs = buildRagReferences(
      similarPosts,
      recentPosts as PostLike[],
    );
    const ragFactReference = ragRefs.fact;
    const ragToneReference = ragRefs.tone;
    const keywords = clipText(
      visionDigest.keywords.join(", "),
      KEYWORDS_CHAR_LIMIT,
    );

    const generateRes = await ai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content:
            'Return strict JSON only: {"content":"...","summary":"..."}.\nFollow style guide first, then use tone reference and related notes as supporting context.\nUse the same language as the style guide and memo.\nAll textual values must be in Korean.',
        },
        {
          role: "user",
          content: clipText(
            [
              `[style guide]\n${styleReference}`,
              ragToneReference ? `[tone reference]\n${ragToneReference}` : "",
              ragFactReference
                ? `[related notes]\n${ragFactReference}`
                : "",
              `[image summary]\n${visionDigest.summary}`,
              keywords ? `[keywords]\n${keywords}` : "",
              "tone reference가 있으면 말투(종결어미/호흡)만 차용하고 문장은 복사하지 마세요.",
              "Write one coherent blog post with a personal, natural tone.",
              "반드시 한국어로만 작성하세요.",
            ]
              .filter((section) => section !== "")
              .join("\n\n"),
            FINAL_INPUT_CHAR_LIMIT,
          ),
        },
      ],
      max_tokens: BLOG_MAX_TOKENS,
      response_format: { type: "json_object" },
    });

    const parsed = parseJsonObject<Record<string, unknown>>(
      getMessageText(generateRes),
      {},
    );
    const generatedContent = textOrEmpty(parsed.content, 8000);
    const summary =
      textOrEmpty(parsed.summary, SUMMARY_CHAR_LIMIT) ||
      clipText(generatedContent, SUMMARY_CHAR_LIMIT);

    if (!generatedContent) {
      throw new Error("생성 결과가 비어 있습니다. 다시 시도해 주세요.");
    }

    const postId = await ctx.runMutation(
      internal.generateHelpers.saveGeneratedPost,
      {
        userId,
        content: generatedContent,
        imageUrl: args.imageUrl,
        embedding,
        summary,
      },
    );

    if (shouldRefreshStyleProfile(user.styleUpdatedAt)) {
      const analyzeUserStyleAction = (
        internal as unknown as {
          generate?: { analyzeUserStyle?: Parameters<typeof ctx.runAction>[0] };
        }
      ).generate?.analyzeUserStyle;
      if (analyzeUserStyleAction) {
        ctx.runAction(analyzeUserStyleAction, { userId }).catch(() => {});
      }
    }

    return { content: generatedContent, postId };
  },
});

export const createBlogReview = action({
  args: {
    imageUrls: v.array(v.string()),
    memo: v.optional(v.string()),
    keywords: v.optional(v.array(v.string())),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{
    content: string;
    imageBlocks: Array<{ url: string; caption: string }>;
    intro: string;
    outro: string;
    postId: Id<"posts">;
  }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("인증되지 않은 사용자입니다.");

    const user = await ctx.runQuery(internal.generateHelpers.getUserProfile, {
      tokenIdentifier: identity.tokenIdentifier,
    });
    if (!user) throw new Error("사용자를 찾을 수 없습니다.");

    const ai = openai();
    const userId = user._id;

    const [visionResults, recentPosts] = await Promise.all([
      analyzeImages(ai, args.imageUrls),
      ctx.runQuery(internal.generateHelpers.getRecentPosts, {
        userId,
        limit: STYLE_REFERENCE_LIMIT,
      }),
    ]);

    if (visionResults.length === 0) {
      throw new Error("이미지 분석에 실패했습니다. 다시 시도해 주세요.");
    }

    const visionDigest = await summarizeReviewVision(ai, visionResults);
    const imageDigestText = clipText(
      visionDigest.images
        .map((item) => `[image ${item.index}] ${item.summary}`)
        .join("\n"),
      IMAGE_SUMMARY_BLOCK_CHAR_LIMIT,
    );

    const memo = args.memo ? clipText(args.memo, MEMO_CHAR_LIMIT) : "";
    const keywords = args.keywords?.length
      ? clipText(args.keywords.join(", "), KEYWORDS_CHAR_LIMIT)
      : "";
    const requiredKeywords = normalizeKeywordList(args.keywords);

    const ragQueryInput = clipText(
      [memo, keywords, visionDigest.ragQuery]
        .filter((part) => part !== "")
        .join("\n"),
      1200,
    );

    const embeddingRes = await ai.embeddings.create({
      model: "text-embedding-3-small",
      input: ragQueryInput,
    });
    const embedding = embeddingRes.data[0].embedding;

    const searchResults = await ctx.vectorSearch("posts", "by_embedding", {
      vector: embedding,
      limit: Math.min(RAG_SEARCH_LIMIT, RAG_TOP_K),
      filter: (q) => q.eq("userId", userId),
    });

    const similarPosts = (await ctx.runQuery(
      internal.generateHelpers.getPostsByIds,
      {
        ids: searchResults.map((item) => item._id),
      },
    )) as PostLike[];

    const styleReference = buildStyleReference(
      user.styleProfile,
      recentPosts as PostLike[],
    );
    const ragRefs = buildRagReferences(
      similarPosts,
      recentPosts as PostLike[],
    );
    const ragFactReference = ragRefs.fact;
    const ragToneReference = ragRefs.tone;

    const outline = await buildReviewOutline(ai, {
      styleReference,
      toneReference: ragToneReference,
      imageDigest: imageDigestText,
      imageCount: visionResults.length,
      memo,
      keywords,
    });

    const fallbackImageSummaries = visionResults.map(
      (item, index) => visionDigest.images[index]?.summary || item.description,
    );
    const captionAnchors = visionResults.map(
      (item, index) => `${item.description} ${fallbackImageSummaries[index] ?? ""}`,
    );

    const firstFinalDraft = await buildReviewFinal(ai, {
      styleReference,
      toneReference: ragToneReference,
      imageDigest: imageDigestText,
      ragFactReference,
      outline,
      imageCount: visionResults.length,
      memo,
      keywords,
      requiredKeywords,
    });
    const finalDraft = shouldRetryReviewFinalDraft(
      firstFinalDraft,
      visionResults.length,
      requiredKeywords,
      captionAnchors,
    )
      ? await buildReviewFinal(ai, {
          styleReference,
          toneReference: ragToneReference,
          imageDigest: imageDigestText,
          ragFactReference,
          outline,
          imageCount: visionResults.length,
          memo,
          keywords,
          requiredKeywords,
          retryForDetail: true,
        })
      : firstFinalDraft;
    const captions = normalizeCaptions(
      visionResults.length,
      finalDraft.captions,
      outline.captionOutlines,
      fallbackImageSummaries,
    );

    const introFallback = clipText(visionDigest.images[0]?.summary ?? "", 220);
    const intro =
      finalDraft.intro ||
      outline.introOutline ||
      introFallback ||
      "오늘의 기록을 정리해 봅니다.";
    const outro =
      finalDraft.outro || outline.outroOutline || "이번 기록은 여기까지입니다.";

    const imageBlocks = visionResults.map((item, index) => ({
      url: item.url,
      caption: captions[index] ?? "",
    }));

    const content = joinOptionalParts([
      intro,
      ...imageBlocks.map((item) => item.caption),
      outro,
    ]);

    if (!content) {
      throw new Error("생성 결과가 비어 있습니다. 다시 시도해 주세요.");
    }

    const summary =
      finalDraft.summary ||
      clipText(
        [intro, outro, ...visionDigest.keyPoints]
          .filter((item) => item !== "")
          .join(" "),
        SUMMARY_CHAR_LIMIT,
      );

    const postId = await ctx.runMutation(
      internal.generateHelpers.saveGeneratedReviewPost,
      {
        userId,
        content,
        imageBlocks,
        intro,
        outro,
        embedding,
        summary,
      },
    );

    if (shouldRefreshStyleProfile(user.styleUpdatedAt)) {
      const analyzeUserStyleAction = (
        internal as unknown as {
          generate?: { analyzeUserStyle?: Parameters<typeof ctx.runAction>[0] };
        }
      ).generate?.analyzeUserStyle;
      if (analyzeUserStyleAction) {
        ctx.runAction(analyzeUserStyleAction, { userId }).catch(() => {});
      }
    }

    return { content, imageBlocks, intro, outro, postId };
  },
});

export const analyzeUserStyle = action({
  args: { userId: v.id("users") },
  handler: async (ctx, args): Promise<string> => {
    const ai = openai();

    const recentPosts = (await ctx.runQuery(
      internal.generateHelpers.getRecentPosts,
      {
        userId: args.userId,
        limit: 5,
      },
    )) as PostLike[];

    if (recentPosts.length === 0) {
      return "분석할 글이 없습니다.";
    }

    const sourceText = clipText(
      recentPosts
        .map((post, i) => {
          const text = post.summary
            ? clipText(post.summary, 260)
            : clipText(post.content, 600);
          return `[post ${i + 1}] ${text}`;
        })
        .join("\n\n"),
      3600,
    );

    const response = await ai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "Analyze writing style only. Ignore topic. Return one compact paragraph under 180 words describing tone, sentence rhythm, ending patterns, opening/closing habits, and lexical preferences. Return in Korean.",
        },
        {
          role: "user",
          content: sourceText,
        },
      ],
      max_tokens: 260,
    });

    const styleProfile = getMessageText(response);

    await ctx.runMutation(internal.generateHelpers.updateStyleProfile, {
      userId: args.userId,
      styleProfile,
    });

    return styleProfile;
  },
});
