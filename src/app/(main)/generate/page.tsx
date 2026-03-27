"use client";

import { useReducer, useCallback, useEffect, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { api } from "../../../../convex/_generated/api";
import ImageUploader from "@/components/image-uploader";
import type { GenerationResult, ResultData } from "@/types/post";
import { useResultEditor } from "@/hooks/useResultEditor";
import {
  REVIEW_MAX_IMAGE_COUNT,
  REVIEW_MIN_IMAGE_COUNT,
  SINGLE_IMAGE_COUNT,
} from "../../../../convex/constants";

type PageState =
  | { step: "upload"; imageUrls: string[]; allReady: boolean }
  | { step: "generating"; imageCount: number }
  | { step: "result"; result: ResultData };

type Action =
  | { type: "SET_IMAGES"; imageUrls: string[]; allReady: boolean }
  | { type: "START_GENERATING" }
  | { type: "SET_RESULT"; result: ResultData }
  | { type: "RESTORE_UPLOAD"; imageUrls: string[]; allReady: boolean }
  | { type: "RESET" };

const initialState: PageState = {
  step: "upload",
  imageUrls: [],
  allReady: false,
};

function reducer(state: PageState, action: Action): PageState {
  switch (action.type) {
    case "SET_IMAGES":
      if (state.step !== "upload") return state;
      return {
        ...state,
        imageUrls: action.imageUrls,
        allReady: action.allReady,
      };
    case "START_GENERATING":
      if (state.step !== "upload") return state;
      return { step: "generating", imageCount: state.imageUrls.length };
    case "SET_RESULT":
      return { step: "result", result: action.result };
    case "RESTORE_UPLOAD":
      return {
        step: "upload",
        imageUrls: action.imageUrls,
        allReady: action.allReady,
      };
    case "RESET":
      return initialState;
    default:
      return state;
  }
}

export default function GeneratePage() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [memo, setMemo] = useState("");
  const [keywordInput, setKeywordInput] = useState("");
  const [openingMode, setOpeningMode] = useState<"off" | "preferred" | "strict">("off");
  const [fixedOpening, setFixedOpening] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const createBlogFromImage = useAction(api.generate.createBlogFromImage);
  const createBlogReview = useAction(api.generate.createBlogReview);
  const styleProfile = useQuery(api.styleProfiles.getMyStyleProfile);
  const upsertStyleProfile = useMutation(api.styleProfiles.upsertMyStyleProfile);
  const isStyleProfileLoading = styleProfile === undefined;

  useEffect(() => {
    if (!styleProfile) return;
    setOpeningMode(styleProfile.openingMode);
    setFixedOpening(styleProfile.fixedOpening ?? "");
  }, [styleProfile]);

  const handleImagesChange = useCallback((urls: string[], ready: boolean) => {
    dispatch({ type: "SET_IMAGES", imageUrls: urls, allReady: ready });
  }, []);

  const handleGenerate = async () => {
    if (state.step !== "upload" || state.imageUrls.length === 0) return;
    const previousUploadState = {
      imageUrls: [...state.imageUrls],
      allReady: state.allReady,
    };

    dispatch({ type: "START_GENERATING" });
    try {
      const keywords = keywordInput
        .split(",")
        .map((k) => k.trim())
        .filter((k) => k.length > 0);

      let result: GenerationResult;
      if (state.imageUrls.length === SINGLE_IMAGE_COUNT) {
        result = await createBlogFromImage({ imageUrl: state.imageUrls[0] });
      } else {
        result = await createBlogReview({
          imageUrls: state.imageUrls,
          memo: memo.trim() || undefined,
          keywords: keywords.length > 0 ? keywords : undefined,
        });
      }

      if (!result.ok) {
        if (result.retryable) {
          dispatch({
            type: "RESTORE_UPLOAD",
            imageUrls: previousUploadState.imageUrls,
            allReady: previousUploadState.allReady,
          });
        } else {
          dispatch({ type: "RESET" });
        }
        toast.error(`[${result.failedStage}] ${result.message}`);
        return;
      }

      dispatch({ type: "SET_RESULT", result });
    } catch (e) {
      dispatch({
        type: "RESTORE_UPLOAD",
        imageUrls: previousUploadState.imageUrls,
        allReady: previousUploadState.allReady,
      });
      toast.error(
        e instanceof Error ? e.message : "글 생성에 실패했습니다. 다시 시도해 주세요."
      );
    }
  };

  const handleSaveStyleProfile = async () => {
    if (isStyleProfileLoading) {
      toast.error("문체 설정을 불러오는 중입니다. 잠시 후 다시 시도해 주세요.");
      return;
    }
    if (openingMode === "strict" && fixedOpening.trim().length === 0) {
      toast.error("strict 모드에서는 고정 시작문을 입력해 주세요.");
      return;
    }
    setSavingProfile(true);
    try {
      await upsertStyleProfile({
        openingMode,
        fixedOpening: fixedOpening.trim() || undefined,
      });
      toast.success("문체 설정을 저장했습니다.");
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "문체 설정 저장 중 오류가 발생했습니다."
      );
    } finally {
      setSavingProfile(false);
    }
  };

  const canGenerate =
    state.step === "upload" &&
    state.allReady &&
    state.imageUrls.length > 0 &&
    state.imageUrls.length <= REVIEW_MAX_IMAGE_COUNT;

  if (state.step === "upload") {
    return (
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
          이미지로 글 생성
        </h2>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          이미지 1장이면 단일 글, {REVIEW_MIN_IMAGE_COUNT}~{REVIEW_MAX_IMAGE_COUNT}
          장이면 리뷰 글을 생성합니다.
        </p>
        <ImageUploader onImagesChange={handleImagesChange} />
        <textarea
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
          placeholder="메모(선택). 리뷰 글 생성 시 반영됩니다."
          rows={2}
          className="w-full resize-none rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-800 placeholder-zinc-400 outline-none focus:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:placeholder-zinc-500 dark:focus:border-zinc-500"
        />
        <input
          type="text"
          value={keywordInput}
          onChange={(e) => setKeywordInput(e.target.value)}
          placeholder="키워드(쉼표 구분, 선택)"
          className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-800 placeholder-zinc-400 outline-none focus:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:placeholder-zinc-500 dark:focus:border-zinc-500"
        />
        <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-zinc-900/60">
          <p className="mb-2 text-xs font-medium text-zinc-600 dark:text-zinc-300">
            도입구/문체 설정
          </p>
          <div className="mb-2 grid grid-cols-3 gap-2 text-xs">
            {(["off", "preferred", "strict"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setOpeningMode(mode)}
                className={`rounded border px-2 py-1 ${
                  openingMode === mode
                    ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
                    : "border-zinc-300 bg-white text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                }`}
              >
                {mode}
              </button>
            ))}
          </div>
          <input
            type="text"
            value={fixedOpening}
            onChange={(e) => setFixedOpening(e.target.value)}
            placeholder="예: 안녕하세요! 맛집 다니는 유자입니다🥰"
            className="mb-2 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-800 placeholder-zinc-400 outline-none focus:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:placeholder-zinc-500 dark:focus:border-zinc-500"
          />
          <button
            type="button"
            onClick={handleSaveStyleProfile}
            disabled={savingProfile || isStyleProfileLoading}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-100 disabled:opacity-40 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
          >
            {savingProfile
              ? "저장 중..."
              : isStyleProfileLoading
                ? "문체 설정 로딩 중..."
                : "문체 설정 저장"}
          </button>
        </div>
        <button
          onClick={handleGenerate}
          disabled={!canGenerate}
          className="w-full rounded-lg bg-zinc-900 px-4 py-3 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          {state.imageUrls.length > 0
            ? `${state.imageUrls.length}장의 이미지로 글 생성하기`
            : "이미지를 업로드해 주세요"}
        </button>
      </div>
    );
  }

  if (state.step === "generating") {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-900 dark:border-zinc-600 dark:border-t-zinc-100" />
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          AI가 글을 생성하고 있습니다...
        </p>
        <p className="text-xs text-zinc-400 dark:text-zinc-500">
          이미지 {state.imageCount}장 분석 → RAG → 초안 생성
        </p>
      </div>
    );
  }

  return (
    <ResultView
      result={state.result}
      onReset={() => dispatch({ type: "RESET" })}
    />
  );
}

function ResultView({
  result,
  onReset,
}: {
  result: ResultData;
  onReset: () => void;
}) {
  const router = useRouter();
  const {
    editMode,
    draft,
    hasChanges,
    saving,
    copied,
    startEdit,
    cancelEdit,
    updateCaption,
    updateIntro,
    updateOutro,
    updateContent,
    handleSave,
    handleCopy,
  } = useResultEditor(result);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
          생성 결과
        </h2>
        <button
          onClick={onReset}
          className="text-sm text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
        >
          새로 생성
        </button>
      </div>

      <div className="space-y-6 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        {draft.kind === "single" ? (
          editMode ? (
            <textarea
              value={draft.content}
              onChange={(e) => updateContent(e.target.value)}
              className="w-full min-h-64 resize-y rounded-lg border border-zinc-200 bg-transparent p-3 text-sm leading-relaxed text-zinc-800 outline-none focus:border-zinc-400 dark:border-zinc-700 dark:text-zinc-200 dark:focus:border-zinc-500"
            />
          ) : (
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-800 dark:text-zinc-200">
              {draft.content}
            </p>
          )
        ) : (
          <>
            {editMode ? (
              <textarea
                value={draft.intro}
                onChange={(e) => updateIntro(e.target.value)}
                className="w-full resize-y rounded-lg border border-zinc-200 bg-transparent p-3 text-sm leading-relaxed text-zinc-800 outline-none focus:border-zinc-400 dark:border-zinc-700 dark:text-zinc-200 dark:focus:border-zinc-500"
                rows={3}
              />
            ) : (
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-800 dark:text-zinc-200">
                {draft.intro}
              </p>
            )}

            {draft.blocks.map((block, i) => (
              <div key={block.url} className="space-y-3">
                <img
                  src={block.url}
                  alt={`이미지 ${i + 1}`}
                  className="w-full rounded-lg object-cover"
                  style={{ maxHeight: 400 }}
                />
                {editMode ? (
                  <textarea
                    value={draft.blocks[i]?.caption ?? ""}
                    onChange={(e) => updateCaption(i, e.target.value)}
                    className="w-full resize-y rounded-lg border border-zinc-200 bg-transparent p-3 text-sm leading-relaxed text-zinc-800 outline-none focus:border-zinc-400 dark:border-zinc-700 dark:text-zinc-200 dark:focus:border-zinc-500"
                    rows={3}
                  />
                ) : (
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-800 dark:text-zinc-200">
                    {block.caption}
                  </p>
                )}
              </div>
            ))}

            {editMode ? (
              <textarea
                value={draft.outro}
                onChange={(e) => updateOutro(e.target.value)}
                className="w-full resize-y rounded-lg border border-zinc-200 bg-transparent p-3 text-sm leading-relaxed text-zinc-800 outline-none focus:border-zinc-400 dark:border-zinc-700 dark:text-zinc-200 dark:focus:border-zinc-500"
                rows={3}
              />
            ) : (
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-800 dark:text-zinc-200">
                {draft.outro}
              </p>
            )}
          </>
        )}
      </div>

      <div className="flex items-center gap-3">
        {editMode ? (
          <>
            <button
              onClick={handleSave}
              disabled={saving || !hasChanges}
              className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
            >
              {saving ? "저장 중..." : "수정 저장"}
            </button>
            <button
              onClick={cancelEdit}
              className="rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
            >
              취소
            </button>
          </>
        ) : (
          <>
            <button
              onClick={startEdit}
              className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
            >
              수정하기
            </button>
            <button
              onClick={handleCopy}
              className="rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
            >
              {copied ? "복사 완료!" : "복사하기"}
            </button>
            <button
              onClick={() => router.push(`/posts/${result.postId}`)}
              className="text-sm text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
            >
              글 보기 →
            </button>
          </>
        )}
      </div>
    </div>
  );
}
